import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, Modifier } from 'obsidian';
import ChronoLanguage from '../main';
import { SuggestionProvider } from './suggestion-provider';
import { KeyboardHandler } from '../utils/keyboard-handler';
import { KEYS, MODIFIER_COMBOS, getInstructionDefinitions } from '../definitions/constants';

//
// TODO very easy to accidentally activate
// Add 'Now' phrase
//

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
        // Initialize keyboard handler and suggester
        this.keyboardHandler = new KeyboardHandler(this.scope, this.plugin.settings.plainTextByDefault);
        this.suggester = new SuggestionProvider(this.app, this.plugin);
        
        // Register keyboard handlers and update instructions
        this.registerKeyboardHandlers();
        this.updateInstructions();
    }
    
    private registerKeyboardHandlers() {
        // Register Enter key for selection (with various modifier combinations)
        this.registerEnterKeyHandlers();
        
        // Register Tab key handlers for daily note actions
        this.keyboardHandler.registerTabKeyHandlers(this.handleSelectionKey);
    }
    
    private registerEnterKeyHandlers() {
        // Register Enter key with all possible modifier combinations
        MODIFIER_COMBOS.forEach(mods => {
            this.scope.register(mods, KEYS.ENTER, this.handleSelectionKey);
        });
    }
    
    private handleSelectionKey = (event: KeyboardEvent): boolean => {
        if (!this.isOpen || !this.suggester || !this.context) return false;
        if (event.key === KEYS.TAB) {
            // Handle Tab key action (open daily note)
            const openInNewTab = event.shiftKey;
            this.suggester.handleDailyNoteAction(event, openInNewTab, this.context);
            return true;
        }
        
        // For Enter key and other selection actions
        return this.suggestions.useSelectedItem(event);
    };

    /**
     * Updates the instructions display based on keyboard handler settings
     */
    updateInstructions() {
        // Use dynamic instruction definitions
        this.setInstructions(getInstructionDefinitions(this.plugin.settings.plainTextByDefault));
        this.suggester?.updateSettings({
            plainTextByDefault: this.plugin.settings.plainTextByDefault,
            holidayLocale: this.plugin.settings.holidayLocale,
        });
    }
    
    unload() {
        this.suggester?.unload();
        this.keyboardHandler.unload();
    }
    
    onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestContext | null {
        const triggerPhrase = this.plugin.settings.triggerPhrase;
        if (!triggerPhrase) return null;

        const line = editor.getLine(cursor.line);
        const cursorSubstring = line.slice(0, cursor.ch);
        const lastTriggerIndex = cursorSubstring.lastIndexOf(triggerPhrase);

        // If trigger phrase not found or cursor is before the end of trigger phrase
        if (lastTriggerIndex === -1 || cursor.ch < lastTriggerIndex + triggerPhrase.length) {
            return null;
        }
        
        // Check for triggering conditions
        const triggerHappy = this.plugin.settings.triggerHappy;
        const posAfterTrigger = lastTriggerIndex + triggerPhrase.length;
        const query = cursorSubstring.slice(posAfterTrigger);

        // Early exit conditions
        if (query.startsWith(' ') || query.startsWith('\t')) {
            return null;
        }
        
        // When not in trigger-happy mode, check surrounding characters
        if (!triggerHappy) {
            // Check character before trigger
            if (lastTriggerIndex > 0) {
                const charBefore = cursorSubstring.charAt(lastTriggerIndex - 1);
                if (charBefore !== ' ' && charBefore !== '\t') {
                    return null;
                }
            }
            
            // Check character after trigger if query is empty
            if (query.length === 0) {
                const charAfterInFullLine = posAfterTrigger < line.length ? 
                    line.charAt(posAfterTrigger) : ' ';
                if (charAfterInFullLine !== ' ' && charAfterInFullLine !== '\t') {
                    return null;
                }
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
        return this.suggester ? this.suggester.getDateSuggestions(
            { query: ctx.query },
            this.plugin.settings.initialEditorSuggestions // Pass specific initial suggestions
        ) : [];
    }

    renderSuggestion(item: string, el: HTMLElement) {
        this.suggester?.renderSuggestionContent(item, el, this);
    }

    selectSuggestion(item: string, event: KeyboardEvent | MouseEvent): void {
        if (!this.context || !this.suggester) return;

        const { editor, start, end, file } = this.context;
        const { insertMode, contentFormat } = this.keyboardHandler.getEffectiveInsertModeAndFormat(event as KeyboardEvent);

        // Use the new method in SuggestionProvider to get the final text
        const finalText = this.suggester.getFinalInsertText(
            item,
            insertMode,
            contentFormat,
            this.plugin.settings,
            file, // Pass the active TFile
            this.app // Pass the App instance
        );

        editor.replaceRange(finalText, start, end);
    }

    /**
     * Update settings and trigger UI refresh
     */
    updateSettings(settings: { keyBindings?: Record<string, string>; plainTextByDefault?: boolean; holidayLocale?: string }): void {
        this.keyboardHandler.update(settings);
        this.updateInstructions();
        this.suggester?.updateSettings({
            plainTextByDefault: settings.plainTextByDefault ?? this.plugin.settings.plainTextByDefault,
            holidayLocale: settings.holidayLocale ?? this.plugin.settings.holidayLocale,
        });
    }
}