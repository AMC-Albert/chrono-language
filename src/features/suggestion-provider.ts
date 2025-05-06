import { App, moment, Notice } from 'obsidian';
import ChronoLanguage from '../main';
import { getDailyNotePreview, getDatePreview, getOrCreateDailyNote, getAllDailyNotesSafe } from '../utils/helpers';
import { getDailyNote, getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { EnhancedDateParser } from '../utils/parser';
import { TFile, TFolder } from 'obsidian';
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
            // Initialize parser with user's locale if available
            const locale = this.plugin.settings.holidayLocale || 'US';
            EnhancedDateParser.setLocale(locale);
            
            // Get all holiday names
            this.holidaySuggestions = EnhancedDateParser.getHolidayNames();
            
            // Filter to most common holidays to avoid overwhelming the user
            // and sort alphabetically for easier browsing
            if (this.holidaySuggestions.length > 50) {
                this.holidaySuggestions = this.holidaySuggestions
                    .filter(name => name.length > 3) // Filter out very short names
                    .sort();
            }
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

        // Dynamically recalculate the range to remove the trigger phrase and query BEFORE switching notes
        if (context && context.editor) {
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

        const sel = document.querySelector('.is-selected .chrono-suggestion-container') as HTMLElement;
        const raw = sel?.getAttribute('data-suggestion');
        if (!raw) return;

        const parsed = EnhancedDateParser.parseDate(raw);
        if (!parsed) return;

        const momentDate = moment(parsed);
        const file = await getOrCreateDailyNote(this.app, momentDate, false);

        if (file) {
            if (newTab) {
                const newLeaf = this.app.workspace.getLeaf(true);
                await newLeaf.openFile(file);
            } else {
                const leaf = this.app.workspace.getLeaf(false);
                await leaf.openFile(file);
            }
        }
        this.closeSuggester();
    }

    unload() {
        this.keyboardHandler.removeKeyStateChangeListener(this.handleKeyStateChange);
        this.currentElements.clear();
        this.keyboardHandler.unload();
        this.isSuggesterOpen = false;
    }

    updateAllPreviews() {
        // Only proceed if suggester is open
        if (!this.isSuggesterOpen) return;
        
        // Update all currently rendered suggestions
        this.currentElements.forEach((el, item) => {
            this.updatePreviewContent(item, el);
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
        
        // Update holiday locale if specified
        if (settings.holidayLocale) {
            this.updateHolidayLocale(settings.holidayLocale);
        }
        
        // Only update previews if suggester is open
        if (this.isSuggesterOpen) {
            this.updateAllPreviews();
        }
    }

    getDateSuggestions(context: { query: string }, initialSuggestions?: string[]): string[] {
        // Set the suggester as open when getting suggestions
        this.isSuggesterOpen = true;
        
        // Reset the folder creation notification flag when the suggester opens
        this.folderCreationNotified = false;
        
        const query = context.query.toLowerCase();
        const suggestions = initialSuggestions || this.plugin.settings.initialEditorSuggestions;
        
        // Combine the standard suggestions with relevant holiday suggestions
        let combinedSuggestions = [...suggestions];
        
        // Add matching holiday suggestions if query is long enough
        if (query.length >= 2) {
            const matchingHolidays = this.holidaySuggestions.filter(
                holiday => holiday.toLowerCase().includes(query)
            );
            
            // Add top 5 matching holidays to avoid overwhelming the UI
            combinedSuggestions = [...combinedSuggestions, ...matchingHolidays.slice(0, 5)];
        }
        
        // Filter all suggestions based on query
        const filtered = combinedSuggestions.filter(
            c => c.toLowerCase().includes(query)
        );

        // If no matches found, create a fallback suggestion with the user's input
        if (filtered.length === 0 && query) {
            // Capitalize first letter to match the style of other suggestions
            const capitalizedInput = query.charAt(0).toUpperCase() + query.slice(1);
            return [capitalizedInput];
        }

        return filtered;
    }

    renderSuggestionContent(item: string, el: HTMLElement, context?: any) {
        // Set the suggester as open when rendering content
        this.isSuggesterOpen = true;
        
        // Reset all modifier keys when suggestions are first rendered
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
            if (!this.isSuggesterOpen || !container.isConnected) return;
            
            // Remove any existing preview to prevent duplicates
            container.querySelector('.chrono-suggestion-preview')?.remove();
            
            const { insertMode, contentFormat } = this.keyboardHandler.getEffectiveInsertModeAndFormat();
            const momentDate = moment(EnhancedDateParser.parseDate(item));
            let dailyNote: TFile | null = null;
            
            // Add a marker to prevent duplicate renders during async operations
            if (container.hasAttribute('data-updating')) {
                return;
            }
            container.setAttribute('data-updating', 'true');
            
            // Check if folder exists first to know if we need to show a creation notice later
            const dailyNoteSettings = getDailyNoteSettings();
            const folderPath = dailyNoteSettings.folder ?? '';
            
            // Use FileSystem utility to check if folder exists
            const folderExists = folderPath === '' || FileSystem.getFolderOrNull(this.app, folderPath) !== null;
                
            // Use the enhanced getAllDailyNotesSafe with createIfNeeded=true to auto-create folder if missing
            const allNotesPromise = getAllDailyNotesSafe(this.app, true, true);
            let dailyNotePreview = item;
            let dailyNoteClass = '';
            
            // Handle asynchronous getAllDailyNotesSafe
            allNotesPromise.then(allNotes => {
                // Only show the notice once per suggester session, and only when the folder is actually created
                if (!folderExists && allNotes && !this.folderCreationNotified) {
                    new Notice(`Created daily notes folder: ${folderPath}`, 3000);
                    this.folderCreationNotified = true;
                }
                
                if (momentDate.isValid() && allNotes) {
                    const potentialDailyNote = getDailyNote(momentDate, allNotes);
                    dailyNote = potentialDailyNote instanceof TFile ? potentialDailyNote : null;
                    dailyNotePreview = getDailyNotePreview(item) ?? item;
                    dailyNoteClass = dailyNote instanceof TFile ? '' : 'chrono-is-unresolved';
                } else if (!allNotes) {
                    dailyNotePreview = 'Daily notes folder missing';
                    dailyNoteClass = 'chrono-is-unresolved';
                }
                
                this.updatePreviewUI(container, momentDate, dailyNote, dailyNotePreview, dailyNoteClass, insertMode, contentFormat, item);
                // Remove the marker after rendering is complete
                container.removeAttribute('data-updating');
            }).catch(() => {
                // Make sure to clear the marker even if there's an error
                container.removeAttribute('data-updating');
            });
        } catch (e) {
            console.error('Error updating preview content:', e);
            // Clear the marker in case of error
            container?.removeAttribute?.('data-updating');
        }
    }
    
    private updatePreviewUI(
        container: HTMLElement, 
        momentDate: moment.Moment,
        dailyNote: TFile | null,
        dailyNotePreview: string,
        dailyNoteClass: string,
        insertMode: InsertMode,
        contentFormat: ContentFormat,
        item: string
    ) {
        // Remove any existing preview elements to prevent duplicates
        container.querySelector('.chrono-suggestion-preview')?.remove();
        
        let readableDatePreview = item;
        if (contentFormat === ContentFormat.DAILY_NOTE) {
            readableDatePreview = dailyNotePreview;
        } else if (contentFormat !== ContentFormat.SUGGESTION_TEXT) {
            readableDatePreview = getDatePreview(item, this.plugin.settings, contentFormat === ContentFormat.ALTERNATE, false);
        }

        const previewContainer = container.createEl('span', { cls: 'chrono-suggestion-preview' });

        if (insertMode === InsertMode.PLAINTEXT) {
            previewContainer.appendText(`↳ ${readableDatePreview}`);
        } else if (dailyNotePreview) {
            previewContainer.appendText('↳ ');
            const linkEl = previewContainer.createEl('a', {
                text: dailyNotePreview,
                cls: dailyNoteClass, 
                attr: { 'data-href': dailyNote?.path ?? '#', target: '_self', rel: 'noopener nofollow' }
            });
            linkEl.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.closeSuggester();
                const file = await getOrCreateDailyNote(this.app, momentDate, true);
                if (file) await this.app.workspace.getLeaf(event.ctrlKey).openFile(file);
            });
            if (dailyNotePreview !== readableDatePreview)
                previewContainer.appendText(` ⭢ ${readableDatePreview}`);
        }

        if (!previewContainer.hasChildNodes() && !previewContainer.textContent?.trim()) previewContainer.remove();
    }

    // Helper method to close the suggester
    private closeSuggester() {
        // Set suggester as closed
        this.isSuggesterOpen = false;
        // Reset folder creation notification flag when suggester closes
        this.folderCreationNotified = false;
        
        const ctx = this.contextProvider;
        ctx?.context?.editor?.replaceRange?.('', ctx.context.start, ctx.context.end);
        ctx?.close?.() ?? ctx?.suggestions?.close?.();
    }
    
    getKeyboardHandler(): KeyboardHandler {
        return this.keyboardHandler;
    }
}