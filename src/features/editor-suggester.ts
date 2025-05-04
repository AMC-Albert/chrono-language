import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, App } from 'obsidian';
import ChronoLanguage from '../main';
import { createDailyNoteLink } from '../utils';
import { Suggester } from '../suggester';

/**
 * A suggester for the editor that provides date parsing suggestions
 */
export class EditorSuggester extends EditorSuggest<string> {
    plugin: ChronoLanguage;
    private suggester: Suggester;
    
    constructor(plugin: ChronoLanguage) {
        super(plugin.app);
        this.plugin = plugin;
        this.suggester = new Suggester(this.app, this.plugin);
        
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
        return this.suggester.getDateSuggestions({ query: ctx.query });
    }

    renderSuggestion(item: string, el: HTMLElement) {
        this.suggester.renderSuggestionContent(item, el);
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