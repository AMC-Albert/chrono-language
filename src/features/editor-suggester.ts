import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, App } from 'obsidian';
import ChronoLanguage from '../main';
import { createDailyNoteLink, getDatePreview } from '../utils';
import { Suggester } from '../suggester';
import { KeyCombo, Action } from '../types';
import { KeyboardHandler } from '../keyboard-handler';

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
        
        // Initialize the keyboard handler first with proper scope
        this.keyboardHandler = new KeyboardHandler(this.scope, this.plugin.settings.invertCtrlBehavior);
        
        // Initialize suggester after keyboard handler
        this.suggester = new Suggester(this.app, this.plugin);
        
        // Register keyboard shortcuts with appropriate callbacks
        this.setupKeyboardEventHandlers();
        
        // Initial setup of instructions
        this.updateInstructions();
        
        // Add event listener for key changes to sync with suggester
        document.addEventListener('keydown', this.onKeyEvent);
        document.addEventListener('keyup', this.onKeyEvent);
    }
    
    // Add method to handle key events and update suggester
    onKeyEvent = (event: KeyboardEvent) => {
        if (this.isOpen && this.suggester) {
            this.suggester.updateAllPreviews();
        }
    };

    private setupKeyboardEventHandlers() {
        this.keyboardHandler.registerShortcuts((event: KeyboardEvent) => {
            // Only handle Enter key with our custom logic
            if (event.key === "Enter") {
                this.suggestions.useSelectedItem(event);
                return false; // Prevent default behavior
            }
            
            // For arrow keys, only handle if no other modifier is pressed
            // This allows modifier keys to show previews while navigating
            if (event.key === "ArrowDown") {
                this.suggestions.moveDown(event);
                return false; // Prevent default
            } else if (event.key === "ArrowUp") {
                this.suggestions.moveUp(event);
                return false; // Prevent default
            }
            
            // Let other key combinations pass through
            return true;
        });
        
        // Add direct document listeners for arrow keys with modifiers
        // This ensures we can still navigate suggestions when modifiers are pressed
        document.addEventListener('keydown', this.handleArrowKeys);
    }
    
    // Add a specific handler for arrow keys
    handleArrowKeys = (event: KeyboardEvent) => {
        if (!this.isOpen) return;
        
        if (event.key === "ArrowDown") {
            // Only handle if we're open and an active selection exists
            this.suggestions.moveDown(event);
            event.preventDefault();
            event.stopPropagation();
        } else if (event.key === "ArrowUp") {
            // Only handle if we're open and an active selection exists
            this.suggestions.moveUp(event);
            event.preventDefault();
            event.stopPropagation();
        }
    };

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
        document.removeEventListener('keydown', this.onKeyEvent);
        document.removeEventListener('keyup', this.onKeyEvent);
        document.removeEventListener('keydown', this.handleArrowKeys);
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
            
            // If the suggester exists, sync its key state with the current event
            if (this.suggester && event instanceof KeyboardEvent) {
                this.suggester.keyState = {
                    shift: event.shiftKey,
                    ctrl: event.ctrlKey,
                    alt: event.altKey
                };
            }
            
            const matchedCombo: KeyCombo = this.keyboardHandler.getMatchedCombo(event);
            
            let insertText: string = "";
            
            // Use the action field instead of checking specific modifiers
            if (matchedCombo.action === Action.SELECTED_PLAIN) {
                insertText = item;
            } else {
                const forceTextAsAlias = matchedCombo.action === Action.SUGGESTION_TEXT;
                const forceNoAlias = matchedCombo.action === Action.NO_ALIAS;
                
                // Determine if we should insert plain text based on the action
                // rather than specific modifier combinations
                const insertPlaintext = matchedCombo.action === Action.PLAINTEXT || 
                                       matchedCombo.action === Action.ALT_PLAIN ||
                                       // Still support the inverted behavior pattern but make it more action-focused
                                       (this.plugin.settings.invertCtrlBehavior && matchedCombo.action === Action.LINK && matchedCombo.ctrl);

                // Determine format options based on action
                const useAlternateFormat = matchedCombo.action === Action.ALTERNATE || 
                                          matchedCombo.action === Action.ALT_PLAIN ||
                                          matchedCombo.alt;

                insertText = insertPlaintext
                    ? getDatePreview(
                        item, 
                        this.plugin.settings, 
                        useAlternateFormat, 
                        forceNoAlias, 
                        matchedCombo.action === Action.DAILY_NOTE
                    )
                    : createDailyNoteLink(
                        this.app, 
                        this.plugin.settings, 
                        this.context.file, 
                        item, 
                        forceTextAsAlias, 
                        useAlternateFormat, 
                        forceNoAlias
                    );
            }
            
            editor.replaceRange(insertText, start, end);
        }
    }
}