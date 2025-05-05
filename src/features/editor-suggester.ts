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
        
        // Initial setup of instructions
        this.updateInstructions();

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

    /**
     * Updates the instructions based on current settings
     * This should be called whenever settings change
     */
    updateInstructions() {
        this.setInstructions(
            Object.entries(DEFAULT_KEYMAP)
                .filter(([key, combo]) => {
                    return key !== 'none' && combo.description !== undefined;
                })
                .map(([key, combo]) => {
                    // Use alternateDesc if invertCtrlBehavior is enabled and alternateDesc exists
                    let purpose = combo.description!;
                    if (this.plugin.settings.invertCtrlBehavior && combo.alternateDesc) {
                        purpose = combo.alternateDesc;
                    }
                    return {
                        command: this.formatKeyComboForDisplay(key),
                        purpose: purpose
                    };
                })
        );
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

        const line = editor.getLine(cursor.line);
        const triggerPhrase = this.plugin.settings.triggerPhrase;
        const cursorSubstring = line.slice(0, cursor.ch);

        // Find the last occurrence of the trigger phrase ending at or before the cursor
        const lastTriggerIndex = cursorSubstring.lastIndexOf(triggerPhrase);

        // If trigger phrase not found before the cursor
        if (lastTriggerIndex === -1) return null;

        // 1. Check character *before* the trigger phrase
        const charBefore = lastTriggerIndex > 0 ? cursorSubstring.charAt(lastTriggerIndex - 1) : ' '; // Treat start of line as space
        if (charBefore !== ' ' && charBefore !== '\t') {
            return null; // Not preceded by whitespace
        }

        const posAfterTrigger = lastTriggerIndex + triggerPhrase.length;

        // 2. Ensure cursor is actually at or after the potential trigger's end
        if (cursor.ch < posAfterTrigger) {
             return null; // Cursor is within the trigger phrase itself
        }

        const query = cursorSubstring.slice(posAfterTrigger);

        // 3. Check if the query starts with a space (dismisses suggester if space is typed first)
        if (query.startsWith(' ') || query.startsWith('\t')) {
            return null; // Query starts with space, dismiss.
        }

        // 4. Check character *immediately after* trigger *only if query is empty*
        // This prevents triggering when typing trigger before existing non-whitespace (e.g., "@pword")
        // or when the trigger is followed immediately by non-whitespace (e.g. "@triggerword")
        if (query.length === 0) {
            const charAfterInFullLine = posAfterTrigger < line.length ? line.charAt(posAfterTrigger) : ' '; // Check full line context
            if (charAfterInFullLine !== ' ' && charAfterInFullLine !== '\t') {
                return null; // Non-whitespace follows immediately, invalid initial trigger
            }
        }

        // If all checks pass, this is our valid trigger point
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return null;

        return {
            start: { line: cursor.line, ch: lastTriggerIndex },
            end: cursor,
            query: query,
            editor,
            file: activeFile
        };
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
            let keyState = {
                shift: 'shiftKey' in event ? event.shiftKey : false,
                ctrl: 'ctrlKey' in event ? event.ctrlKey : false,
                alt: 'altKey' in event ? event.altKey : false
            };
            
            // Invert ctrl behavior if setting is enabled
            if (this.plugin.settings.invertCtrlBehavior) {
                keyState.ctrl = !keyState.ctrl;
            }
            
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
            
            if (keyCombo.action === 'selectedplain') {
                insertText = item;
            } else {
                const forceTextAsAlias = keyCombo.action === 'selectedalias';
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