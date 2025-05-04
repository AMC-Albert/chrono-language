import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, App } from 'obsidian';
import ChronoLanguage from '../main';
import { createDailyNoteLink, getDatePreview } from '../utils';
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
                purpose: "Selected text as alias"
            },
            {
                command: "Ctrl",
                purpose: "Insert as plain text"
            },
            {
                command: "Alt",
                purpose: "Alternate format"
            },
        ]);

        this.scope.register(["Shift"], "Enter", (event: KeyboardEvent) => {
            this.suggestions.useSelectedItem(event);
            return false;
        });

        this.scope.register(["Ctrl"], "Enter", (event: KeyboardEvent) => {
            this.suggestions.useSelectedItem(event);
            return false;
        });

        this.scope.register(["Alt"], "Enter", (event: KeyboardEvent) => {
            this.suggestions.useSelectedItem(event);
            return false;
        });

        this.scope.register(["Ctrl", "Alt"], "Enter", (event: KeyboardEvent) => {
            this.suggestions.useSelectedItem(event);
            return false;
        });

        this.scope.register(["Shift", "Alt"], "Enter", (event: KeyboardEvent) => {
            this.suggestions.useSelectedItem(event);
            return false;
        });

        this.scope.register(["Ctrl", "Shift"], "Enter", (event: KeyboardEvent) => {
            this.suggestions.useSelectedItem(event);
            return false;
        });

        this.scope.register(["Ctrl", "Shift", "Alt"], "Enter", (event: KeyboardEvent) => {
            this.suggestions.useSelectedItem(event);
            return false;
        });

        this.scope.register(null, "ArrowDown", (event: KeyboardEvent) => {
            this.suggestions.moveDown(event);
            return false; // Prevent default behavior, allow movement while modifier keys are held
        });

        this.scope.register(null, "ArrowUp", (event: KeyboardEvent) => {
            this.suggestions.moveUp(event);
            return false; // Prevent default behavior, allow movement while modifier keys are held
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
            const insertPlaintext = event.ctrlKey;
            const useAlternateFormat = event.altKey;

            let insertText: string = "";
            if (insertPlaintext && forceTextAsAlias) {
                insertText = item;
            } else {
                insertText = insertPlaintext
                ? getDatePreview(item, this.plugin.settings, useAlternateFormat)
                : createDailyNoteLink(
                    this.app, this.plugin.settings, this.context.file, item, forceTextAsAlias, useAlternateFormat
                );
            }
            editor.replaceRange(insertText, start, end);
        }
    }
}