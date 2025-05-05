import { App } from 'obsidian';
import ChronoLanguage from '../main';
import { getDailyNotePreview, getDatePreview, getOrCreateDailyNote } from '../utils/helpers';
import { getDailyNote, getAllDailyNotes } from 'obsidian-daily-notes-interface';
import { EnhancedDateParser } from '../utils/parser';
import { TFile } from 'obsidian';
import { InsertMode, ContentFormat } from '../plugin-data/types';
import { KeyboardHandler } from '../utils/keyboard-handler';

/**
 * Shared suggester for date suggestions
 */
export class Suggester {
    app: App;
    plugin: ChronoLanguage;
    currentElements: Map<string, HTMLElement> = new Map();
    contextProvider: any; // Add property to store the context provider
    keyboardHandler: KeyboardHandler;

    constructor(app: App, plugin: ChronoLanguage) {
        this.app = app;
        this.plugin = plugin;
        // Initialize keyboard handler without requiring a scope
        this.keyboardHandler = new KeyboardHandler(undefined, plugin.settings.invertCtrlBehavior);
        this.setupKeyEventListeners();
    }
    
    setupKeyEventListeners() {
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
    }

    removeKeyEventListeners() {
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
    }

    handleKeyDown = (e: KeyboardEvent) => {
        // Use the keyboard handler to update key state
        const updated = this.keyboardHandler.updateKeyState(e, true);
        if (updated) {
            this.updateAllPreviews();
        }
    };

    handleKeyUp = (e: KeyboardEvent) => {
        // Use the keyboard handler to update key state
        const updated = this.keyboardHandler.updateKeyState(e, false);
        if (updated) {
            this.updateAllPreviews();
        }
    };

    unload() {
        // Remove event listeners when plugin is unloaded
        this.removeKeyEventListeners();
        this.currentElements.clear();
    }

    updateAllPreviews() {
        // Update all currently rendered suggestions
        this.currentElements.forEach((el, item) => {
            this.updatePreviewContent(item, el);
        });
    }

    getCurrentKeyCombo(): { insertMode: InsertMode; contentFormat: ContentFormat } {
        // Use the keyboard handler to determine the current key combo
        return this.keyboardHandler.getCurrentKeyCombo();
    }

    getDateSuggestions(context: { query: string }, initialSuggestions?: string[]): string[] {
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
        const container = el.createEl('div', { cls: 'chrono-suggestion-container' });
        container.createEl('span', { text: item, cls: 'chrono-suggestion-text' });

        // Store reference to this element and context
        this.currentElements.set(item, container);
        if (context) {
            this.contextProvider = context;
        }

        // Update the preview for this item
        this.updatePreviewContent(item, container);
    }

    updatePreviewContent(item: string, container: HTMLElement) {
        // Remove any existing preview elements
        const existingPreview = container.querySelector('.chrono-suggestion-preview');
        if (existingPreview) {
            existingPreview.remove();
        }

        // Get daily note preview
        const dailyNotePreview = getDailyNotePreview(item);

        let momentDate = window.moment(EnhancedDateParser.parseDate(item));

        const dailyNote = momentDate.isValid() ? getDailyNote(momentDate, getAllDailyNotes()) : null;

        const dailyNoteClass = dailyNote instanceof TFile
            ? 'cm-hmd-internal-link' // Class if daily note exists
            : 'chrono-is-unresolved';

        // Get the current key combo with insert mode and content format
        const keyCombo = this.keyboardHandler.getCurrentKeyCombo();
        
        // Determine appropriate preview based on the content format
        let readableDatePreview: string;

        // Use array includes for type-safe comparison
        const contentFormat = keyCombo.contentFormat;
        
        if (contentFormat === ContentFormat.SUGGESTION_TEXT) {
            readableDatePreview = item;
        } else if (contentFormat === ContentFormat.DAILY_NOTE) {
            readableDatePreview = dailyNotePreview;
        } else {
            // For PRIMARY and ALTERNATE formats
            readableDatePreview = getDatePreview(
                item,
                this.plugin.settings,
                contentFormat === ContentFormat.ALTERNATE,
                false
            );
        }

        // Create the preview container span
        const previewContainer = container.createEl('span', {
            cls: 'chrono-suggestion-preview'
        });

        // Determine the preview content based on insert mode and invert ctrl setting
        // Use array includes for type-safe comparisons
        const isPlaintext = keyCombo.insertMode === InsertMode.PLAINTEXT;
        const isInvertedLink = this.plugin.settings.invertCtrlBehavior && 
                              keyCombo.insertMode === InsertMode.LINK && 
                              keyCombo.contentFormat === ContentFormat.PRIMARY;
                              
        if (isPlaintext || isInvertedLink) {
            // For plaintext or inverted ctrl with link
            if (readableDatePreview) {
                previewContainer.appendText(`↳ ${readableDatePreview}`);
            }
        } else if (dailyNotePreview) {
            previewContainer.appendText('↳ ');
            
            // Create a span specifically for the daily note preview to assign a class
            const linkEl = previewContainer.createEl('a', {
                text: dailyNotePreview,
                cls: dailyNoteClass, 
                href: dailyNote ? dailyNote.path : '',
            });

            // Add click handler to prevent the suggestion selection and allow the link click
            linkEl.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();

                // Store reference to context before potentially closing it
                const currentContext = this.contextProvider;

                // Remove trigger phrase from editor if we're in an editor context
                if (currentContext &&
                    currentContext.context &&
                    currentContext.context.editor &&
                    currentContext.context.start &&
                    currentContext.context.end) {

                    const { editor, start, end } = currentContext.context;
                    // Remove the trigger phrase and query text from the editor
                    editor.replaceRange('', start, end);
                }

                // Dismiss the modal/context if it exists
                if (currentContext) {
                    if (typeof currentContext.close === 'function') {
                        // For modal contexts like OpenDailyNoteModal
                        currentContext.close();
                    } else if (typeof currentContext.suggestions?.close === 'function') {
                        // For EditorSuggest contexts
                        currentContext.suggestions.close();
                    }
                }

                if (momentDate.isValid()) {
                    // Use the utility function to get or create the daily note and open it
                    const file = await getOrCreateDailyNote(this.app, momentDate, true);
                    if (!file) console.error("Failed to handle daily note for:", item);
                }
            });

            if (dailyNotePreview !== readableDatePreview && readableDatePreview) {
                previewContainer.appendText(` ⭢ ${readableDatePreview}`);
            }
        } else if (readableDatePreview) {
            // Handle case where only readableDatePreview exists
            previewContainer.appendText(`↳ ${readableDatePreview}`);
        }

        // Remove the container if it ended up empty
        if (!previewContainer.hasChildNodes() && !previewContainer.textContent?.trim()) {
            previewContainer.remove();
        }
    }
    
    // Share the keyboard handler's key state with other components
    syncKeyStateFrom(otherHandler: KeyboardHandler): void {
        this.keyboardHandler.setKeyState(otherHandler.getKeyState());
    }
    
    // Allow other components to get this keyboard handler's key state
    getKeyboardHandler(): KeyboardHandler {
        return this.keyboardHandler;
    }
}