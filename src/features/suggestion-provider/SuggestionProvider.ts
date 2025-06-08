import QuickDates from '../../main';
import { moment, Notice, TFile } from 'obsidian';
import { getOrCreateDailyNote, DateFormatter, createDailyNoteLink, getAllDailyNotesSafe, KeyboardHandler, debug, info, warn, error, registerLoggerClass } from '@/utils';
import { DateParser } from './DateParser';
import { InsertMode, ContentFormat } from '@/types';
import { Link } from 'obsidian-dev-utils/obsidian';
import { QuickDatesSettings } from '@/settings';
import { CLASSES } from '@/constants';
import { renderSuggestionContent, updatePreviewContent } from './render';
import { EditorSuggester } from '../editor-suggester';
import { OpenDailyNoteModal } from '../open-daily-note';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';

/**
 * Shared suggester for date suggestions. Handles rendering and updating of suggestions.
 */
export class SuggestionProvider {
	app: any; // Changed App to any
	plugin: QuickDates;
	// Context for rendering suggestions
	public contextProvider: { context?: { query: string }; query?: string } = {};
	currentElements: Map<string, HTMLElement> = new Map();
	// Parent UI references for closing
	private editorSuggesterRef: EditorSuggester | null = null;
	private openDailyModalRef: OpenDailyNoteModal | null = null;
	keyboardHandler: KeyboardHandler;
	isSuggesterOpen: boolean = false;
	private holidaySuggestions: string[] = [];
	
	// Performance optimization: Cache daily notes to avoid vault scanning on every keystroke
	private dailyNotesCache: Record<string, TFile> | null = null;
	private dailyNotesCacheTimestamp: number = 0;
	private readonly CACHE_DURATION_MS = 5000; // Cache for 5 seconds
	private cacheUpdatePromise: Promise<Record<string, TFile> | null> | null = null;
	constructor(app: any, plugin: QuickDates) { // Changed App to any
		debug(this, 'Initializing suggestion provider for date parsing and UI rendering');
		registerLoggerClass(this, 'SuggestionProvider');
		
		this.app = app;
		this.plugin = plugin;
		
		debug(this, 'Setting up keyboard handler for suggestion interactions');
		// Initialize keyboard handler without requiring a scope
		this.keyboardHandler = new KeyboardHandler(undefined, plugin.settings.plainTextByDefault);
		
		debug(this, 'Registering keyboard state change listener for dynamic suggestion updates');
		// Register for key state changes
		this.keyboardHandler.addKeyStateChangeListener(this.handleKeyStateChange);
		
		debug(this, 'Initializing holiday suggestions for locale-specific date options');
		// Initialize holiday suggestions
		this.initializeHolidaySuggestions();
		
		info(this, 'Suggestion provider ready for date parsing and rendering', {
			plainTextByDefault: plugin.settings.plainTextByDefault,
			holidayLocale: plugin.settings.holidayLocale,
			cacheEnabled: true,
			cacheDurationMs: this.CACHE_DURATION_MS
		});
		
		// Register vault events to invalidate cache when files are added/deleted/renamed
		this.registerVaultEvents();
	}
	
	/**
	 * Initialize holiday suggestions from the EnhancedDateParser
	 */
	private initializeHolidaySuggestions(): void {
		const locale = this.plugin.settings.holidayLocale;
		if (!locale) {
			this.holidaySuggestions = [];
			DateParser.setLocale('', this); // Ensure parser disables holidays
			return;
		}
		try {
			DateParser.setLocale(locale, this);
			this.holidaySuggestions = DateParser.getHolidayNames().sort();
		} catch (error) {
			console.error('Failed to initialize holiday suggestions:', error);
			this.holidaySuggestions = [];
		}
	}
	
	/**
	 * Update holiday locale based on user settings
	 */
	updateHolidayLocale(locale: string): void {
		if (!locale) {
			this.holidaySuggestions = [];
			DateParser.setLocale('', this);
			return;
		}
		try {
			DateParser.setLocale(locale, this);
			this.initializeHolidaySuggestions();
		} catch (error) {
			console.error('Failed to update holiday locale:', error);
			new Notice(`Failed to set holiday locale: ${locale}. Using US locale as fallback.`, 3000);
			DateParser.setLocale('US', this);
			this.initializeHolidaySuggestions();
		}
	}
	
	/**
	 * Handle key state changes by updating UI
	 */
	handleKeyStateChange = (): void => {
		// Only update previews if suggester is open
		if (this.isSuggesterOpen) {
			// Debounce frequent updates to reduce performance impact
			if (this.updatePreviewsTimeout) {
				clearTimeout(this.updatePreviewsTimeout);
			}
			this.updatePreviewsTimeout = setTimeout(() => {
				this.updateAllPreviews();
				this.updatePreviewsTimeout = null;
			}, 50); // 50ms debounce
		}
	};
	
	private updatePreviewsTimeout: NodeJS.Timeout | null = null;

	// Handle daily note opening actions
	public async handleDailyNoteAction(e: KeyboardEvent, newTab: boolean, context?: any) {
		e.preventDefault();
		e.stopImmediatePropagation();

		// Remove trigger and query text
		this.cleanupTriggerPhrase(context);
		// Get selected suggestion text
		const selEl = document.querySelector(`.is-selected .${CLASSES.suggestionContainer}`) as HTMLElement;
		const raw = selEl?.getAttribute('data-suggestion');
		if (!raw) return;

		// Attempt to parse as date for daily note
		const parsed = DateParser.parseDate(raw, this);
		if (parsed) {
			const m = moment(parsed);
			const file = await getOrCreateDailyNote(this.app, m, false);
			if (file) {
				await this.app.workspace.openLinkText(file.path, '', newTab);
			}
		} else if (context?.file) {
			// Open as regular note by resolving link path
			const dest = this.app.metadataCache.getFirstLinkpathDest(raw, context.file.path);
			if (dest instanceof TFile) {
				await this.app.workspace.openLinkText(dest.path, '', newTab);
			} else {
				new Notice(`Note not found: ${raw}`, 3000);
			}
		}
		this.closeSuggester();
	}
	
	public cleanupTriggerPhrase(context?: any): void { // context is EditorSuggestContext from EditorSuggester
		if (context?.editor && context.start && context.end) {
			const editor = context.editor;
			// Replace the original trigger phrase and query using context.start and context.end
			// This range covers the trigger and the query text.
			editor.replaceRange('', context.start, context.end);
		}
	}    unload() {
		this.keyboardHandler.removeKeyStateChangeListener(this.handleKeyStateChange);
		this.currentElements.clear();
		this.keyboardHandler.unload();
		this.isSuggesterOpen = false;
		
		// Clear any pending preview update timeouts
		if (this.updatePreviewsTimeout) {
			clearTimeout(this.updatePreviewsTimeout);
			this.updatePreviewsTimeout = null;
		}
		
		// Clean up vault event listeners
		if (this.app?.vault) {
			this.app.vault.off('create', this.invalidateCache);
			this.app.vault.off('delete', this.invalidateCache);
			this.app.vault.off('rename', this.invalidateCache);
		}
		
		// Clear cache
		this.invalidateCache();
	}

	updateAllPreviews() {
		if (!this.isSuggesterOpen) return;
		
		// Process preview updates in batches to avoid blocking the UI
		const entries = Array.from(this.currentElements.entries());
		const batchSize = 3; // Process 3 suggestions at a time
		
		const processBatch = (startIndex: number) => {
			const endIndex = Math.min(startIndex + batchSize, entries.length);
			for (let i = startIndex; i < endIndex; i++) {
				const [item, el] = entries[i];
				if (el.isConnected) {
					this.updatePreviewContent(item, el);
				}
			}
			
			// Schedule next batch if there are more items
			if (endIndex < entries.length) {
				requestAnimationFrame(() => processBatch(endIndex));
			}
		};
		
		if (entries.length > 0) {
			processBatch(0);
		}
	}

	/**
	 * Update settings and force re-render
	 */
	updateSettings(settings: { 
		keyBindings?: Record<string, string>; 
		plainTextByDefault?: boolean;
		holidayLocale?: string;
	}): void {
		this.keyboardHandler.update(settings);
		
		if (typeof settings.holidayLocale === 'string') { // Ensure holidayLocale is a string
			this.updateHolidayLocale(settings.holidayLocale);
		}
		
		if (this.isSuggesterOpen) {
			this.updateAllPreviews();
		}
	}

	getDateSuggestions(context: { query: string }, initialSuggestionsFromCaller?: string[]): string[] {
		this.isSuggesterOpen = true;

		const rawQuery = context.query; 
		const lowerQuery = rawQuery.toLowerCase().trim();

		const baseInitialSuggestions = initialSuggestionsFromCaller || []; 

		const uniqueSuggestionsList: string[] = [];
		const processedLowerCaseSuggestions = new Set<string>();

		const addSuggestionIfNotDuplicate = (suggestion: string) => {
			const lowerSuggestion = suggestion.toLowerCase();
			if (!processedLowerCaseSuggestions.has(lowerSuggestion)) {
				processedLowerCaseSuggestions.add(lowerSuggestion);
				uniqueSuggestionsList.push(suggestion);
			}
		};

		// 1. Add initial suggestions if query is empty or they match
		if (!lowerQuery) {
			baseInitialSuggestions.forEach(addSuggestionIfNotDuplicate);
		} else {
			baseInitialSuggestions.forEach(s => {
				if (s.toLowerCase().includes(lowerQuery)) {
					addSuggestionIfNotDuplicate(s);
				}
			});
		}
		
		// 2. Add pattern-based suggestions from EnhancedDateParser if there's a query
		if (rawQuery.trim()) {
			const patternSuggestions = DateParser.getPatternSuggestions(rawQuery.trim(), this);
			patternSuggestions.forEach(addSuggestionIfNotDuplicate);
		}

		// 3. Add matching holiday suggestions
		if (lowerQuery.length >= 1 && this.holidaySuggestions.length > 0 && this.plugin.settings.holidayLocale) { 
			const matchingHolidays = this.holidaySuggestions
				.filter(holiday => holiday.toLowerCase().includes(lowerQuery))
				.slice(0, 5); 
			matchingHolidays.forEach(addSuggestionIfNotDuplicate);
		}
		
		let finalSuggestions = [...uniqueSuggestionsList]; // Use the de-duplicated list

		// If the query is not empty, filter all collected suggestions again to ensure relevance
		// This secondary filter is on the already de-duplicated list.
		if (lowerQuery) {
			finalSuggestions = finalSuggestions.filter(s => s.toLowerCase().includes(lowerQuery));
		}
		
		// 4. Fallback if no suggestions found and query is not empty
		if (finalSuggestions.length === 0 && rawQuery.trim()) {
			const capitalizedInput = rawQuery.trim().charAt(0).toUpperCase() + rawQuery.trim().slice(1);
			return [capitalizedInput];
		}
		
		// Sort suggestions:
		finalSuggestions.sort((a, b) => {
			const aLower = a.toLowerCase();
			const bLower = b.toLowerCase();

			const aIsExactMatch = aLower === lowerQuery;
			const bIsExactMatch = bLower === lowerQuery;
			if (aIsExactMatch && !bIsExactMatch) return -1;
			if (!aIsExactMatch && bIsExactMatch) return 1;

			const aStartsWithQuery = aLower.startsWith(lowerQuery);
			const bStartsWithQuery = bLower.startsWith(lowerQuery);
			if (aStartsWithQuery && !bStartsWithQuery) return -1;
			if (!aStartsWithQuery && bStartsWithQuery) return 1;
			
			// If both start with query or neither, sort by length then alphabetically
			if (aStartsWithQuery && bStartsWithQuery) {
				if (a.length !== b.length) {
					return a.length - b.length;
				}
			}
			return aLower.localeCompare(bLower);
		});

		return finalSuggestions.slice(0, 15); // Limit total suggestions
	}

	renderSuggestionContent(item: string, el: HTMLElement, context?: any) {
		// Show suggestions; no contextProvider needed
		this.isSuggesterOpen = true;
		this.keyboardHandler.resetModifierKeys();
		renderSuggestionContent(this, item, el, context);
	}

	updatePreviewContent(item: string, container: HTMLElement) {
		updatePreviewContent(this, item, container);
	}

	/** Register the EditorSuggester that created this provider */
	public setEditorSuggesterRef(ref: EditorSuggester) {
		this.editorSuggesterRef = ref;
	}

	/** Register the OpenDailyNoteModal that created this provider */
	public setOpenDailyModalRef(ref: OpenDailyNoteModal) {
		this.openDailyModalRef = ref;
	}

	// Helper method to close the suggester UI
	private closeSuggester() {
		this.isSuggesterOpen = false;
		// Close the appropriate parent UI
		if (this.openDailyModalRef) {
			this.openDailyModalRef.close();
		} else if (this.editorSuggesterRef) {
			this.editorSuggesterRef.close();
		}
	}
	
	getKeyboardHandler(): KeyboardHandler {
		return this.keyboardHandler;
	}

	/**
	 * Public method to get cached daily notes for use by other components
	 */
	public async getDailyNotes(): Promise<Record<string, TFile> | null> {
		return this.getCachedDailyNotes();
	}

	public getFinalInsertText(
		itemText: string,
		insertMode: InsertMode,
		contentFormat: ContentFormat,
		settings: QuickDatesSettings,
		activeFile: TFile,
		app: any // Changed App to any
	): string {
		const parsedDate = DateParser.parseDate(itemText, this);

		if (!parsedDate) { // itemText is not a parsable date string
			if (insertMode === InsertMode.PLAINTEXT) {
				return itemText;
			} else { // InsertMode.LINK
				const alias = (contentFormat === ContentFormat.SUGGESTION_TEXT) ? itemText : undefined;
				return Link.generateMarkdownLink({
					app,
					targetPathOrFile: itemText, // Treat itemText as the note name
					sourcePathOrFile: activeFile.path,
					alias: alias,
					isNonExistingFileAllowed: true,
					isEmbed: false
				});
			}
		}

		const momentDate = moment(parsedDate);
		const dailySettings = getDailyNoteSettings();

		if (insertMode === InsertMode.PLAINTEXT) {
			return DateFormatter.getFormattedDateText(
				itemText,
				momentDate,
				settings,
				contentFormat,
				dailySettings,
				this
			);
		} else { // InsertMode.LINK for a parsedDate
			const forceTextAsAlias = contentFormat === ContentFormat.SUGGESTION_TEXT;
			const useAlternateFormatForAlias = contentFormat === ContentFormat.ALTERNATE;
			const forceNoAlias = contentFormat === ContentFormat.DAILY_NOTE;

			return createDailyNoteLink(
				app,
				settings,
				activeFile,
				itemText, 
				forceTextAsAlias,
				useAlternateFormatForAlias,
				forceNoAlias
			);
		}
	}

	/**
	 * Register vault events to invalidate cache when files are added/deleted/renamed
	 */
	private registerVaultEvents(): void {
		if (this.app?.vault) {
			this.app.vault.on('create', this.invalidateCache.bind(this));
			this.app.vault.on('delete', this.invalidateCache.bind(this));
			this.app.vault.on('rename', this.invalidateCache.bind(this));
		}
	}
	
	/**
	 * Invalidate the daily notes cache
	 */
	private invalidateCache(): void {
		this.dailyNotesCache = null;
		this.dailyNotesCacheTimestamp = 0;
		this.cacheUpdatePromise = null;
	}
	
	/**
	 * Get daily notes with caching to avoid repeated vault scans
	 */
	private async getCachedDailyNotes(): Promise<Record<string, TFile> | null> {
		const now = Date.now();
		
		// Return cached data if it's still valid
		if (this.dailyNotesCache && (now - this.dailyNotesCacheTimestamp) < this.CACHE_DURATION_MS) {
			return this.dailyNotesCache;
		}
		
		// If there's already a cache update in progress, wait for it
		if (this.cacheUpdatePromise) {
			return this.cacheUpdatePromise;
		}
		
		// Start a new cache update
		this.cacheUpdatePromise = this.updateDailyNotesCache();
		const result = await this.cacheUpdatePromise;
		this.cacheUpdatePromise = null;
		return result;
	}
	
	/**
	 * Update the daily notes cache
	 */
	private async updateDailyNotesCache(): Promise<Record<string, TFile> | null> {
		try {
			const result = await getAllDailyNotesSafe(this.app, true, true);
			this.dailyNotesCache = result;
			this.dailyNotesCacheTimestamp = Date.now();
			return result;
		} catch (error) {
			console.error('Failed to update daily notes cache:', error);
			return null;
		}
	}
}
