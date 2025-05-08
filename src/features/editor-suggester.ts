import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { StateEffect } from '@codemirror/state'; 
import ChronoLanguage from '../main';
import { addTriggerDecorationEffect, addSpacerWidgetEffect, safelyClearDecorations } from '../cm-decorations';
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

    private decoratedEditorView: EditorView | null = null; // To track editor view with active decorations
    private firstSpaceBlocked = false; // Track if we've already blocked the first space

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
        
        // Register space key handler to intercept spaces at beginning of query
        this.keyboardHandler.registerSpaceKeyHandler(this.handleSpaceKey);
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
     * Handles space key events to intercept spaces at the beginning of a query
     * Returns true if the event was handled (should be prevented)
     */
    private handleSpaceKey = (event: KeyboardEvent): boolean => {
        // Only intercept space if the suggester is open
        if (!this.isOpen || !this.context) return false;
        
        const editor = this.context.editor;
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const cursorSubstring = line.slice(0, cursor.ch);
        const triggerPhrase = this.plugin.settings.triggerPhrase;
        if (!triggerPhrase) return false;
        
        const lastTriggerIndex = cursorSubstring.lastIndexOf(triggerPhrase);
        if (lastTriggerIndex === -1) return false;
        
        const posAfterTrigger = lastTriggerIndex + triggerPhrase.length;
        const query = cursorSubstring.slice(posAfterTrigger);
        
        // Check if we're at the beginning of query (right after trigger phrase)
        if (cursor.ch === posAfterTrigger || query.trim() === '') {
            if (!this.firstSpaceBlocked) {
                // This is the first space - block it
                this.firstSpaceBlocked = true;
                return true; // Prevent the space
            } else {
                // This is the second space - insert space and dismiss suggester
                
                // Reset flag before we do anything else
                this.firstSpaceBlocked = false;
                
                // Set flags to prevent immediate re-trigger
                this.lastReplacedTriggerStart = { line: cursor.line, ch: lastTriggerIndex };
                this.lastInsertionEnd = { line: cursor.line, ch: cursor.ch + 1 };
                
                // Let the default space pass through by returning false
                // This will insert the space naturally
                
                // Close the suggester after the space has been added
                setTimeout(() => {
                    this.close();
                }, 0);
                
                // Do NOT prevent default! Let the space through
                return false;
            }
        }
        
        return false; // Not at beginning of query, don't intercept
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
        this.clearDecorations(); // Ensure decorations are cleared when plugin unloads
        this.suggester?.unload();
        this.keyboardHandler.unload();
    }

    private clearDecorations(editorViewToClear?: EditorView) {
        const view = editorViewToClear || this.decoratedEditorView;
        if (view) {
            // Use the safer function to clear decorations
            safelyClearDecorations(view);
            if (this.decoratedEditorView === view) {
                this.decoratedEditorView = null;
            }
        }
    }

    // Track when the suggester is opened
    open(): void {
        super.open();
        // Apply decorations only when the suggester is actually open
        this.applyTriggerDecorations();
    }

    // Clear decorations when suggester is closed
    close() {
        // Always clear decorations first when closing
        this.clearDecorations();
        
        // Reset flags
        this.firstSpaceBlocked = false;
        
        super.close();
    }

    // Apply decorations based on current context
    private applyTriggerDecorations(): void {
        if (!this.isOpen || !this.context) return;
        
        const editor = this.context.editor;
        const triggerPhrase = this.plugin.settings.triggerPhrase;
        if (!editor.cm || !triggerPhrase) return;
        
        // Clear any existing decorations first
        this.clearDecorations();
        
        // Only apply new decorations if the suggester is open
        const triggerStartOffset = editor.posToOffset(this.context.start);
        const triggerEndOffset = triggerStartOffset + triggerPhrase.length;
        const effects: StateEffect<any>[] = [addTriggerDecorationEffect.of({ from: triggerStartOffset, to: triggerEndOffset })];
        
        // Add spacer widget if query is empty
        const query = this.context.query;
        if (query === '') effects.push(addSpacerWidgetEffect.of(triggerEndOffset));
        
        try {
            if (editor.cm.dom.isConnected) {
                editor.cm.dispatch({
                    effects: effects
                });
                this.decoratedEditorView = editor.cm;
            }
        } catch (e) {
            this.decoratedEditorView = null;
        }
    }
    
    onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestContext | null {
        // Store and immediately clear the post-selection state flags
        const localLastReplacedTriggerStart = this.lastReplacedTriggerStart;
        const localLastInsertionEnd = this.lastInsertionEnd;
        this.lastReplacedTriggerStart = null;
        this.lastInsertionEnd = null;

        const triggerPhrase = this.plugin.settings.triggerPhrase;
        if (!triggerPhrase) return null;

        // Get the current line and find the last trigger phrase
        const line = editor.getLine(cursor.line);
        const cursorSubstring = line.slice(0, cursor.ch);
        const lastTriggerIndex = cursorSubstring.lastIndexOf(triggerPhrase);

        // If trigger phrase not found or cursor is before the end of trigger phrase
        if (lastTriggerIndex === -1 || cursor.ch < lastTriggerIndex + triggerPhrase.length) {
            this.firstSpaceBlocked = false;
            return null;
        }

        const posAfterTrigger = lastTriggerIndex + triggerPhrase.length;
        let query = cursorSubstring.slice(posAfterTrigger);

        // Check for spacey trigger scenario - this is when a trigger phrase is followed by spaces
        // If the query is just spaces or starts with a space, we should not re-trigger
        if (query.trim() === '' || query.startsWith(' ')) {
            // If we previously closed the suggester (via second space), don't re-trigger
            if (localLastReplacedTriggerStart && localLastInsertionEnd) {
                if (cursor.line === localLastInsertionEnd.line) {
                    // Prevent re-triggering when we're on the same line as a previous space dismissal
                    return null;
                }
            }
            
            // If we just opened and immediately see spaces, don't continue
            if (!this.isOpen && query.startsWith(' ')) {
                return null;
            }
        }

        // Handle normal trigger prevention logic
        if (localLastReplacedTriggerStart && localLastInsertionEnd) {
            if (cursor.line === localLastInsertionEnd.line && cursor.ch === localLastInsertionEnd.ch) {
                // We're at the insertion point of a previous selection
                if (lastTriggerIndex <= localLastReplacedTriggerStart.ch) {
                    // The trigger is at or before the previous trigger
                    this.firstSpaceBlocked = false;
                    return null;
                }
            }
        }

        // Trim leading space for processing
        if (query.startsWith(' ')) {
            query = query.slice(1);
        }

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            this.firstSpaceBlocked = false;
            return null;
        }

        // All checks passed. Create context without decorations.
        const contextStartPos = { line: cursor.line, ch: lastTriggerIndex };

        // Return context without applying decorations
        return {
            start: contextStartPos,
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