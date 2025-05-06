import { App } from 'obsidian';
import ChronoLanguage from '../main';
import { getDailyNotePreview, getDatePreview, getOrCreateDailyNote } from '../utils/helpers';
import { getDailyNote, getAllDailyNotes } from 'obsidian-daily-notes-interface';
import { EnhancedDateParser } from '../utils/parser';
import { TFile } from 'obsidian';
import { InsertMode, ContentFormat } from '../definitions/types';
// Ensure this import path is correct and points to the file where getCurrentKeyCombo is implemented
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
        this.keyboardHandler = new KeyboardHandler(undefined, plugin.settings.plainTextByDefault);
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

    // Add this method to allow settings update and force re-render
    updateSettingsAndRerender() {
        this.keyboardHandler.setPlainTextByDefault(this.plugin.settings.plainTextByDefault);
        this.updateAllPreviews();
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

        // Always update the preview for this item using the latest settings
        this.keyboardHandler.setPlainTextByDefault(this.plugin.settings.plainTextByDefault);
        this.updatePreviewContent(item, container);
    }

    updatePreviewContent(item: string, container: HTMLElement) {
        // Remove any existing preview elements
        const existingPreview = container.querySelector('.chrono-suggestion-preview');
        if (existingPreview) {
            existingPreview.remove();
        }
        // Always use the latest settings for insert mode/content format
        this.keyboardHandler.setPlainTextByDefault(this.plugin.settings.plainTextByDefault);
        const { insertMode, contentFormat } = this.keyboardHandler.getEffectiveInsertModeAndFormat();
        const dailyNotePreview = getDailyNotePreview(item);
        let momentDate = window.moment(EnhancedDateParser.parseDate(item));
        const dailyNote = momentDate.isValid() ? getDailyNote(momentDate, getAllDailyNotes()) : null;
        const dailyNoteClass = dailyNote instanceof TFile
            ? 'cm-hmd-internal-link'
            : 'chrono-is-unresolved';
        let readableDatePreview: string;
        if (contentFormat === ContentFormat.SUGGESTION_TEXT) {
            readableDatePreview = item;
        } else if (contentFormat === ContentFormat.DAILY_NOTE) {
            readableDatePreview = dailyNotePreview;
        } else {
            readableDatePreview = getDatePreview(
                item,
                this.plugin.settings,
                contentFormat === ContentFormat.ALTERNATE,
                false
            );
        }
        const previewContainer = container.createEl('span', {
            cls: 'chrono-suggestion-preview'
        });
        if (insertMode === InsertMode.PLAINTEXT) {
            if (readableDatePreview) {
                previewContainer.appendText(`↳ ${readableDatePreview}`);
            }
        } else if (dailyNotePreview) {
            previewContainer.appendText('↳ ');
            const linkEl = previewContainer.createEl('a', {
                text: dailyNotePreview,
                cls: dailyNoteClass, 
                href: dailyNote ? dailyNote.path : '',
            });
            linkEl.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const currentContext = this.contextProvider;
                if (currentContext &&
                    currentContext.context &&
                    currentContext.context.editor &&
                    currentContext.context.start &&
                    currentContext.context.end) {
                    const { editor, start, end } = currentContext.context;
                    editor.replaceRange('', start, end);
                }
                if (currentContext) {
                    if (typeof currentContext.close === 'function') {
                        currentContext.close();
                    } else if (typeof currentContext.suggestions?.close === 'function') {
                        currentContext.suggestions.close();
                    }
                }
                if (momentDate.isValid()) {
                    const file = await getOrCreateDailyNote(this.app, momentDate, true);
                    if (!file) console.error("Failed to handle daily note for:", item);
                }
            });
            if (dailyNotePreview !== readableDatePreview && readableDatePreview) {
                previewContainer.appendText(` ⭢ ${readableDatePreview}`);
            }
        } else if (readableDatePreview) {
            previewContainer.appendText(`↳ ${readableDatePreview}`);
        }
        if (!previewContainer.hasChildNodes() && !previewContainer.textContent?.trim()) {
            previewContainer.remove();
        }
    }
    
    // Share the keyboard handler's key state with other components
    syncKeyStateFrom(otherHandler: KeyboardHandler): void {
        this.keyboardHandler.setKeyState(otherHandler.getKeyState());
        // Keep plainTextByDefault in sync with plugin settings
        this.keyboardHandler.setPlainTextByDefault(this.plugin.settings.plainTextByDefault);
    }
    
    // Allow other components to get this keyboard handler's key state
    getKeyboardHandler(): KeyboardHandler {
        return this.keyboardHandler;
    }
}