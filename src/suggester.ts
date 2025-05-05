import { App } from 'obsidian';
import ChronoLanguage from './main';
import { getDailyNotePreview, getDatePreview, getOrCreateDailyNote } from './utils';
import { getDailyNote, getAllDailyNotes, getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { EnhancedDateParser } from './parser';
import { TFile } from 'obsidian';
import { DEFAULT_KEYMAP, KeyState } from './types';

/**
 * Shared suggester for date suggestions
 */
export class Suggester {
    app: App;
    plugin: ChronoLanguage;
    keyState: KeyState = { shift: false, ctrl: false, alt: false };
    currentElements: Map<string, HTMLElement> = new Map();
    contextProvider: any; // Add property to store the context provider

    constructor(app: App, plugin: ChronoLanguage) {
        this.app = app;
        this.plugin = plugin;
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

    unload() {
        // Remove event listeners when plugin is unloaded
        this.removeKeyEventListeners();
        this.currentElements.clear();
    }

    handleKeyDown = (e: KeyboardEvent) => {
        let updated = false;
        
        if (e.key === 'Alt' && !this.keyState.alt) {
            this.keyState.alt = true;
            updated = true;
        } else if (e.key === 'Control' && !this.keyState.ctrl) {
            this.keyState.ctrl = true;
            updated = true;
        } else if (e.key === 'Shift' && !this.keyState.shift) {
            this.keyState.shift = true;
            updated = true;
        }
        
        if (updated) {
            this.updateAllPreviews();
        }
    };

    handleKeyUp = (e: KeyboardEvent) => {
        let updated = false;
        
        if (e.key === 'Alt' && this.keyState.alt) {
            this.keyState.alt = false;
            updated = true;
        } else if (e.key === 'Control' && this.keyState.ctrl) {
            this.keyState.ctrl = false;
            updated = true;
        } else if (e.key === 'Shift' && this.keyState.shift) {
            this.keyState.shift = false;
            updated = true;
        }
        
        if (updated) {
            this.updateAllPreviews();
        }
    };

    updateAllPreviews() {
        // Update all currently rendered suggestions
        this.currentElements.forEach((el, item) => {
            this.updatePreviewContent(item, el);
        });
    }

    getCurrentKeyCombo(): string {
        // Get base key state
        let { shift, ctrl, alt } = this.keyState;
        
        // Invert ctrl behavior if setting is enabled
        if (this.plugin.settings.invertCtrlBehavior) {
            ctrl = !ctrl;
        }
        
        if (shift && ctrl && alt) return 'ctrl+shift+alt';
        if (shift && ctrl) return 'ctrl+shift';
        if (ctrl && alt) return 'ctrl+alt';
        if (shift && alt) return 'shift+alt';
        if (shift) return 'shift';
        if (ctrl) return 'ctrl';
        if (alt) return 'alt';
        return 'none';
    }

    resetKeyState() {
        this.keyState = { shift: false, ctrl: false, alt: false };
    }

    getDateSuggestions(context: { query: string }, initialSuggestions?: string[]): string[] {
        // Reset modifier key states when suggestions are requested
        this.resetKeyState();
        
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
        
        // Use proper class based on note existence
        const dailyNoteClass = dailyNote instanceof TFile ? 'u-pop' : 'chrono-is-unresolved';
        
        const currentKeyCombo = this.getCurrentKeyCombo();
        const keyCombo = DEFAULT_KEYMAP[currentKeyCombo];

        // Get appropriate preview based on key combination
        let readableDatePreview: string;
        
        if (keyCombo.action === 'selectedplain' || keyCombo.action === 'selectedalias') {
            readableDatePreview = item;
        } else if (keyCombo.action === 'dailynote') {
            readableDatePreview = dailyNotePreview;
        } else {
            readableDatePreview = getDatePreview(
                item, 
                this.plugin.settings, 
                keyCombo.alt, 
                keyCombo.alt && keyCombo.shift
            );
        }

        // Create the preview container span
        const previewContainer = container.createEl('span', {
            cls: 'chrono-suggestion-preview'
        });

        // Determine the preview content based on key combination
        if (keyCombo.ctrl) {
            // If Ctrl is pressed, only show readableDatePreview
            if (readableDatePreview) {
                previewContainer.appendText(`↳ ${readableDatePreview}`);
            }
        } else if (dailyNotePreview) {
            // Original logic when Ctrl is not pressed
            previewContainer.appendText('↳ ');
            // Create a span specifically for the daily note preview to assign a class
            const linkEl = previewContainer.createEl('a', { 
                text: dailyNotePreview, 
                cls: dailyNoteClass, // Use the resolved or unresolved class
                href: dailyNote ? dailyNote.path : '', // Use actual daily note path as href
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
            // Handle case where only readableDatePreview exists and Ctrl is not pressed
            previewContainer.appendText(`↳ ${readableDatePreview}`);
        }

        // Remove the container if it ended up empty
        if (!previewContainer.hasChildNodes() && !previewContainer.textContent?.trim()) {
            previewContainer.remove();
        }
    }
}