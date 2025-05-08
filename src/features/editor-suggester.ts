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
    private shouldInsertSpaceOnOpen: boolean = false; // Flag to insert space when suggester opens

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
        this.keyboardHandler.registerBackspaceKeyHandler(this.handleBackspaceKey);
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
        
        // Check if we're at the beginning of query (right after trigger phrase or auto-inserted space)
        if (cursor.ch === posAfterTrigger || query.trim() === '') {
            if (!this.firstSpaceBlocked) {
                // This is the first space - block it by preventing default editor action.
                this.firstSpaceBlocked = true;
                event.preventDefault(); 
                event.stopImmediatePropagation();
                return true; // Signal that the event was handled (and default prevented)
            } else {
                // This is the second space - allow it and dismiss suggester.
                this.firstSpaceBlocked = false; // Reset flag
                
                // Set state to prevent immediate re-trigger if user types near same spot.
                this.lastReplacedTriggerStart = { line: cursor.line, ch: lastTriggerIndex };
                this.lastInsertionEnd = { line: cursor.line, ch: cursor.ch + 1 }; // Account for the space being inserted
                
                // Close the suggester. The space character will be inserted by default editor action.
                setTimeout(() => {
                    this.close();
                }, 0);
                
                return false; // Do NOT prevent default; let the space be inserted.
            }
        }
        
        return false; // Not at the beginning of the query, don't intercept.
    };

    /**
     * Handles backspace key events to remove auto-inserted space
     * Returns true if the event was handled (should be prevented)
     */
    private handleBackspaceKey = (event: KeyboardEvent): boolean => {
        if (!this.isOpen || !this.context) return false;
        const editorView = this.context.editor.cm;
        if (!editorView) return false;
        const query = this.context.query;
        if (query === '') {
            const { line, ch } = this.context.end;
            const off = this.context.editor.posToOffset({ line, ch });
            // Remove the inserted space before context.end
            editorView.dispatch({ changes: { from: off - 1, to: off, insert: '' } });
            // Clear decorations and close
            this.clearDecorations();
            this.close();
            return true;
        }
        return false;
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

        // Auto-insert space to separate trigger phrase and query
        if (this.shouldInsertSpaceOnOpen && this.context) {
            const editor = this.context.editor;
            const insertCh = this.context.start.ch + this.plugin.settings.triggerPhrase.length;
            const pos = editor.posToOffset({ line: this.context.start.line, ch: insertCh });
            if (editor.cm) {
                editor.cm.dispatch({
                    changes: { from: pos, to: pos, insert: ' ' },
                    selection: { anchor: pos + 1 }
                });
            } else {
                editor.replaceRange(' ', { line: this.context.start.line, ch: insertCh });
                editor.setCursor({ line: this.context.start.line, ch: insertCh + 1 });
            }
            // update context end
            this.context.end = { line: this.context.start.line, ch: insertCh + 1 };
            this.shouldInsertSpaceOnOpen = false;
        }

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
        
        const query = this.context.query;

        // Always add spacer widget when there's no query to maintain separation
        if (query === '') {
            effects.push(addSpacerWidgetEffect.of(triggerEndOffset));
        }
        
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
        const localLastReplacedTriggerStart = this.lastReplacedTriggerStart;
        const localLastInsertionEnd = this.lastInsertionEnd;
        this.lastReplacedTriggerStart = null;
        this.lastInsertionEnd = null;

        const triggerPhrase = this.plugin.settings.triggerPhrase;
        if (!triggerPhrase) {
            this.firstSpaceBlocked = false;
            return null;
        }

        const originalLine = editor.getLine(cursor.line);
        const prefixBeforeCursor = originalLine.slice(0, cursor.ch);
        const lastTriggerIndexInPrefix = prefixBeforeCursor.lastIndexOf(triggerPhrase);

        if (lastTriggerIndexInPrefix === -1) {
            this.firstSpaceBlocked = false;
            return null;
        }

        const posImmediatelyAfterTrigger = lastTriggerIndexInPrefix + triggerPhrase.length;

        // if triggerHappy is false, require whitespace or start/end around the trigger phrase
        if (!this.plugin.settings.triggerHappy) {
            // check character before trigger
            if (lastTriggerIndexInPrefix > 0) {
                const beforeChar = originalLine[lastTriggerIndexInPrefix - 1];
                if (!/\s/.test(beforeChar)) {
                    this.firstSpaceBlocked = false;
                    return null;
                }
            }
            // check character after trigger
            if (posImmediatelyAfterTrigger < originalLine.length) {
                const afterChar = originalLine[posImmediatelyAfterTrigger];
                if (!/\s/.test(afterChar)) {
                    this.firstSpaceBlocked = false;
                    return null;
                }
            }
        }

        if (cursor.ch < posImmediatelyAfterTrigger) { // Cursor inside trigger
            this.firstSpaceBlocked = false;
            return null;
        }

        // Editing existing text check (suggester closed)
        if (!this.isOpen &&
            (cursor.ch > posImmediatelyAfterTrigger || originalLine.slice(cursor.ch).trim() !== '')) {
            this.firstSpaceBlocked = false;
            return null;
        }

        let queryForSuggestions: string;
        let finalEndPosForContext: EditorPosition = cursor; // Default to current cursor

        if (cursor.ch === posImmediatelyAfterTrigger &&
            (originalLine.length === posImmediatelyAfterTrigger || originalLine[posImmediatelyAfterTrigger] !== ' ')) {
            // Condition to insert space is met.
            this.shouldInsertSpaceOnOpen = true;
            
            // Context end will be at the trigger phrase end. Space insertion handled in open().
            finalEndPosForContext = { line: cursor.line, ch: posImmediatelyAfterTrigger }; 
            queryForSuggestions = '';
            this.firstSpaceBlocked = false; 
        } else {
            this.shouldInsertSpaceOnOpen = false; // Ensure flag is false if condition not met
            const textAfterTrigger = originalLine.slice(posImmediatelyAfterTrigger, cursor.ch);
            if (textAfterTrigger.startsWith(' ')) {
                queryForSuggestions = textAfterTrigger.slice(1);
            } else {
                queryForSuggestions = textAfterTrigger;
            }
            // finalEndPosForContext remains as current cursor, set by default

            if (queryForSuggestions.trim() !== '') {
                this.firstSpaceBlocked = false;
            }
        }

        // Post-selection re-trigger check
        if (localLastReplacedTriggerStart && localLastInsertionEnd) {
            if (cursor.line === localLastInsertionEnd.line && cursor.ch === localLastInsertionEnd.ch &&
                lastTriggerIndexInPrefix <= localLastReplacedTriggerStart.ch) {
                this.firstSpaceBlocked = false;
                return null;
            }
        }

        // Spacey trigger check: if suggester is closed, user types "trigger ", and no auto-insert this call.
        // Use finalEndPosForContext for the end boundary of the slice from originalLine.
        const rawTextAfterTriggerForSpaceyCheck = originalLine.slice(posImmediatelyAfterTrigger, finalEndPosForContext.ch);
        if (!this.isOpen && 
            rawTextAfterTriggerForSpaceyCheck.startsWith(' ') && rawTextAfterTriggerForSpaceyCheck.trim() === '') {
            this.firstSpaceBlocked = false;
            return null;
        }
        
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            this.firstSpaceBlocked = false;
            return null;
        }

        return {
            start: { line: cursor.line, ch: lastTriggerIndexInPrefix },
            end: finalEndPosForContext,
            query: queryForSuggestions,
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

        const { editor, start, end, file } = this.context; // 'start' is trigger start, 'end' is query end

        // Calculate finalText first, as its generation is independent of the removal timing
        const { insertMode, contentFormat } = this.keyboardHandler.getEffectiveInsertModeAndFormat(event as KeyboardEvent);
        const finalText = this.suggester.getFinalInsertText(
            item,
            insertMode,
            contentFormat,
            this.plugin.settings,
            file, // Pass the active TFile
            this.app // Pass the App instance
        );

        // Store the original start position of the trigger phrase. This is where the new text will be inserted.
        const originalTriggerStartPos = { line: start.line, ch: start.ch };

        // Step 1: Remove the trigger phrase and any query text.
        // The range (start, end) from the context covers the trigger phrase and the query.
        editor.replaceRange('', start, end);

        // Step 2: Insert the final text at the original start position of the trigger phrase.
        // After the first editor.replaceRange, the cursor is effectively at originalTriggerStartPos.
        // We insert the finalText there, so the range for this replacement is (originalTriggerStartPos, originalTriggerStartPos).
        editor.replaceRange(finalText, originalTriggerStartPos, originalTriggerStartPos);

        // Update state for preventing re-trigger. This should be based on the original trigger start
        // and the length of the newly inserted text.
        this.lastReplacedTriggerStart = { line: originalTriggerStartPos.line, ch: originalTriggerStartPos.ch };
        this.lastInsertionEnd = { line: originalTriggerStartPos.line, ch: originalTriggerStartPos.ch + finalText.length };
        
        // Explicitly set the cursor to the end of the inserted text
        editor.setCursor(this.lastInsertionEnd);
        
        // The EditorSuggest base class typically handles closing the suggester after this method completes.
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