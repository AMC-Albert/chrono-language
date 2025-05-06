import { App, moment } from 'obsidian';
import ChronoLanguage from '../main';
import { getDailyNotePreview, getDatePreview, getOrCreateDailyNote } from '../utils/helpers';
import { getDailyNote, getAllDailyNotes } from 'obsidian-daily-notes-interface';
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

    constructor(app: App, plugin: ChronoLanguage) {
        this.app = app;
        this.plugin = plugin;
        // Initialize keyboard handler without requiring a scope
        this.keyboardHandler = new KeyboardHandler(undefined, plugin.settings.plainTextByDefault);
        this.setupEventListeners();
        
        // Register for key state changes
        this.keyboardHandler.addKeyStateChangeListener(this.handleKeyStateChange);
    }
    
    /**
     * Handle key state changes by updating UI
     */
    handleKeyStateChange = (): void => {
        // Update all UI elements when key state changes
        requestAnimationFrame(() => this.updateAllPreviews());
    };
    
    setupEventListeners() {
        // Listen for Tab key to handle daily note actions
        document.addEventListener('keydown', this.handleKeyboardNavigation);
    }

    removeEventListeners() {
        document.removeEventListener('keydown', this.handleKeyboardNavigation);
        this.keyboardHandler.removeKeyStateChangeListener(this.handleKeyStateChange);
    }
    
    // Handle keyboard navigation specifically for tab key
    handleKeyboardNavigation = (e: KeyboardEvent) => {
        // Only handle Tab key specifically for daily notes
        if (e.key === 'Tab') {
            // Handle open daily note in new tab
            if (e.ctrlKey && !e.altKey && !e.shiftKey) {
                this.handleDailyNoteAction(e, true);
                return;
            }
            
            // Handle open daily note in current pane
            if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
                this.handleDailyNoteAction(e, false);
                return;
            }
        }
        
        // Handle navigation keys with modifiers
        const navKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'];
        if (navKeys.includes(e.key) && (e.altKey || e.ctrlKey || e.shiftKey)) {
            e.preventDefault();
            e.stopImmediatePropagation();  // prevent text-selection on Shift+Arrow
            
            // Re-dispatch the event without modifiers to prevent text selection
            document.dispatchEvent(new KeyboardEvent('keydown', {
                key: e.key,
                code: e.code,
                bubbles: true,
                cancelable: true
            }));
        }
    };
    
    // Handle daily note opening actions
    private handleDailyNoteAction(e: KeyboardEvent, newTab: boolean) {
        e.preventDefault();
        e.stopImmediatePropagation();
        
        const sel = document.querySelector('.is-selected .chrono-suggestion-container') as HTMLElement;
        const link = sel?.querySelector('a[data-href]') as HTMLElement;
        
        if (link) {
            link.dispatchEvent(new MouseEvent('click', { 
                bubbles: true, 
                cancelable: true, 
                ctrlKey: newTab 
            }));
        }
    }

    unload() {
        this.removeEventListeners();
        this.currentElements.clear();
        this.keyboardHandler.unload();
    }

    updateAllPreviews() {
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

        // Update the preview for this item
        this.updatePreviewContent(item, container);
    }

    updatePreviewContent(item: string, container: HTMLElement) {
        // Remove any existing preview elements
        const existingPreview = container.querySelector('.chrono-suggestion-preview');
        if (existingPreview) {
            existingPreview.remove();
        }
        
        // Get current key state and determine insert mode/content format
        const { insertMode, contentFormat } = this.keyboardHandler.getEffectiveInsertModeAndFormat();
        
        const dailyNotePreview = getDailyNotePreview(item);
        let momentDate = moment(EnhancedDateParser.parseDate(item));
        const dailyNote = momentDate.isValid() ? getDailyNote(momentDate, getAllDailyNotes()) : null;
        const dailyNoteClass = dailyNote instanceof TFile ? '' : 'chrono-is-unresolved';
        
        // Determine the text to display based on content format
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
        
        // Create preview container
        const previewContainer = container.createEl('span', { cls: 'chrono-suggestion-preview' });
        
        // Display content based on insert mode
        if (insertMode === InsertMode.PLAINTEXT) {
            if (readableDatePreview) {
                previewContainer.appendText(`↳ ${readableDatePreview}`);
            }
        } else if (dailyNotePreview) {
            previewContainer.appendText('↳ ');
            const linkEl = previewContainer.createEl('a', {
                text: dailyNotePreview,
                cls: dailyNoteClass, 
                attr: { 'data-href': dailyNote?.path ?? '#', target: '_self', rel: 'noopener nofollow' }
            });
            
            // Add click handler for links
            linkEl.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                // Close the suggester
                this.closeSuggester();
                
                // Create and open the daily note
                const file = await getOrCreateDailyNote(this.app, momentDate, true);
                if (file) {
                    const leaf = this.app.workspace.getLeaf(event.ctrlKey);
                    await leaf.openFile(file);
                }
            });
            
            // Show additional preview if needed
            if (dailyNotePreview !== readableDatePreview && readableDatePreview) {
                previewContainer.appendText(` ⭢ ${readableDatePreview}`);
            }
        } else if (readableDatePreview) {
            previewContainer.appendText(`↳ ${readableDatePreview}`);
        }
        
        // Remove empty preview containers
        if (!previewContainer.hasChildNodes() && !previewContainer.textContent?.trim()) {
            previewContainer.remove();
        }
    }
    
    // Helper method to close the suggester
    private closeSuggester() {
        const currentContext = this.contextProvider;
        
        // Clear out editor context if available
        if (currentContext?.context?.editor && currentContext?.context?.start && currentContext?.context?.end) {
            const { editor, start, end } = currentContext.context;
            editor.replaceRange('', start, end);
        }
        
        // Close the suggester
        if (currentContext) {
            if (typeof currentContext.close === 'function') {
                currentContext.close();
            } else if (typeof currentContext.suggestions?.close === 'function') {
                currentContext.suggestions.close();
            }
        }
    }
    
    getKeyboardHandler(): KeyboardHandler {
        return this.keyboardHandler;
    }
}