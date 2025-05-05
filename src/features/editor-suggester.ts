import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, App } from 'obsidian';
import ChronoLanguage from '../main';
import { createDailyNoteLink, getDatePreview, getDailyNotePreview } from '../utils/helpers';
import { Suggester } from './suggestion-renderer';
import { KeyCombo, InsertMode, ContentFormat } from '../plugin-data/types';
import { KeyboardHandler } from '../utils/keyboard-handler';
import { KEYS } from '../plugin-data/constants';

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
        this.keyboardHandler = new KeyboardHandler(this.scope, this.plugin.settings.invertCtrlBehavior);
        
        // Initialize suggester after keyboard handler
        this.suggester = new Suggester(this.app, this.plugin);
        
        // Register keyboard shortcuts with appropriate callbacks
        this.setupKeyboardEventHandlers();
        
        // Initial setup of instructions
        this.updateInstructions();
    }
    
    private setupKeyboardEventHandlers() {
        // Register primary keyboard shortcuts
        this.keyboardHandler.registerShortcuts((event: KeyboardEvent) => {
            // Only handle Enter key with our custom logic
            if (event.key === KEYS.ENTER) {
                // Update key state from this event directly before handling
                // This ensures the current event's modifier state is captured
                this.keyboardHandler.setKeyState({
                    shift: event.shiftKey,
                    ctrl: event.ctrlKey,
                    alt: event.altKey
                });
                
                if (this.suggester) {
                    this.suggester.syncKeyStateFrom(this.keyboardHandler);
                }
                
                this.suggestions.useSelectedItem(event);
                return false; // Prevent default behavior
            }
            
            // For arrow keys, handle navigation
            if (event.key === KEYS.ARROW_DOWN) {
                this.suggestions.moveDown(event);
                return false; // Prevent default
            } else if (event.key === KEYS.ARROW_UP) {
                this.suggestions.moveUp(event);
                return false; // Prevent default
            }
            
            // Let other key combinations pass through
            return true;
        });
        
        // Set up event listeners to sync key states between suggester and editor
        this.scope.register([], 'keydown', (event: KeyboardEvent) => {
            if (!this.isOpen || !this.suggester) return true;
            
            // Update keyboard handler state
            const updated = this.keyboardHandler.updateKeyState(event, true);
            
            // If state changed, sync with suggester and update previews
            if (updated) {
                this.suggester.syncKeyStateFrom(this.keyboardHandler);
                this.suggester.updateAllPreviews();
            }
            
            return true; // Allow event to propagate
        });
        
        this.scope.register([], 'keyup', (event: KeyboardEvent) => {
            if (!this.isOpen || !this.suggester) return true;
            
            // Update keyboard handler state
            const updated = this.keyboardHandler.updateKeyState(event, false);
            
            // If state changed, sync with suggester and update previews
            if (updated) {
                this.suggester.syncKeyStateFrom(this.keyboardHandler);
                this.suggester.updateAllPreviews();
            }
            
            return true; // Allow event to propagate
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
            
            // Get the matched combo with insert mode and content format
            const keyCombo: KeyCombo = this.keyboardHandler.getMatchedCombo(event);
            
            // Sync key state with suggester for consistent UI updates
            if (this.suggester) {
                this.suggester.syncKeyStateFrom(this.keyboardHandler);
            }
            
            let insertText: string = "";
            
            if (keyCombo.insertMode === InsertMode.PLAINTEXT) {
                // Plain text handling based on content format
                if (keyCombo.contentFormat === ContentFormat.SUGGESTION_TEXT) {
                    // For plain text + suggestion text: use the item text directly
                    insertText = item;
                } else if (keyCombo.contentFormat === ContentFormat.DAILY_NOTE) {
                    // For plain text + daily note format: directly use getDailyNotePreview
                    insertText = getDailyNotePreview(item);
                } else {
                    // For other plain text formats, use getDatePreview with appropriate flags
                    insertText = getDatePreview(
                        item, 
                        this.plugin.settings, 
                        keyCombo.contentFormat === ContentFormat.ALTERNATE,
                        false, // No "no alias" concept for plain text
                        keyCombo.contentFormat === ContentFormat.DAILY_NOTE // Force daily note format when needed
                    );
                }
            } else {
                // Link handling
                insertText = createDailyNoteLink(
                    this.app, 
                    this.plugin.settings, 
                    this.context.file, 
                    item,
                    keyCombo.contentFormat === ContentFormat.SUGGESTION_TEXT,
                    keyCombo.contentFormat === ContentFormat.ALTERNATE,
                    keyCombo.contentFormat === ContentFormat.DAILY_NOTE
                );
            }
            
            // Handle invert ctrl behavior
            if (this.plugin.settings.invertCtrlBehavior) {
                // When Ctrl is inverted, swap link/plaintext behavior for base cases
                if (!event.shiftKey && !event.altKey) {
                    if (event.ctrlKey) {
                        // Ctrl → no modifiers effect (link)
                        insertText = createDailyNoteLink(
                            this.app, 
                            this.plugin.settings, 
                            this.context.file, 
                            item,
                            false,
                            false,
                            false
                        );
                    } else {
                        // No modifiers → Ctrl effect (plaintext)
                        insertText = getDatePreview(
                            item, 
                            this.plugin.settings, 
                            false, 
                            false
                        );
                    }
                }
            }
            
            editor.replaceRange(insertText, start, end);
        }
    }
}