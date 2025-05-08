import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, Modifier } from 'obsidian';
import ChronoLanguage from '../main';
import { SuggestionProvider } from './suggestion-provider';
import { KeyboardHandler } from '../utils/keyboard-handler';
import { KEYS, MODIFIER_COMBOS, getInstructionDefinitions } from '../definitions/constants';

/**
 * A suggester for the editor that provides date parsing suggestions
 */
export class EditorSuggester extends EditorSuggest<string> {
    plugin: ChronoLanguage;
    private suggester: SuggestionProvider | null = null;
    private keyboardHandler: KeyboardHandler;

    // For tracking state after a suggestion is selected to prevent immediate re-trigger on an earlier phrase
    private lastReplacedTriggerStart: { line: number, ch: number } | null = null;
    private lastInsertionEnd: { line: number, ch: number } | null = null;
    
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
        // Store and immediately clear the post-selection state flags
        // This ensures they are used only for the first onTrigger call after a selection.
        const localLastReplacedTriggerStart = this.lastReplacedTriggerStart;
        const localLastInsertionEnd = this.lastInsertionEnd;
        this.lastReplacedTriggerStart = null;
        this.lastInsertionEnd = null;

        const triggerPhrase = this.plugin.settings.triggerPhrase;
        if (!triggerPhrase) return null;

        const line = editor.getLine(cursor.line);
        const cursorSubstring = line.slice(0, cursor.ch);
        const lastTriggerIndex = cursorSubstring.lastIndexOf(triggerPhrase);

        // If trigger phrase not found or cursor is before the end of trigger phrase
        if (lastTriggerIndex === -1 || cursor.ch < lastTriggerIndex + triggerPhrase.length) {
            return null;
        }

        // Post-selection re-trigger prevention logic (for selection/replacement)
        if (localLastReplacedTriggerStart && localLastInsertionEnd) {
            if (cursor.line === localLastInsertionEnd.line && cursor.ch === localLastInsertionEnd.ch) {
                if (lastTriggerIndex < localLastReplacedTriggerStart.ch && cursor.line === localLastReplacedTriggerStart.line) {
                    // The found trigger is on the same line but *before* the trigger that was just replaced.
                    // Prevent re-triggering on this earlier, stale trigger.
                    return null;
                }
            }
        }
        
        const triggerHappy = this.plugin.settings.triggerHappy;
        const posAfterTrigger = lastTriggerIndex + triggerPhrase.length; // Based on current lastTriggerIndex
        const query = cursorSubstring.slice(posAfterTrigger); // Based on current lastTriggerIndex

        // Stash previous context if suggester was open, to detect if lastTriggerIndex shifted backwards
        const prevContext = (this.isOpen && this.context) ? { line: this.context.start.line, ch: this.context.start.ch } : null;

        // Universal Check 1: Early escape if query starts with space/tab.
        // This handles closing the suggester if user types space as first char of query,
        // or if backspacing to an earlier trigger results in a query starting with a space.
        if (query.startsWith(' ') || query.startsWith('\t')) {
            return null;
        }
        
        // Universal Check 2: Boundary conditions.
        // These apply when initiating the suggester OR if the active trigger point shifts backwards due to e.g. backspacing.
        let blockActivation = false;

        if (prevContext && cursor.line === prevContext.line && lastTriggerIndex < prevContext.ch) {
            // Suggester was open, but current evaluation points to an *earlier* trigger on the same line
            // (e.g., user backspaced over the original trigger that kept the suggester open).
            // We must re-apply the strict "initiation" boundary checks for this *newly found, earlier* trigger.
            
            // Check A: Character on the line immediately after this earlier trigger.
            const charAfterEarlierTrigger = posAfterTrigger < line.length ? line.charAt(posAfterTrigger) : ' ';
            if (charAfterEarlierTrigger !== ' ' && charAfterEarlierTrigger !== '\t') {
                blockActivation = true;
            }

            // Check B: If not triggerHappy, character before this earlier trigger.
            if (!blockActivation && !triggerHappy) {
                if (lastTriggerIndex > 0) {
                    const charBeforeEarlierTrigger = cursorSubstring.charAt(lastTriggerIndex - 1);
                    if (charBeforeEarlierTrigger !== ' ' && charBeforeEarlierTrigger !== '\t') {
                        blockActivation = true;
                    }
                }
            }
        } else if (!this.isOpen) {
            // Suggester is not currently open, so these are standard "initiation" checks.

            // Check A: Character on the line immediately after the trigger phrase.
            const charAfterTrigger = posAfterTrigger < line.length ? line.charAt(posAfterTrigger) : ' '; 
            if (charAfterTrigger !== ' ' && charAfterTrigger !== '\t') {
                blockActivation = true;
            }

            // Check B: If not triggerHappy, character before the trigger.
            if (!blockActivation && !triggerHappy) {
                if (lastTriggerIndex > 0) {
                    const charBeforeTrigger = cursorSubstring.charAt(lastTriggerIndex - 1);
                    if (charBeforeTrigger !== ' ' && charBeforeTrigger !== '\t') {
                        blockActivation = true; 
                    }
                }
            }
        }
        // If this.isOpen is true AND the trigger point hasn't shifted backwards 
        // (i.e., lastTriggerIndex >= prevContext.ch or different line, or prevContext was null),
        // then the above conditional blocks for boundary checks are skipped.
        // The suggester continues with the current query (which we know doesn't start with a space).

        if (blockActivation) {
            return null;
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

        // Store state *before* editor.replaceRange, as this.context might be cleared by close()
        // which can be called before onTrigger if events are synchronous.
        // Storing start.line as well for robustness.
        this.lastReplacedTriggerStart = { line: start.line, ch: start.ch };
        this.lastInsertionEnd = { line: start.line, ch: start.ch + finalText.length };

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