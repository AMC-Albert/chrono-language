import QuickDates from '../../main';
import { moment, Notice, TFile, MarkdownView, App } from 'obsidian';
import { DateFormatter, KeyboardHandler } from '@/utils';
import { getDailyNoteSettings, getDailyNote, DEFAULT_DAILY_NOTE_FORMAT } from 'obsidian-daily-notes-interface';
import { DailyNotesService } from '@/services';
import { DateParser } from './DateParser';
import { InsertMode, ContentFormat } from '@/types';
import { Link } from 'obsidian-dev-utils/obsidian';
import { QuickDatesSettings } from '@/settings';
import { CLASSES } from '@/constants';
import { SuggestionRenderer } from './SuggestionRenderer';
import { EditorSuggester } from '../editor-suggester';
import { OpenDailyNoteModal } from '../open-daily-note';

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
	// Pre-computed cache for common initial suggestions
	private initialSuggestionsCache: Map<string, {
		parsedDate: Date | null;
		formattedText: Map<string, string>; // keyed by insert mode + content format combination
	}> = new Map();
	
	private holidaySuggestions: string[] = [];
	private renderer: SuggestionRenderer;
	private dailyNotesService: DailyNotesService;
	// Performance optimization: Cache daily notes to avoid vault scanning on every keystroke
	private dailyNotesCache: Record<string, TFile> | null = null;
	private dailyNotesCacheTimestamp: number = 0;
	private readonly CACHE_DURATION_MS = 300000; // Cache for 5 minutes (300 seconds)
	private cacheUpdatePromise: Promise<Record<string, TFile> | null> | null = null;

	constructor(app: App, plugin: QuickDates, dailyNotesService: DailyNotesService, keyboardHandler?: KeyboardHandler) {
		this.app = app;
		this.plugin = plugin;
		this.dailyNotesService = dailyNotesService;
		
		// Use provided keyboard handler or create a new one
		this.keyboardHandler = keyboardHandler || new KeyboardHandler(undefined, plugin.settings.plainTextByDefault);
		this.ownKeyboardHandler = !keyboardHandler; // We own it if we created it
		
		// Initialize the suggestion renderer
		this.renderer = new SuggestionRenderer(dailyNotesService);
		
		// Pre-compute common initial suggestions for faster rendering
		this.preComputeInitialSuggestions();
		
		// Force a warmup to ensure cache is populated
		setTimeout(() => {
			this.warmCache();
			// Also warm up the daily notes cache in the background
			this.updateCacheInBackground();
		}, 100);
		
		// Don't register keyboard listeners immediately - they'll be enabled when suggester opens
		// this.keyboardHandler.addKeyStateChangeListener(this.handleKeyStateChange);
		
		// Initialize holiday suggestions
		this.initializeHolidaySuggestions();
		
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
		
		// Refresh pre-cached suggestions when settings change
		this.refreshPreCachedSuggestions();
		
		if (this.isSuggesterOpen) {
			this.updateAllPreviews();
		}
	}

	getDateSuggestions(context: { query: string }, initialSuggestionsFromCaller?: string[]): string[] {
		this.isSuggesterOpen = true;
		// Don't clear cache - we want to preserve pre-cached suggestions for performance
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
	}

	/**
	 * Manually trigger cache warming
	 */
	public warmCache(): void {
		this.preComputeInitialSuggestions();
	}

	/**
	 * Cached wrapper for getFormattedDateText that uses pre-computed values when available
	 */
	public getFormattedDateText(
		itemText: string,
		momentDate: moment.Moment,
		settings: QuickDatesSettings,
		contentFormat: ContentFormat,
		dailySettings: any,
		insertMode?: InsertMode // Add insertMode parameter
	): string {
		// Get current insert mode if not provided
		const currentInsertMode = insertMode || this.keyboardHandler.getEffectiveInsertModeAndFormat().insertMode;
		
		// Use the correct key format: InsertMode-ContentFormat
		const cacheKey = `${currentInsertMode}-${contentFormat}`;
				// Check initial suggestions cache first for common items
		const cachedInitial = this.initialSuggestionsCache.get(itemText);
		if (cachedInitial) {
			if (cachedInitial.formattedText.has(cacheKey)) {
				const cached = cachedInitial.formattedText.get(cacheKey)!;
				return cached;
			}
		}
		
		// Check regular cache
		const fullCacheKey = `${itemText}-${cacheKey}`;
		if (this.formattedTextCache.has(fullCacheKey)) {
			const cached = this.formattedTextCache.get(fullCacheKey)!;
			return cached;
		}
		
		// Format and cache
		const formatted = DateFormatter.getFormattedDateText(
			itemText,
			momentDate,
			settings,
			contentFormat,
			dailySettings,
			this
		);
		
		this.formattedTextCache.set(fullCacheKey, formatted);
		return formatted;
	}

	renderSuggestionContent(item: string, el: HTMLElement, context?: any) {
		// Show suggestions; no contextProvider needed
		this.isSuggesterOpen = true;
		this.enableKeyboardListeners();
		// Don't reset modifier keys here - preserve the state that was active when triggering the suggester
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
		// Reset modifier keys when suggester closes to ensure clean state for next time
		this.keyboardHandler.resetModifierKeys();
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
		app: App
	): string {
		// Use cached parsed date if available
		const parsedDate = this.getCachedParsedDate(itemText);

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
			// Use cached formatted text if available
			return this.getFormattedDateText(
				itemText,
				momentDate,
				settings,
				contentFormat,
				dailySettings,
				insertMode // Pass the insert mode
			);
		} else { // InsertMode.LINK for a parsedDate
			const forceTextAsAlias = contentFormat === ContentFormat.SUGGESTION_TEXT;
			const useAlternateFormatForAlias = contentFormat === ContentFormat.ALTERNATE;
			const forceNoAlias = contentFormat === ContentFormat.DAILY_NOTE;
			return this.dailyNotesService.createDailyNoteLink(
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
			// Only invalidate cache for daily notes-related file changes
			this.app.vault.on('create', this.onFileChange.bind(this));
			this.app.vault.on('delete', this.onFileChange.bind(this));
			this.app.vault.on('rename', this.onFileRename.bind(this));
		}
	}
	
	/**
	 * Handle file creation and deletion events
	 */
	private onFileChange(file: TFile): void {
		if (this.isDailyNote(file)) {
			this.invalidateCache();
			// Optionally trigger a background cache update
			this.updateCacheInBackground();
		}
	}
	
	/**
	 * Handle file rename events
	 */
	private onFileRename(file: TFile, oldPath: string): void {
		if (this.isDailyNote(file) || this.isDailyNotePath(oldPath)) {
			this.invalidateCache();
			this.updateCacheInBackground();
		}
	}
	
	/**
	 * Check if a file is likely a daily note based on its path and name
	 */
	private isDailyNote(file: TFile): boolean {
		if (!file || file.extension !== 'md') return false;
		
		const dailyNoteSettings = getDailyNoteSettings();
		const format = dailyNoteSettings.format || DEFAULT_DAILY_NOTE_FORMAT;
		const folder = dailyNoteSettings.folder || '';
		
		// Check if file is in the daily notes folder
		if (folder && !file.path.startsWith(folder)) return false;
		
		// Check if filename matches daily note format pattern
		const basename = file.basename;
		// Simple heuristic: daily notes typically contain date patterns
		const datePattern = /\d{4}[-_]\d{2}[-_]\d{2}|\d{2}[-_]\d{2}[-_]\d{4}|\d{8}/;
		return datePattern.test(basename);
	}
	
	/**
	 * Check if a path is likely a daily note path
	 */
	private isDailyNotePath(path: string): boolean {
		if (!path || !path.endsWith('.md')) return false;
		
		const dailyNoteSettings = getDailyNoteSettings();
		const folder = dailyNoteSettings.folder || '';
		
		// Check if path is in the daily notes folder
		if (folder && !path.startsWith(folder)) return false;
		
		// Check if path contains date patterns
		const datePattern = /\d{4}[-_]\d{2}[-_]\d{2}|\d{2}[-_]\d{2}[-_]\d{4}|\d{8}/;
		return datePattern.test(path);
	}
	
	/**
	 * Update cache in the background without blocking
	 */
	private updateCacheInBackground(): void {
		// Defer cache update to avoid blocking current operations
		setTimeout(() => {
			this.getCachedDailyNotes().catch(() => {
				// Ignore errors, cache will be updated on next request
			});
		}, 100);
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

	/**
	 * Get cached parsed date if available, otherwise parse and cache
	 */
	public getCachedParsedDate(item: string): Date | null {
		// Check initial suggestions cache first for common items
		const cachedInitial = this.initialSuggestionsCache.get(item);
		if (cachedInitial) {
			return cachedInitial.parsedDate;
		}
		
		// Check regular cache
		if (this.parsedDateCache.has(item)) {
			return this.parsedDateCache.get(item)!;
		}
		
		// Parse and cache
		const parsed = DateParser.parseDate(item, this);
		this.parsedDateCache.set(item, parsed);
		return parsed;
	}
	
	/**
	 * Get cached formatted text if available, otherwise format and cache
	 */
	public getCachedOrFormattedText(
		item: string,
		insertMode: InsertMode,
		contentFormat: ContentFormat,
		momentDate: moment.Moment,
		settings: QuickDatesSettings,
		dailySettings: any
	): string {
		const cacheKey = `${insertMode}-${contentFormat}`;
		
		// Check initial suggestions cache first for common items
		const cachedInitial = this.initialSuggestionsCache.get(item);
		if (cachedInitial && cachedInitial.formattedText.has(cacheKey)) {
			return cachedInitial.formattedText.get(cacheKey)!;
		}
		
		// Check regular cache
		const fullCacheKey = `${item}-${cacheKey}`;
		if (this.formattedTextCache.has(fullCacheKey)) {
			return this.formattedTextCache.get(fullCacheKey)!;
		}
		
		// Format and cache
		let formatted: string;
		if (insertMode === InsertMode.PLAINTEXT) {
			formatted = DateFormatter.getFormattedDateText(
				item,
				momentDate,
				settings,
				contentFormat,
				dailySettings,
				this
			);
		} else {
			// For links, return the item text as-is since link formatting happens elsewhere
			formatted = item;
		}
		
		this.formattedTextCache.set(fullCacheKey, formatted);
		return formatted;
	}
	
	/**
	 * Pre-compute common initial suggestions to eliminate parsing delays
	 */
	private preComputeInitialSuggestions(): void {
		// Use the actual initial suggestions from settings, not hardcoded defaults
		const commonSuggestions = this.plugin.settings.initialEditorSuggestions || ['Today', 'Tomorrow', 'Yesterday'];
		
		for (const suggestion of commonSuggestions) {
			const parsedDate = DateParser.parseDate(suggestion, this);
			const formattedText = new Map<string, string>();
			
			// Pre-compute for all insert mode and format combinations
			const combinations = [
				{ insertMode: InsertMode.LINK, contentFormat: ContentFormat.PRIMARY },
				{ insertMode: InsertMode.LINK, contentFormat: ContentFormat.ALTERNATE },
				{ insertMode: InsertMode.LINK, contentFormat: ContentFormat.SUGGESTION_TEXT },
				{ insertMode: InsertMode.PLAINTEXT, contentFormat: ContentFormat.PRIMARY },
				{ insertMode: InsertMode.PLAINTEXT, contentFormat: ContentFormat.ALTERNATE },
				{ insertMode: InsertMode.PLAINTEXT, contentFormat: ContentFormat.SUGGESTION_TEXT },
			];
					for (const { insertMode, contentFormat } of combinations) {
				const cacheKey = `${insertMode}-${contentFormat}`;
				try {
					const settings = this.plugin.settings;
					const momentDate = parsedDate ? moment(parsedDate) : moment();
					const dailySettings = getDailyNoteSettings();
					
					// Format the text using DateFormatter for all combinations
					const formatted = DateFormatter.getFormattedDateText(
						suggestion,
						momentDate,
						settings,
						contentFormat,
						dailySettings,
						this
					);
					formattedText.set(cacheKey, formatted);
				} catch (error) {
					console.warn(`Failed to pre-compute suggestion: ${suggestion} with ${cacheKey}`, error);
					// Skip if formatting fails, will fall back to regular processing
				}
			}
					this.initialSuggestionsCache.set(suggestion, {
				parsedDate,
				formattedText
			});
		}
	}

	/**
	 * Refresh pre-cached suggestions if settings have changed
	 */
	public refreshPreCachedSuggestions(): void {
		this.initialSuggestionsCache.clear();
		this.formattedTextCache.clear(); // Clear formatted text cache to reflect new settings
		this.preComputeInitialSuggestions();
	}
}
