import { App, moment, Notice, TFile } from 'obsidian';
import ChronoLanguage from '../main';
import { getDailyNotePreview, getDatePreview, getOrCreateDailyNote, getAllDailyNotesSafe } from '../utils/helpers';
import { getDailyNote, getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { EnhancedDateParser } from '../utils/parser';
import { InsertMode, ContentFormat } from '../definitions/types';
import { KeyboardHandler } from '../utils/keyboard-handler';
import { FileSystem } from 'obsidian-dev-utils/obsidian';

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
    private folderCreationNotified: boolean = false;
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
        
        if (settings.holidayLocale) {
            this.updateHolidayLocale(settings.holidayLocale);
        }
        
        if (this.isSuggesterOpen) {
            this.updateAllPreviews();
        }
    }

    getDateSuggestions(context: { query: string }, initialSuggestions?: string[]): string[] {
        this.isSuggesterOpen = true;
        this.folderCreationNotified = false;
        
        const query = context.query.toLowerCase();
        const suggestions = initialSuggestions || this.plugin.settings.initialEditorSuggestions;
        let combinedSuggestions = [...suggestions];
        
        // Add matching holiday suggestions if query is long enough
        if (query.length >= 2) {
            const matchingHolidays = this.holidaySuggestions
                .filter(holiday => holiday.toLowerCase().includes(query))
                .slice(0, 5); // Limit to top 5 matches
            
            combinedSuggestions = [...combinedSuggestions, ...matchingHolidays];
        }
        
        // Filter all suggestions based on query
        const filtered = combinedSuggestions.filter(
            c => c.toLowerCase().includes(query)
        );

        // Create fallback suggestion if no matches
        if (filtered.length === 0 && query) {
            const capitalizedInput = query.charAt(0).toUpperCase() + query.slice(1);
            return [capitalizedInput];
        }

        return filtered;
    }

    renderSuggestionContent(item: string, el: HTMLElement, context?: any) {
        this.isSuggesterOpen = true;
        this.keyboardHandler.resetModifierKeys();
        
        const container = el.createEl('div', { cls: 'chrono-suggestion-container' });
        container.setAttribute('data-suggestion', item);
        container.createEl('span', { text: item, cls: 'chrono-suggestion-text' });
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
            const momentDate = moment(EnhancedDateParser.parseDate(item));
            
            // Check folder existence and create if needed
            this.checkAndCreateFolder().then(allNotes => {
                this.renderPreview(container, momentDate, item, insertMode, contentFormat, allNotes);
                container.removeAttribute('data-updating');
            }).catch(() => {
                container.removeAttribute('data-updating');
            });
        } catch (e) {
            console.error('Error updating preview content:', e);
            container?.removeAttribute?.('data-updating');
        }
    }
    
    private async checkAndCreateFolder(): Promise<Record<string, TFile> | null> {
        // Check folder existence
        const dailyNoteSettings = getDailyNoteSettings();
        const folderPath = dailyNoteSettings.folder ?? '';
        const folderExists = folderPath === '' || 
                             FileSystem.getFolderOrNull(this.app, folderPath) !== null;
        
        // Get all notes and create folder if needed
        const allNotes = await getAllDailyNotesSafe(this.app, true, true);
        
        // Show notification if folder was created
        if (!folderExists && allNotes && !this.folderCreationNotified) {
            new Notice(`Created daily notes folder: ${folderPath}`, 3000);
            this.folderCreationNotified = true;
        }
        
        return allNotes;
    }
    
    private renderPreview(
        container: HTMLElement, 
        momentDate: moment.Moment,
        item: string,
        insertMode: InsertMode,
        contentFormat: ContentFormat,
        allNotes: Record<string, TFile> | null
    ): void {
        let dailyNote: TFile | null = null;
        let dailyNotePreview = item;
        let dailyNoteClass = '';
        
        if (momentDate.isValid() && allNotes) {
            dailyNote = getDailyNote(momentDate, allNotes) as TFile;
            dailyNotePreview = getDailyNotePreview(item) ?? item;
            dailyNoteClass = dailyNote ? '' : 'chrono-is-unresolved';
        } else if (!allNotes) {
            dailyNotePreview = 'Daily notes folder missing';
            dailyNoteClass = 'chrono-is-unresolved';
        }
        
        // Determine preview text
        let readableDatePreview: string = this.getReadableDatePreview(item, dailyNotePreview, contentFormat);

        const previewContainer = container.createEl('span', { cls: 'chrono-suggestion-preview' });

        if (insertMode === InsertMode.PLAINTEXT) {
            previewContainer.appendText(`↳ ${readableDatePreview}`);
        } else if (dailyNotePreview) {
            this.createLinkPreview(previewContainer, dailyNotePreview, dailyNoteClass, momentDate, readableDatePreview);
        }

        if (!previewContainer.hasChildNodes()) previewContainer.remove();
    }
    
    private getReadableDatePreview(item: string, dailyNotePreview: string, contentFormat: ContentFormat): string {
        if (contentFormat === ContentFormat.SUGGESTION_TEXT) {
            return item;
        } else if (contentFormat === ContentFormat.DAILY_NOTE) {
            return dailyNotePreview;
        } else { // Primary or Alternate format
            const useAlternate = contentFormat === ContentFormat.ALTERNATE;
            return getDatePreview(item, this.plugin.settings, useAlternate, false);
        }
    }
    
    private createLinkPreview(
        container: HTMLElement,
        dailyNotePreview: string,
        dailyNoteClass: string,
        momentDate: moment.Moment,
        readableDatePreview: string
    ): void {
        container.appendText('↳ ');
        const linkEl = container.createEl('a', {
            text: dailyNotePreview,
            cls: dailyNoteClass, 
            attr: { 
                'data-href': '#', 
                target: '_self', 
                rel: 'noopener nofollow' 
            }
        });
        
        linkEl.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.closeSuggester();
            const file = await getOrCreateDailyNote(this.app, momentDate, true);
            if (file) await this.app.workspace.getLeaf(event.ctrlKey).openFile(file);
        });
        
        if (dailyNotePreview !== readableDatePreview) {
            container.appendText(` ⭢ ${readableDatePreview}`);
        }
    }

    // Helper method to close the suggester
    private closeSuggester() {
        this.isSuggesterOpen = false;
        this.folderCreationNotified = false;
        
        const ctx = this.contextProvider;
        
        // Safely replace the trigger text if possible
        if (ctx?.context?.editor) {
            try {
                const editor = ctx.context.editor;
                const cursor = editor.getCursor();
                
                // Get the actual trigger phrase to ensure we're only removing what was typed
                const triggerPhrase = this.plugin.settings.triggerPhrase;
                const line = editor.getLine(cursor.line);
                const beforeCursor = line.slice(0, cursor.ch);
                const lastTriggerIdx = beforeCursor.lastIndexOf(triggerPhrase);
                
                if (lastTriggerIdx >= 0) {
                    // Use the actual trigger location rather than the stored context
                    const start = { line: cursor.line, ch: lastTriggerIdx };
                    const end = { line: cursor.line, ch: cursor.ch };
                    
                    // Only remove text if there's actually something to remove
                    if (start.ch < end.ch) {
                        editor.replaceRange('', start, end);
                    }
                }
            } catch (e) {
                // Ignore range errors
                console.debug("Error closing suggester (safe to ignore):", e);
            }
        }
        
        // Close the suggester UI
        ctx?.close?.() ?? ctx?.suggestions?.close?.();
    }
    
    getKeyboardHandler(): KeyboardHandler {
        return this.keyboardHandler;
    }
}