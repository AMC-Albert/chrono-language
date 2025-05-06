import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, Modifier } from 'obsidian';
import ChronoLanguage from '../main';
import { createDailyNoteLink, getDatePreview, getDailyNotePreview } from '../utils/helpers';
import { SuggestionProvider } from './suggestion-provider';
import { InsertMode, ContentFormat, getAllKeyCombos } from '../definitions/types';
import { KeyboardHandler } from '../utils/keyboard-handler';
import { KEYS } from '../definitions/constants';

/**
 * A suggester for the editor that provides date parsing suggestions
 */
export class EditorSuggester extends EditorSuggest<string> {
    plugin: ChronoLanguage;
    private suggester: SuggestionProvider | null = null;
    private keyboardHandler: KeyboardHandler;
    
    constructor(plugin: ChronoLanguage) {
        super(plugin.app);
        this.plugin = plugin;
        this.initComponents();
    }
    
    private initComponents() {
        // Initialize the keyboard handler with proper scope
        this.keyboardHandler = new KeyboardHandler(this.scope, this.plugin.settings.plainTextByDefault);
        
        // Initialize suggester after keyboard handler
        this.suggester = new SuggestionProvider(this.app, this.plugin);
        
        // Register keyboard shortcuts
        this.registerKeyboardHandlers();
        
        // Initial setup of instructions
        this.updateInstructions();
    }
    
    private registerKeyboardHandlers() {
        // Register Enter key with all modifier combinations
        getAllKeyCombos().forEach(combo => {
            const mods: Modifier[] = [];
            if (combo.ctrl)  mods.push('Ctrl');
            if (combo.shift) mods.push('Shift');
            if (combo.alt)   mods.push('Alt');
            
            // Register for Enter key
            this.scope.register(mods, KEYS.ENTER, this.handleSelectionKey);
        });
        
        // Register Tab key handlers (for openDailyNote and openDailyNoteNewTab actions)
        // These actions are defined in KeyboardHandler.DEFAULT_KEY_BINDINGS
        // and will call handleSelectionKey when their respective keys (Tab, Shift+Tab by default) are pressed.
        this.keyboardHandler.registerTabKeyHandlers(this.handleSelectionKey);
    }
    
    private handleSelectionKey = (event: KeyboardEvent): boolean => {
        if (!this.isOpen || !this.suggester || !this.context) return false;

        if (event.key === KEYS.TAB) {
            // This was triggered by a Tab-related action (e.g., openDailyNote, openDailyNoteNewTab)
            // Determine if Shift was pressed for "new tab" behavior.
            // This assumes default bindings or similar structure for these actions.
            const openInNewTab = event.shiftKey; // Simplified: assumes Shift is the distinguishing factor.
                                                // A more robust check might involve consulting keyBindings config
                                                // if Tab actions become more complexly configurable.

            this.suggester.handleDailyNoteAction(event, openInNewTab, this.context);
            // We've handled the action (opening a daily note), so close the suggester.
            return true; 
        }
        
        // For Enter key (and other non-Tab selections)
        return this.suggestions.useSelectedItem(event);
    };

    /**
     * Updates the instructions based on current settings
     */
    updateInstructions() {
        this.setInstructions(this.keyboardHandler.getInstructions());
    }
    
    unload() {
        if (this.suggester) {
            this.suggester.unload();
        }
        this.keyboardHandler.unload();
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
        if (!this.context) return;
        
        const { editor, start, end } = this.context;
        
        // Get insert mode and format based on current key state
        const { insertMode, contentFormat } = 
            this.keyboardHandler.getEffectiveInsertModeAndFormat(event as KeyboardEvent);
        
        // Insert the text
        editor.replaceRange(
            this.generateInsertText(item, insertMode, contentFormat),
            start, 
            end
        );
    }
    
    // Generate text to insert based on mode and format
    private generateInsertText(item: string, insertMode: InsertMode, contentFormat: ContentFormat): string {
        if (insertMode === InsertMode.PLAINTEXT) {
            // Handle plain text insertion
            if (contentFormat === ContentFormat.SUGGESTION_TEXT) {
                return item;
            }
            if (contentFormat === ContentFormat.DAILY_NOTE) {
                return getDailyNotePreview(item);
            }
            if (contentFormat === ContentFormat.ALTERNATE) {
                return getDatePreview(item, this.plugin.settings, true);
            }
            return getDatePreview(item, this.plugin.settings, false);
        } else {
            // Handle link insertion
            return createDailyNoteLink(
                this.app,
                this.plugin.settings,
                this.context!.file,
                item,
                contentFormat === ContentFormat.SUGGESTION_TEXT,
                contentFormat === ContentFormat.ALTERNATE,
                contentFormat === ContentFormat.DAILY_NOTE
            );
        }
    }

    /**
     * Update settings and trigger UI refresh
     */
    updateSettings(settings: { keyBindings?: Record<string, string>; plainTextByDefault?: boolean }): void {
        // Update the keyboard handler
        this.keyboardHandler.update(settings);
        
        // Update the UI
        this.updateInstructions();
        
        // Update the suggester if needed
        if (this.suggester) {
            this.suggester.updateSettings(settings);
        }
    }
}