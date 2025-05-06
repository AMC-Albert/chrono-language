import { App, moment } from 'obsidian';
import ChronoLanguage from '../main';
import { getDailyNotePreview, getDatePreview, getOrCreateDailyNote, getAllDailyNotesSafe } from '../utils/helpers';
import { getDailyNote } from 'obsidian-daily-notes-interface';
import { EnhancedDateParser } from '../utils/parser';
import { TFile } from 'obsidian';
import { InsertMode, ContentFormat } from '../definitions/types';
import { KeyboardHandler } from '../utils/keyboard-handler';

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

    constructor(app: App, plugin: ChronoLanguage) {
        this.app = app;
        this.plugin = plugin;
        // Initialize keyboard handler without requiring a scope
        this.keyboardHandler = new KeyboardHandler(undefined, plugin.settings.plainTextByDefault);
        
        // Register for key state changes
        this.keyboardHandler.addKeyStateChangeListener(this.handleKeyStateChange);
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
    updateSettings(settings: { keyBindings?: Record<string, string>; plainTextByDefault?: boolean }): void {
        this.keyboardHandler.update(settings);
        // Only update previews if suggester is open
        if (this.isSuggesterOpen) {
            this.updateAllPreviews();
        }
    }

    getDateSuggestions(context: { query: string }, initialSuggestions?: string[]): string[] {
        // Set the suggester as open when getting suggestions
        this.isSuggesterOpen = true;
        
        const suggestions = initialSuggestions || this.plugin.settings.initialEditorSuggestions;
        const filtered = suggestions.filter(
            c => c.toLowerCase().startsWith(context.query.toLowerCase())
        );

        // If no matches found, create a fallback suggestion with the user's input
        if (filtered.length === 0 && context.query) {
            // Capitalize first letter to match the style of other suggestions
            const capitalizedInput = context.query.charAt(0).toUpperCase() + context.query.slice(1);
            return [capitalizedInput];
        }

        return filtered;
    }

    renderSuggestionContent(item: string, el: HTMLElement, context?: any) {
        // Set the suggester as open when rendering content
        this.isSuggesterOpen = true;
        
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
            
            container.querySelector('.chrono-suggestion-preview')?.remove();
            const { insertMode, contentFormat } = this.keyboardHandler.getEffectiveInsertModeAndFormat();
            const momentDate = moment(EnhancedDateParser.parseDate(item));
            let dailyNote = null;
            // Use the safe version with silent=true to prevent notice spam during UI updates
            const allNotes = getAllDailyNotesSafe(this.app, true);
            let dailyNotePreview = item;
            let dailyNoteClass = '';
            if (momentDate.isValid() && allNotes) {
                dailyNote = getDailyNote(momentDate, allNotes);
                dailyNotePreview = getDailyNotePreview(item) ?? item;
                dailyNoteClass = dailyNote instanceof TFile ? '' : 'chrono-is-unresolved';
            } else if (!allNotes) {
                dailyNotePreview = 'Daily notes folder missing';
                dailyNoteClass = 'chrono-is-unresolved';
            }

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
        } catch (e) {
            console.error('Error updating preview content:', e);
        }
    }

    // Helper method to close the suggester
    private closeSuggester() {
        // Set suggester as closed
        this.isSuggesterOpen = false;
        
        const ctx = this.contextProvider;
        ctx?.context?.editor?.replaceRange?.('', ctx.context.start, ctx.context.end);
        ctx?.close?.() ?? ctx?.suggestions?.close?.();
    }
    
    getKeyboardHandler(): KeyboardHandler {
        return this.keyboardHandler;
    }
}