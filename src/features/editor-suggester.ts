import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, App, Modifier } from 'obsidian';
import ChronoLanguage from '../main';
import { createDailyNoteLink, getDatePreview } from '../utils';
import { Suggester } from '../suggester';
import { DEFAULT_KEYMAP, KeyCombo } from '../types';

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
        
        // Set instructions based on the DEFAULT_KEYMAP, only including those with descriptions
        this.setInstructions(
            Object.entries(DEFAULT_KEYMAP)
                .filter(([key, combo]) => {
                    return key !== 'none' && combo.description !== undefined;
                })
                .map(([key, combo]) => ({
                    command: this.formatKeyComboForDisplay(key),
                    purpose: combo.description!
                }))
        );

        // Register keyboard shortcuts for all key combinations
        Object.entries(DEFAULT_KEYMAP).forEach(([key, combo]) => {
            const keys: Modifier[] = [];
            if (combo.shift) keys.push("Shift");
            if (combo.ctrl) keys.push("Ctrl");
            if (combo.alt) keys.push("Alt");
            
            this.scope.register(keys.length ? keys : null, "Enter", (event: KeyboardEvent) => {
                this.suggestions.useSelectedItem(event);
                return false;
            });
        });

        // Allow arrow navigation while modifier keys are held
        this.scope.register(null, "ArrowDown", (event: KeyboardEvent) => {
            this.suggestions.moveDown(event);
            return false; 
        });

        this.scope.register(null, "ArrowUp", (event: KeyboardEvent) => {
            this.suggestions.moveUp(event);
            return false;
        });
    }
    
    formatKeyComboForDisplay(key: string): string {
        if (key === 'none') return "None";
        return key.split('+')
            .map(k => k.charAt(0).toUpperCase() + k.slice(1))
            .join('+');
    }
    
    unload() {
        if (this.suggester) {
            this.suggester.unload();
        }
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
        // Pass the context (this) to the suggester for dismissing on link clicks
        this.suggester.renderSuggestionContent(item, el, this);
    }

    selectSuggestion(item: string, event: KeyboardEvent | MouseEvent): void {
        if (this.context) {
            const { editor, start, end } = this.context;
            
            // Get key state from the event
            const keyState = {
                shift: 'shiftKey' in event ? event.shiftKey : false,
                ctrl: 'ctrlKey' in event ? event.ctrlKey : false,
                alt: 'altKey' in event ? event.altKey : false
            };
            
            // Find the matching key combo
            let keyCombo: KeyCombo = DEFAULT_KEYMAP.none;
            for (const [key, combo] of Object.entries(DEFAULT_KEYMAP)) {
                if ((combo.shift === keyState.shift || combo.shift === undefined) &&
                    (combo.ctrl === keyState.ctrl || combo.ctrl === undefined) &&
                    (combo.alt === keyState.alt || combo.alt === undefined)) {
                    keyCombo = combo;
                    break;
                }
            }
            
            // Apply the appropriate action based on the key combo
            let insertText: string = "";
            
            if (keyCombo.action === 'textplain') {
                insertText = item;
            } else {
                const forceTextAsAlias = keyCombo.action === 'alias';
                const forceNoAlias = keyCombo.action === 'noalias'; 
                const insertPlaintext = keyCombo.ctrl;
                const useAlternateFormat = keyCombo.alt;

                insertText = insertPlaintext
                    ? getDatePreview(item, this.plugin.settings, useAlternateFormat, forceNoAlias, keyCombo.action === 'dailynote')
                    : createDailyNoteLink(
                        this.app, this.plugin.settings, this.context.file, item, forceTextAsAlias, useAlternateFormat, forceNoAlias
                    );
            }
            
            editor.replaceRange(insertText, start, end);
        }
    }
}