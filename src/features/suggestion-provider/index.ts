import ChronoLanguage from '../../main';
import { App, moment, Notice, TFile } from 'obsidian';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { getOrCreateDailyNote, DateFormatter, createDailyNoteLink } from '../../utils/helpers';
import { DateParser } from './date-parser';
import { InsertMode, ContentFormat } from '../../types';
import { KeyboardHandler } from '../../utils/keyboard-handler';
import { Link } from 'obsidian-dev-utils/obsidian';
import { ChronoLanguageSettings } from '../../settings';
import { CLASSES } from '../../constants';
import { renderSuggestionContent, updatePreviewContent } from './render';

/**
 * Shared suggester for date suggestions. Handles rendering and updating of suggestions.
 */
export class SuggestionProvider {
    app: App;
    plugin: ChronoLanguage;
    currentElements: Map<string, HTMLElement> = new Map();
    contextProvider: any;
    keyboardHandler: KeyboardHandler;
    isSuggesterOpen: boolean = false;
    private holidaySuggestions: string[] = [];

    constructor(app: App, plugin: ChronoLanguage) {
        this.app = app;
        this.plugin = plugin;
        // Initialize keyboard handler without requiring a scope
        this.keyboardHandler = new KeyboardHandler(undefined, plugin.settings.plainTextByDefault);
        
        // Register for key state changes
        this.keyboardHandler.addKeyStateChangeListener(this.handleKeyStateChange);
        
        // Initialize holiday suggestions
        this.initializeHolidaySuggestions();
    }
    
    /**
     * Initialize holiday suggestions from the EnhancedDateParser
     */
    private initializeHolidaySuggestions(): void {
        const locale = this.plugin.settings.holidayLocale;
        if (!locale) {
            this.holidaySuggestions = [];
            DateParser.setLocale(''); // Ensure parser disables holidays
            return;
        }
        try {
            DateParser.setLocale(locale);
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
            DateParser.setLocale('');
            return;
        }
        try {
            DateParser.setLocale(locale);
            this.initializeHolidaySuggestions();
        } catch (error) {
            console.error('Failed to update holiday locale:', error);
            new Notice(`Failed to set holiday locale: ${locale}. Using US locale as fallback.`, 3000);
            DateParser.setLocale('US');
            this.initializeHolidaySuggestions();
        }
    }
    
    /**
     * Handle key state changes by updating UI
     */
    handleKeyStateChange = (): void => {
        // Only update previews if suggester is open
        if (this.isSuggesterOpen) {
            // Debounce or throttle this if it becomes too frequent
            requestAnimationFrame(() => this.updateAllPreviews());
        }
    };
    
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
        const parsed = DateParser.parseDate(raw);
        if (parsed) {
            const m = moment(parsed);
            const file = await getOrCreateDailyNote(this.app, m, false);
            if (file) {
                const leaf = this.app.workspace.getLeaf(newTab);
                await leaf.openFile(file);
            }
        } else if (context?.file) {
            // Open as regular note by resolving link path
            const dest = this.app.metadataCache.getFirstLinkpathDest(raw, context.file.path);
            if (dest instanceof TFile) {
                const leaf = this.app.workspace.getLeaf(newTab);
                await leaf.openFile(dest);
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
        this.keyboardHandler.removeKeyStateChangeListener(this.handleKeyStateChange);
        this.currentElements.clear();
        this.keyboardHandler.unload();
        this.isSuggesterOpen = false;
    }

    updateAllPreviews() {
        if (!this.isSuggesterOpen) return;
        this.currentElements.forEach((el, item) => {
            if (el.isConnected) this.updatePreviewContent(item, el);
        });
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
            const patternSuggestions = DateParser.getPatternSuggestions(rawQuery.trim());
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
        // Keep reference to the EditorSuggester instance for later close
        this.contextProvider = context;
        this.isSuggesterOpen = true;
        this.keyboardHandler.resetModifierKeys();
        renderSuggestionContent(this, item, el, context);
    }

    updatePreviewContent(item: string, container: HTMLElement) {
        updatePreviewContent(this, item, container);
    }

    // Helper method to close the suggester UI
    private closeSuggester() {
        this.isSuggesterOpen = false;
        
        const suggesterInstance = this.contextProvider as any; // this.contextProvider is the EditorSuggester instance
        
        // Call the close method on the EditorSuggester instance.
        // This will trigger EditorSuggester.close(), which handles UI and internal state.
        suggesterInstance?.close?.(); 
    }
    
    getKeyboardHandler(): KeyboardHandler {
        return this.keyboardHandler;
    }

    public getFinalInsertText(
        itemText: string,
        insertMode: InsertMode,
        contentFormat: ContentFormat,
        settings: ChronoLanguageSettings,
        activeFile: TFile,
        app: App
    ): string {
        const parsedDate = DateParser.parseDate(itemText);; 

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
                dailySettings
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
}