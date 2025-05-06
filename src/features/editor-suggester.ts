import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, Modifier } from 'obsidian';
import ChronoLanguage from '../main';
import { createDailyNoteLink, getDatePreview, getDailyNotePreview } from '../utils/helpers';
import { Suggester } from './suggestion-renderer';
import { InsertMode, ContentFormat, getAllKeyCombos } from '../definitions/types';
import { KeyboardHandler } from '../utils/keyboard-handler';
import { KEYS } from '../definitions/constants';

/**
 * A suggester for the editor that provides date parsing suggestions
 */
export class EditorSuggester extends EditorSuggest<string> {
    plugin: ChronoLanguage;
    private suggester: Suggester | null = null;
    private keyboardHandler: KeyboardHandler;
    
    constructor(plugin: ChronoLanguage) {
        super(plugin.app);
        this.plugin = plugin;
        
        // Initialize the keyboard handler with proper scope
        this.keyboardHandler = new KeyboardHandler(this.scope, this.plugin.settings.plainTextByDefault);
        
        // Initialize suggester after keyboard handler
        this.suggester = new Suggester(this.app, this.plugin);
        
        // Register keyboard shortcuts with appropriate callbacks
        this.setupKeyboardEventHandlers();
        
        // Initial setup of instructions
        this.updateInstructions();
    }
    
    private setupKeyboardEventHandlers() {
        // update our keyState on raw keydown/keyup
        document.addEventListener('keydown',  e => this.keyboardHandler.updateKeyState(e, true));
        document.addEventListener('keyup',    e => this.keyboardHandler.updateKeyState(e, false));

        // Enter under every modifier combo
        getAllKeyCombos().forEach(combo => {
            const mods: Modifier[] = [];
            if (combo.ctrl)  mods.push('Ctrl');
            if (combo.shift) mods.push('Shift');
            if (combo.alt)   mods.push('Alt');
            this.scope.register(mods, KEYS.ENTER, (event) => {
                if (!this.isOpen || !this.suggester) return false;
                // sync preview state
                this.suggester.syncKeyStateFrom(this.keyboardHandler);
                return this.suggestions.useSelectedItem(event);
            });
        });

        // Arrow navigation (no modifiers)
        this.scope.register([], KEYS.ARROW_DOWN, (e) => { this.suggestions.moveDown(e); return false; });
        this.scope.register([], KEYS.ARROW_UP,   (e) => { this.suggestions.moveUp(e);   return false; });
    }

    /**
     * Updates the instructions based on current settings
     * This should be called whenever settings change
     */
    updateInstructions() {
        // Use keyboard handler to get the instructions
        this.keyboardHandler.setPlainTextByDefault(this.plugin.settings.plainTextByDefault);
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
        return this.suggester ? this.suggester.getDateSuggestions({ query: ctx.query }) : [];
    }

    renderSuggestion(item: string, el: HTMLElement) {
        if (this.suggester) {
            this.suggester.renderSuggestionContent(item, el, this);
        }
    }

    selectSuggestion(item: string, event: KeyboardEvent | MouseEvent): void {
        if (this.context) {
            const { editor, start, end } = this.context;
            // always derive insertMode/contentFormat from the actual event
            const { insertMode, contentFormat } = 
                this.keyboardHandler.getEffectiveInsertModeAndFormat(event as any);
            
            let insertText = "";

            if (insertMode === InsertMode.PLAINTEXT) {
                if (contentFormat === ContentFormat.SUGGESTION_TEXT) {
                    insertText = item;
                }
                else if (contentFormat === ContentFormat.DAILY_NOTE) {
                    insertText = getDailyNotePreview(item);
                }
                else if (contentFormat === ContentFormat.ALTERNATE) {
                    insertText = getDatePreview(item, this.plugin.settings, true);
                }
                else {  // PRIMARY
                    insertText = getDatePreview(item, this.plugin.settings, false);
                }
            }
            else {
                // link insertion, force flags based on contentFormat
                insertText = createDailyNoteLink(
                    this.app,
                    this.plugin.settings,
                    this.context.file,
                    item,
                    contentFormat === ContentFormat.SUGGESTION_TEXT,
                    contentFormat === ContentFormat.ALTERNATE,
                    contentFormat === ContentFormat.DAILY_NOTE
                );
            }

            editor.replaceRange(insertText, start, end);
        }
    }

    // Public method to update renderer settings and force re-render
    public updateRendererSettingsAndRerender() {
        if (this.suggester && typeof this.suggester.updateSettingsAndRerender === 'function') {
            this.suggester.updateSettingsAndRerender();
        }
    }
}