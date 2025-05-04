import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext } from 'obsidian';
import ChronoLanguage from './main';
import { createDailyNoteLink, getDatePreview, getDailyNotePreview } from './utils';

/**
 * A suggester for the editor that provides date parsing suggestions
 */
export class EditorSuggester extends EditorSuggest<string> {
    plugin: ChronoLanguage;
    
    constructor(plugin: ChronoLanguage) {
        super(plugin.app);
        this.plugin = plugin;
        
        // Add usage instructions
        this.setInstructions([
            {
                command: "Shift",
                purpose: "Force selected text as alias"
            }
        ]);

        // Register Shift+Enter to capture shift key during keyboard selection
        this.scope.register(["Shift"], "Enter", (event: KeyboardEvent) => {
            // @ts-ignore
            this.suggestions.useSelectedItem(event);
            return false;
        });
    }
    
    onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestContext | null {
        // If trigger phrase is empty, disable the suggester
        if (!this.plugin.settings.triggerPhrase) return null;
        
        const line = editor.getLine(cursor.line).slice(0, cursor.ch);
        // Match the custom trigger phrase followed by any characters
        const triggerRegex = new RegExp(`${this.plugin.settings.triggerPhrase}([^${this.plugin.settings.triggerPhrase.charAt(0)}]*)$`);
        const m = line.match(triggerRegex);
        if (!m) return null;
        
        if (m.index! > 0) {
            const charBeforeTrigger = line.charAt(m.index! - 1);
            // If the character before trigger isn't a space or beginning of line, don't activate
            if (charBeforeTrigger !== ' ' && charBeforeTrigger !== '\t') return null;
        }

        // If the query starts with a space, dismiss the suggester
        if (m[1].startsWith(" ")) return null;
        
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return null;
        return { start: { line: cursor.line, ch: m.index! }, end: cursor, query: m[1], editor, file: activeFile };
    }

    getSuggestions(ctx: EditorSuggestContext): string[] {
        const filtered = this.plugin.settings.initialSuggestions.filter(
            c => c.toLowerCase().startsWith(ctx.query.toLowerCase())
        );
        
        // If no matches found, create a fallback suggestion with the user's input
        if (filtered.length === 0 && ctx.query) {
            // Capitalize first letter to match the style of other suggestions
            const capitalizedInput = ctx.query.charAt(0).toUpperCase() + ctx.query.slice(1);
            return [capitalizedInput];
        }
        
        return filtered;
    }

    renderSuggestion(item: string, el: HTMLElement) {
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

    selectSuggestion(item: string, event: KeyboardEvent | MouseEvent): void {
        if (this.context) {
            const { editor, start, end } = this.context;
            const forceTextAsAlias = event.shiftKey;
            const link = createDailyNoteLink(this.app, this.plugin.settings, this.context.file, item, forceTextAsAlias);
            editor.replaceRange(link, start, end);
        }
    }
}