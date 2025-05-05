import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, App } from 'obsidian';
import ChronoLanguage from '../main';
import { createDailyNoteLink, getDatePreview } from '../utils';
import { Suggester } from '../suggester';
import { KeyCombo } from '../types';
import { KeyboardHandler } from '../keyboard-handler';

/**
 * A suggester for the editor that provides date parsing suggestions
 */
export class EditorSuggester extends EditorSuggest<string> {
    plugin: ChronoLanguage;
    private suggester: Suggester;
    private keyboardHandler: KeyboardHandler;
    
    constructor(plugin: ChronoLanguage) {
        super(plugin.app);
        this.plugin = plugin;
        this.suggester = new Suggester(this.app, this.plugin);
        
        // Create the keyboard handler
        this.keyboardHandler = new KeyboardHandler(this.scope, this.plugin.settings.invertCtrlBehavior);
        
        // Register keyboard shortcuts with appropriate callbacks
        this.setupKeyboardEventHandlers();
        
        // Initial setup of instructions
        this.updateInstructions();
    }

    private setupKeyboardEventHandlers() {
        this.keyboardHandler.registerShortcuts((event: KeyboardEvent) => {
            if (event.key === "Enter") {
                this.suggestions.useSelectedItem(event);
            } else if (event.key === "ArrowDown") {
                this.suggestions.moveDown(event);
            } else if (event.key === "ArrowUp") {
                this.suggestions.moveUp(event);
            }
            return false; // Prevent default behavior
        });
    }

    /**
     * Updates the instructions based on current settings
     * This should be called whenever settings change
     */
    updateInstructions() {
        // Use keyboard handler to get the instructions
        this.keyboardHandler.setInvertCtrlBehavior(this.plugin.settings.invertCtrlBehavior);
        this.setInstructions(this.keyboardHandler.getInstructions());
    }
    
    unload() {
        if (this.suggester) {
            this.suggester.unload();
        }
    }
    
    onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestContext | null {
        if (!this.plugin.settings.triggerPhrase) return null;

        const line = editor.getLine(cursor.line);
        const triggerPhrase = this.plugin.settings.triggerPhrase;
        const cursorSubstring = line.slice(0, cursor.ch);
        const triggerHappy = this.plugin.settings.triggerHappy;

        const lastTriggerIndex = cursorSubstring.lastIndexOf(triggerPhrase);

        if (lastTriggerIndex === -1) return null;

        if (!triggerHappy) {
            const charBefore = lastTriggerIndex > 0 ? cursorSubstring.charAt(lastTriggerIndex - 1) : ' ';
            if (charBefore !== ' ' && charBefore !== '\t') {
                return null;
            }
        }

        const posAfterTrigger = lastTriggerIndex + triggerPhrase.length;

        if (cursor.ch < posAfterTrigger) {
             return null;
        }

        const query = cursorSubstring.slice(posAfterTrigger);

        if (query.startsWith(' ') || query.startsWith('\t')) {
            return null;
        }

        if (!triggerHappy && query.length === 0) {
            const charAfterInFullLine = posAfterTrigger < line.length ? line.charAt(posAfterTrigger) : ' ';
            if (charAfterInFullLine !== ' ' && charAfterInFullLine !== '\t') {
                return null;
            }
        }

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
        this.suggester.renderSuggestionContent(item, el, this);
    }

    selectSuggestion(item: string, event: KeyboardEvent | MouseEvent): void {
        if (this.context) {
            const { editor, start, end } = this.context;
            
            const matchedCombo: KeyCombo = this.keyboardHandler.getMatchedCombo(event);
            
            let insertText: string = "";
            
            if (matchedCombo.action === 'selectedplain') {
                insertText = item;
            } else {
                const forceTextAsAlias = matchedCombo.action === 'selectedalias';
                const forceNoAlias = matchedCombo.action === 'noalias'; 
                const insertPlaintext = (matchedCombo.action === 'plaintext' && !this.plugin.settings.invertCtrlBehavior) || 
                                        (matchedCombo.action === 'link' && this.plugin.settings.invertCtrlBehavior && matchedCombo.ctrl === true) || 
                                        (matchedCombo.action === 'altplain');

                const useAlternateFormat = matchedCombo.action === 'alternate' || matchedCombo.action === 'altplain';

                insertText = insertPlaintext
                    ? getDatePreview(item, this.plugin.settings, useAlternateFormat, forceNoAlias, matchedCombo.action === 'dailynote')
                    : createDailyNoteLink(
                        this.app, this.plugin.settings, this.context.file, item, forceTextAsAlias, useAlternateFormat, forceNoAlias
                    );
            }
            
            editor.replaceRange(insertText, start, end);
        }
    }
}