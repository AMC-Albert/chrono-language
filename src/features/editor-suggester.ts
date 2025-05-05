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
        this.keyboardHandler = new KeyboardHandler(this.scope, this.plugin.settings.plainTextByDefault);
        
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
        this.scope.register([], KEYS.CONTROL.toLowerCase(), (event: KeyboardEvent) => {
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
        
        this.scope.register([], KEYS.SHIFT.toLowerCase(), (event: KeyboardEvent) => {
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
        
        this.scope.register([], KEYS.ALT.toLowerCase(), (event: KeyboardEvent) => {
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
            // Use the new centralized logic for mode/format
            const { insertMode, contentFormat } = this.keyboardHandler.getEffectiveInsertModeAndFormat(event);
            if (this.suggester) {
                this.suggester.syncKeyStateFrom(this.keyboardHandler);
            }
            let insertText: string = "";
            if (insertMode === InsertMode.PLAINTEXT) {
                if (contentFormat === ContentFormat.SUGGESTION_TEXT) {
                    insertText = item;
                } else if (contentFormat === ContentFormat.DAILY_NOTE) {
                    insertText = getDailyNotePreview(item);
                } else {
                    insertText = getDatePreview(
                        item, 
                        this.plugin.settings, 
                        contentFormat === ContentFormat.ALTERNATE,
                        false,
                        contentFormat === ContentFormat.DAILY_NOTE
                    );
                }
            } else {
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