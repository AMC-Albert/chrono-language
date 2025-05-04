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
    currentElements: Map<string, HTMLElement> = new Map();

    constructor(app: App, plugin: ChronoLanguage) {
        this.app = app;
        this.plugin = plugin;
        
        // Set up key event listeners
        this.setupKeyEventListeners();
    }
    
    setupKeyEventListeners() {
        // Listen for Alt key press events
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
    }

    onUnload() {
        // Clean up event listeners when the suggester is unloaded
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
    }

    handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Alt') {
            this.isAltKeyPressed = true;
            this.updateAllPreviews();
        }
    };

    handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Alt') {
            this.isAltKeyPressed = false;
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
        
        // Get both previews
        const dailyNotePreview = getDailyNotePreview(item);
        
        // Get the date preview based on whether Alt is pressed
        const formatToUse = this.isAltKeyPressed ? 
            this.plugin.settings.alternateFormat : 
            this.plugin.settings.primaryFormat;
        
        const readableDatePreview = getDatePreview(item, {
            ...this.plugin.settings,
            primaryFormat: formatToUse
        });
        
        if (dailyNotePreview) {
            // Only show dailyNotePreview if they're the same
            if (dailyNotePreview === readableDatePreview) {
                container.createEl('span', { 
                    text: `↳ ${dailyNotePreview}`,
                    cls: 'chrono-suggestion-preview' 
                });
            } else {
                container.createEl('span', { 
                    text: `↳ ${dailyNotePreview} ⭢ ${readableDatePreview}`,
                    cls: 'chrono-suggestion-preview' 
                });
            }
        }
    }
}