import QuickDates from '../../main';
import { moment, Notice, TFile, MarkdownView, App } from 'obsidian';
import { DateFormatter, KeyboardHandler, loggerDebug, loggerInfo, loggerWarn, loggerError, registerLoggerClass } from '@/utils';
import { DailyNotesService } from '@/services';
import { DateParser } from './DateParser';
import { InsertMode, ContentFormat } from '@/types';
import { Link } from 'obsidian-dev-utils/obsidian';
import { QuickDatesSettings } from '@/settings';
import { CLASSES } from '@/constants';
import { SuggestionRenderer } from './SuggestionRenderer';
import { EditorSuggester } from '../editor-suggester';
import { OpenDailyNoteModal } from '../open-daily-note';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';

/**
 * Shared suggester for date suggestions. Handles rendering and updating of suggestions.
 */
export class SuggestionProvider {
	app: App;
	plugin: QuickDates;
	// Context for rendering suggestions
	public contextProvider: { context?: { query: string }; query?: string } = {};
	currentElements: Map<string, HTMLElement> = new Map();
	// Parent UI references for closing
	private editorSuggesterRef: EditorSuggester | null = null;
	private openDailyModalRef: OpenDailyNoteModal | null = null;	keyboardHandler: KeyboardHandler;
	private ownKeyboardHandler: boolean; // Track if we own the keyboard handler
	isSuggesterOpen: boolean = false;
	private parsedDateCache: Map<string, Date | null> = new Map(); // Cache for parsed dates
	private formattedTextCache: Map<string, string> = new Map(); // Cache for formatted text
	private holidaySuggestions: string[] = [];
	private renderer: SuggestionRenderer;
	private dailyNotesService: DailyNotesService;
	
	// Performance optimization: Cache daily notes to avoid vault scanning on every keystroke
	private dailyNotesCache: Record<string, TFile> | null = null;
	private dailyNotesCacheTimestamp: number = 0;	private readonly CACHE_DURATION_MS = 5000; // Cache for 5 seconds
	private cacheUpdatePromise: Promise<Record<string, TFile> | null> | null = null;
	constructor(app: App, plugin: QuickDates, dailyNotesService: DailyNotesService, keyboardHandler?: KeyboardHandler) {
		loggerDebug(this, 'Initializing suggestion provider for date parsing and UI rendering');
		registerLoggerClass(this, 'SuggestionProvider');
		
		this.app = app;
		this.plugin = plugin;
		this.dailyNotesService = dailyNotesService;
		loggerDebug(this, 'Setting up keyboard handler for suggestion interactions');
		// Use provided keyboard handler or create a new one
		this.keyboardHandler = keyboardHandler || new KeyboardHandler(undefined, plugin.settings.plainTextByDefault);
		this.ownKeyboardHandler = !keyboardHandler; // We own it if we created it
				loggerDebug(this, 'Initializing suggestion renderer for UI rendering');
		// Initialize the suggestion renderer
		this.renderer = new SuggestionRenderer(dailyNotesService);
		loggerDebug(this, 'Registering keyboard state change listener for dynamic suggestion updates');
		// Don't register keyboard listeners immediately - they'll be enabled when suggester opens
		// this.keyboardHandler.addKeyStateChangeListener(this.handleKeyStateChange);
		
		loggerDebug(this, 'Initializing holiday suggestions for locale-specific date options');
		// Initialize holiday suggestions
		this.initializeHolidaySuggestions();
		
		loggerInfo(this, 'Suggestion provider ready for date parsing and rendering', {
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
			// Only update suggestions if locale actually changed
			if (DateParser.getCurrentLocale() === locale) {
				this.holidaySuggestions = DateParser.getHolidayNames().sort();
			}
		} catch (error) {
			console.error('Failed to update holiday locale:', error);
			new Notice(`Failed to set holiday locale: ${locale}. Using US locale as fallback.`, 3000);
			DateParser.setLocale('US', this);
			this.holidaySuggestions = DateParser.getHolidayNames().sort();
		}
	}
	/**
	 * Handle key state changes by updating UI
	 */
	handleKeyStateChange = (): void => {
		// Only update previews if suggester is open AND we're in edit mode
		if (this.isSuggesterOpen && this.isInEditMode()) {
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
			const file = await this.dailyNotesService.getOrCreateDailyNote(m, false);
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
	}
	unload() {
		this.disableKeyboardListeners();
		this.currentElements.clear();
		// Only unload keyboard handler if we own it (not shared)
		if (this.ownKeyboardHandler) {
			this.keyboardHandler.unload();
		}
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
	 */	updateSettings(settings: { 
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
	}getDateSuggestions(context: { query: string }, initialSuggestionsFromCaller?: string[]): string[] {
		this.isSuggesterOpen = true;
		this.clearParsedDateCache(); // Clear cache for new suggestions
		this.enableKeyboardListeners();

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
	}	renderSuggestionContent(item: string, el: HTMLElement, context?: any) {
		// Show suggestions; no contextProvider needed
		this.isSuggesterOpen = true;
		this.enableKeyboardListeners();
		this.keyboardHandler.resetModifierKeys();
		this.renderer.renderSuggestionContent(this, item, el, context);
	}

	updatePreviewContent(item: string, container: HTMLElement) {
		this.renderer.updatePreviewContent(this, item, container);
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
		this.disableKeyboardListeners();
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

	public getFinalInsertText(		itemText: string,
		insertMode: InsertMode,
		contentFormat: ContentFormat,
		settings: QuickDatesSettings,
		activeFile: TFile,
		app: App
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
			const forceNoAlias = contentFormat === ContentFormat.DAILY_NOTE;			return this.dailyNotesService.createDailyNoteLink(
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
			const result = await this.dailyNotesService.getAllDailyNotesSafe(true, true);
			this.dailyNotesCache = result;
			this.dailyNotesCacheTimestamp = Date.now();
			return result;
		} catch (error) {
			console.error('Failed to update daily notes cache:', error);
			return null;
		}
	}
	/**
	 * Check if we're currently in edit mode (not reading mode)
	 */
	private isInEditMode(): boolean {
		const activeLeaf = this.app.workspace.activeLeaf;
		if (!activeLeaf?.view?.getViewType()) return false;
		
		// Check if it's a markdown view and in edit mode
		if (activeLeaf.view.getViewType() === 'markdown') {
			const markdownView = activeLeaf.view;
			// Type guard to check if it's a MarkdownView
			if (markdownView && 'getMode' in markdownView) {
				return (markdownView as MarkdownView).getMode() === 'source';
			}
		}
		
		return false;
	}

	/**
	 * Enable keyboard listeners when suggester becomes active
	 */
	private enableKeyboardListeners(): void {
		if (!this.keyboardListenersEnabled && this.isInEditMode()) {
			this.keyboardHandler.addKeyStateChangeListener(this.handleKeyStateChange);
			this.keyboardListenersEnabled = true;
		}
	}

	/**
	 * Disable keyboard listeners when suggester becomes inactive
	 */
	private disableKeyboardListeners(): void {
		if (this.keyboardListenersEnabled) {
			this.keyboardHandler.removeKeyStateChangeListener(this.handleKeyStateChange);
			this.keyboardListenersEnabled = false;
		}
	}

	private keyboardListenersEnabled: boolean = false;
	/**
	 * Get a cached parsed date or parse and cache it
	 */
	getCachedParsedDate(item: string): Date | null {
		if (!this.parsedDateCache.has(item)) {
			const parsedDate = DateParser.parseDate(item, this);
			this.parsedDateCache.set(item, parsedDate);
		}
		return this.parsedDateCache.get(item) || null;
	}

	/**
	 * Get cached formatted text or format and cache it
	 */
	getCachedFormattedText(cacheKey: string, formatFunction: () => string): string {
		if (!this.formattedTextCache.has(cacheKey)) {
			const formattedText = formatFunction();
			this.formattedTextCache.set(cacheKey, formattedText);
		}
		return this.formattedTextCache.get(cacheKey) || '';
	}

	/**
	 * Clear the parsed date cache (call when suggestion list changes)
	 */
	clearParsedDateCache(): void {
		this.parsedDateCache.clear();
		this.formattedTextCache.clear();
	}
}
