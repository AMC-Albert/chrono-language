import ChronoLanguage from '../main';
import { App, moment, Notice, TFile } from 'obsidian';
import { getDailyNote, getDailyNoteSettings, DEFAULT_DAILY_NOTE_FORMAT } from 'obsidian-daily-notes-interface';
import { getOrCreateDailyNote, getAllDailyNotesSafe, createDailyNoteLink } from '../utils/helpers';
import { EnhancedDateParser } from '../utils/parser';
import { InsertMode, ContentFormat } from '../definitions/types';
import { KeyboardHandler } from '../utils/keyboard-handler';
import { Link } from 'obsidian-dev-utils/obsidian';
import { CLASSES } from '../definitions/constants';
import { DateFormatter } from '../utils/date-formatter';
import { ChronoLanguageSettings } from '../settings';
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
        try {
            const locale = this.plugin.settings.holidayLocale || 'US';
            EnhancedDateParser.setLocale(locale);
            this.holidaySuggestions = EnhancedDateParser.getHolidayNames().sort();
        } catch (error) {
            console.error('Failed to initialize holiday suggestions:', error);
            this.holidaySuggestions = [];
        }
    }
    
    /**
     * Update holiday locale based on user settings
     */
    updateHolidayLocale(locale: string): void {
        if (!locale) return;
        
        try {
            EnhancedDateParser.setLocale(locale);
            this.initializeHolidaySuggestions();
        } catch (error) {
            console.error('Failed to update holiday locale:', error);
            new Notice(`Failed to set holiday locale: ${locale}. Using US locale as fallback.`, 3000);
            EnhancedDateParser.setLocale('US');
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

        this.cleanupTriggerPhrase(context);
        const momentDate = this.getSelectedDate();
        if (!momentDate) return;

        const file = await getOrCreateDailyNote(this.app, momentDate, false);
        if (file) {
            const leaf = this.app.workspace.getLeaf(newTab);
            await leaf.openFile(file);
        }
        this.closeSuggester();
    }
    
    private cleanupTriggerPhrase(context?: any): void {
        if (!context?.editor) return;
        
        const editor = context.editor;
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const triggerPhrase = this.plugin.settings.triggerPhrase;
        const beforeCursor = line.slice(0, cursor.ch);
        const lastTriggerIdx = beforeCursor.lastIndexOf(triggerPhrase);
        
        if (lastTriggerIdx !== -1) {
            const start = { line: cursor.line, ch: lastTriggerIdx };
            const end = { line: cursor.line, ch: cursor.ch };
            editor.replaceRange('', start, end);
        }
    }
    
    private getSelectedDate(): moment.Moment | null {
        const sel = document.querySelector('.is-selected .chrono-suggestion-container') as HTMLElement;
        const raw = sel?.getAttribute('data-suggestion');
        if (!raw) return null;

        const parsed = EnhancedDateParser.parseDate(raw);
        return parsed ? moment(parsed) : null;
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
            const patternSuggestions = EnhancedDateParser.getPatternSuggestions(rawQuery.trim());
            patternSuggestions.forEach(addSuggestionIfNotDuplicate);
        }

        // 3. Add matching holiday suggestions
        if (lowerQuery.length >= 1) { 
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

    // Check if a suggestion is time-relevant (has specific time components)
    private isTimeRelevantSuggestion(item: string): boolean {
        return DateFormatter.isTimeRelevantSuggestion(item);
    }

    renderSuggestionContent(item: string, el: HTMLElement, context?: any) {
        this.isSuggesterOpen = true;
        this.keyboardHandler.resetModifierKeys();
        
        // Create container with data attribute
        const container = el.createEl('div', { 
            cls: [CLASSES.suggestionContainer],
            attr: { 'data-suggestion': item }
        });

        // Mark time-relevant suggestions
        if (this.isTimeRelevantSuggestion(item)) {
            container.addClass(CLASSES.timeRelevantSuggestion);
        }
        
        // Add suggestion text
        container.createEl('span', { 
            text: item, 
            cls: [CLASSES.suggestionText]
        });
        
        this.currentElements.set(item, container);
        if (context) this.contextProvider = context;
        this.updatePreviewContent(item, container);
    }

    updatePreviewContent(item: string, container: HTMLElement) {
        try {
            if (!this.isSuggesterOpen || !container.isConnected || 
                container.hasAttribute('data-updating')) return;
            
            container.setAttribute('data-updating', 'true');
            
            // Remove any existing preview
            container.querySelector('.chrono-suggestion-preview')?.remove();
            
            const { insertMode, contentFormat } = this.keyboardHandler.getEffectiveInsertModeAndFormat();
            const parsedDate = EnhancedDateParser.parseDate(item); // Capture raw parsing result
            const momentDate = parsedDate ? moment(parsedDate) : moment(); // Fallback to now if parsing fails
            
            // Get all notes, create folder if needed (notification handled by helper)
            getAllDailyNotesSafe(this.app, true).then(allNotes => {
                // Pass parsedDate as the new first argument to renderPreview
                this.renderPreview(container, item, parsedDate, momentDate, insertMode, contentFormat, allNotes);
                container.removeAttribute('data-updating');
            }).catch((error) => {
                console.error("Error in getAllDailyNotesSafe chain:", error);
                // Still render a basic preview or error state if appropriate
                // Pass parsedDate here as well
                this.renderPreview(container, item, parsedDate, momentDate, insertMode, contentFormat, null); // Pass null for allNotes
                container.removeAttribute('data-updating');
            });
        } catch (e) {
            console.error('Error updating preview content:', e);
            container?.removeAttribute?.('data-updating');
        }
    }
    
    private renderPreview(
        container: HTMLElement, 
        item: string, // Original item text
        rawParsedDate: Date | null, // Result of EnhancedDateParser.parseDate(item)
        momentDate: moment.Moment, // moment(rawParsedDate) or moment() as fallback
        insertMode: InsertMode,
        contentFormat: ContentFormat,
        allNotes: Record<string, TFile> | null
    ): void {
        let dailyNote: TFile | null = null;
        const dailyNoteSettings = getDailyNoteSettings();
        // dailyNoteFilenameCandidate relies on momentDate which is prepared based on rawParsedDate or fallback
        const dailyNoteFilenameCandidate = momentDate.isValid() ? momentDate.format(dailyNoteSettings.format || DEFAULT_DAILY_NOTE_FORMAT) : item;
        
        if (momentDate.isValid() && allNotes && rawParsedDate) { // Ensure rawParsedDate was valid for daily note lookup
            dailyNote = getDailyNote(momentDate, allNotes) as TFile;
        }
        
        const previewContainer = container.createEl('span', { cls: [CLASSES.suggestionPreview] });
        
        if (!rawParsedDate) { // Check if the original item string failed to parse
            previewContainer.createEl('span', { text: '↳ Unable to parse date', cls: [CLASSES.errorText] });
            return;
        }

        if (insertMode === InsertMode.PLAINTEXT) {
            previewContainer.createEl('span', { text: '↳ ' });
            this.appendReadableDatePreview(
                previewContainer,
                item,
                momentDate,
                contentFormat,
                dailyNote && allNotes ? [] : [CLASSES.unresolvedText]
            );
        } else { // InsertMode.LINK
            this.createLinkPreview(
                previewContainer,
                dailyNoteFilenameCandidate, // This is the text for the link itself (filename)
                dailyNote && allNotes ? [] : [CLASSES.unresolvedLink],
                momentDate,
                item, // Original item text for formatting readable part
                contentFormat,
                dailyNote && allNotes ? [] : [CLASSES.unresolvedText] // Class for the readable part
            );
        }

        if (!previewContainer.hasChildNodes()) previewContainer.remove();
    }
    
    private appendReadableDatePreview(
        container: HTMLElement,
        item: string, 
        momentDate: moment.Moment,
        contentFormat: ContentFormat, 
        suggestionPreviewClass: string[]
    ): void { // HTMLElement return type was for the created span, now appends to container
        const dailySettings = getDailyNoteSettings();
        const text = DateFormatter.getFormattedDateText(
            item,
            momentDate,
            this.plugin.settings,
            contentFormat,
            dailySettings
        );

        if (contentFormat !== ContentFormat.SUGGESTION_TEXT &&
            container.parentElement?.classList.contains(CLASSES.timeRelevantSuggestion)) {
            container.createEl('span', { text: '◴ ', cls: ['chrono-clock-icon'] });
        }
        
        container.createEl('span', { 
            text: text,
            cls: suggestionPreviewClass 
        });
    }
    
    private createLinkPreview(
        container: HTMLElement,
        linkText: string, // This is the daily note filename candidate
        dailyNoteClass: string[],
        momentDate: moment.Moment, // This should be valid if rawParsedDate was valid
        item: string, // Original item text for formatting readable part
        contentFormat: ContentFormat,
        suggestionPreviewClass: string[]
    ): void {
        container.createEl('span', { text: '↳ ' });
        
        const dailySettings = getDailyNoteSettings();
        const readableText = DateFormatter.getFormattedDateText(
            item,
            momentDate,
            this.plugin.settings,
            contentFormat,
            dailySettings
        );
        
        const linkEl = container.createEl('a', {
            text: linkText, // Use the passed linkText (filename candidate)
            cls: dailyNoteClass, 
            attr: { 
                'data-href': '#', 
                target: '_self', 
                rel: 'noopener nofollow' 
            }
        });
        
        // Add click handler to link
        linkEl.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.closeSuggester();
            const file = await getOrCreateDailyNote(this.app, momentDate, true);
            if (file) await this.app.workspace.getLeaf(event.ctrlKey).openFile(file);
        });
        
        if (linkText !== readableText) {
            container.createEl('span', { text: ' ⭢ ' });
            
            let textForDisplay = readableText;
            if (contentFormat !== ContentFormat.SUGGESTION_TEXT &&
                container.parentElement?.classList.contains(CLASSES.timeRelevantSuggestion)) {
                textForDisplay = '◴ ' + readableText;
            }
            
            container.createEl('span', { 
                text: textForDisplay,
                cls: suggestionPreviewClass 
            });
        }
    }

    // Helper method to close the suggester
    private closeSuggester() {
        this.isSuggesterOpen = false;
        
        const ctx = this.contextProvider;
        
        // Safely replace the trigger text if possible
        if (ctx?.context?.editor) {
            try {
                const editor = ctx.context.editor;
                const cursor = editor.getCursor();
                
                const triggerPhrase = this.plugin.settings.triggerPhrase;
                const line = editor.getLine(cursor.line);
                const beforeCursor = line.slice(0, cursor.ch);
                const lastTriggerIdx = beforeCursor.lastIndexOf(triggerPhrase);
                
                if (lastTriggerIdx >= 0) {
                    const start = { line: cursor.line, ch: lastTriggerIdx };
                    const end = { line: cursor.line, ch: cursor.ch };
                    
                    if (start.ch < end.ch) {
                        editor.replaceRange('', start, end);
                    }
                }
            } catch (e) {
                console.debug("Error closing suggester (safe to ignore):", e);
            }
        }
        
        ctx?.close?.() ?? ctx?.suggestions?.close?.();
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
        const parsedDate = EnhancedDateParser.parseDate(itemText);
        const isItemTimeRelevant = DateFormatter.isTimeRelevantSuggestion(itemText); 

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