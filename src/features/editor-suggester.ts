import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, Modifier } from 'obsidian';
import ChronoLanguage from '../main';
import { createDailyNoteLink, getDatePreview, getDailyNotePreview } from '../utils/helpers';
import { SuggestionProvider } from './suggestion-provider';
import { InsertMode, ContentFormat } from '../definitions/types';
import { KeyboardHandler } from '../utils/keyboard-handler';
import { KEYS, MODIFIER_COMBOS } from '../definitions/constants';
import { getInstructionDefinitions } from '../definitions/constants';

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
        if (!this.context) return;
        
        const { editor, start, end } = this.context;
        
        // Get insert mode and format based on current key state
        const { insertMode, contentFormat } = 
            this.keyboardHandler.getEffectiveInsertModeAndFormat(event as KeyboardEvent);
        
        // Insert the appropriate text
        editor.replaceRange(
            this.generateInsertText(item, insertMode, contentFormat),
            start, 
            end
        );
    }
    
    // Generate text to insert based on mode and format
    private generateInsertText(item: string, insertMode: InsertMode, contentFormat: ContentFormat): string {
        if (insertMode === InsertMode.PLAINTEXT) {
            return this.generatePlainText(item, contentFormat);
        } else {
            return this.generateLink(item, contentFormat);
        }
    }
    
    private generatePlainText(item: string, contentFormat: ContentFormat): string {
        switch (contentFormat) {
            case ContentFormat.SUGGESTION_TEXT:
                return item;
            case ContentFormat.DAILY_NOTE:
                return getDailyNotePreview(item);
            case ContentFormat.ALTERNATE:
                return getDatePreview(item, this.plugin.settings, true);
            default:
                return getDatePreview(item, this.plugin.settings, false);
        }
    }
    
    private generateLink(item: string, contentFormat: ContentFormat): string {
        const file = this.context?.file;
        if (!file) return item;
        
        return createDailyNoteLink(
            this.app,
            this.plugin.settings,
            file,
            item,
            contentFormat === ContentFormat.SUGGESTION_TEXT,
            contentFormat === ContentFormat.ALTERNATE,
            contentFormat === ContentFormat.DAILY_NOTE
        );
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