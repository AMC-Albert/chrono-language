import { App } from 'obsidian';
import ChronoLanguage from './main';
import { getDailyNotePreview, getDatePreview } from './utils';

/**
 * Shared suggester for date suggestions
 */
export class Suggester {
    app: App;
    plugin: ChronoLanguage;

    constructor(app: App, plugin: ChronoLanguage) {
        this.app = app;
        this.plugin = plugin;
    }

    getDateSuggestions(context: { query: string }, initialSuggestions?: string[]): string[] {
        const suggestions = initialSuggestions || this.plugin.settings.initialSuggestions;
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
        
        // Get both previews
        const dailyNotePreview = getDailyNotePreview(item);
        const readableDatePreview = getDatePreview(item, this.plugin.settings);
        
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