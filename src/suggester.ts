import { App } from 'obsidian';
import ChronoLanguage from './main';
import { getDailyNotePreview, getDatePreview } from './utils';

/**
 * Shared suggester for date suggestions
 */
export class Suggester {
    app: App;
    plugin: ChronoLanguage;
    isAltKeyPressed: boolean = false;
    isCtrlKeyPressed: boolean = false; // Add Ctrl key state
    isShiftKeyPressed: boolean = false; // Add Shift key state
    currentElements: Map<string, HTMLElement> = new Map();

    constructor(app: App, plugin: ChronoLanguage) {
        this.app = app;
        this.plugin = plugin;
        this.setupKeyEventListeners();
    }
    
    setupKeyEventListeners() {
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
    }

    onUnload() {
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
    }

    handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Alt') {
            this.isAltKeyPressed = true;
            this.updateAllPreviews();
        } else if (e.key === 'Control') { // Handle Ctrl key down
            this.isCtrlKeyPressed = true;
            this.updateAllPreviews();
        } else if (e.key === 'Shift') { // Handle Shift key down
            this.isShiftKeyPressed = true;
            this.updateAllPreviews();
        }
    };

    handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Alt') {
            this.isAltKeyPressed = false;
            this.updateAllPreviews();
        } else if (e.key === 'Control') { // Handle Ctrl key up
            this.isCtrlKeyPressed = false;
            this.updateAllPreviews();
        } else if (e.key === 'Shift') { // Handle Shift key up
            this.isShiftKeyPressed = false;
            this.updateAllPreviews();
        }
    };

    updateAllPreviews() {
        // Update all currently rendered suggestions
        this.currentElements.forEach((el, item) => {
            this.updatePreviewContent(item, el);
        });
    }

    getDateSuggestions(context: { query: string }, initialSuggestions?: string[]): string[] {
        // Reset modifier key states when suggestions are requested
        this.isAltKeyPressed = false;
        this.isCtrlKeyPressed = false;
        this.isShiftKeyPressed = false;
        
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

    renderSuggestionContent(item: string, el: HTMLElement) {
        const container = el.createEl('div', { cls: 'chrono-suggestion-container' });
        container.createEl('span', { text: item, cls: 'chrono-suggestion-text' });
        
        // Store reference to this element
        this.currentElements.set(item, container);
        
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

        // Get the readable date preview, passing the Alt key state correctly
        let readableDatePreview = getDatePreview(item, this.plugin.settings, this.isAltKeyPressed);

        // If Shift is pressed, replace readableDatePreview with the original item
        if (this.isShiftKeyPressed) {
            readableDatePreview = item; 
        }

        // Create the preview container span
        const previewContainer = container.createEl('span', {
            cls: 'chrono-suggestion-preview'
        });

        // Determine the preview content based on Ctrl key state
        if (this.isCtrlKeyPressed) {
            // If Ctrl is pressed, only show readableDatePreview (or item if Shift is also pressed)
            if (readableDatePreview) {
                previewContainer.appendText(`↳ ${readableDatePreview}`);
            }
        } else if (dailyNotePreview) {
            // Original logic when Ctrl is not pressed
            previewContainer.appendText('↳ ');
            // Create a span specifically for the daily note preview to assign a class
            previewContainer.createEl('span', { 
                text: dailyNotePreview, 
                cls: 'u-pop'
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