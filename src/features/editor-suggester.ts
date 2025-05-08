import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, Modifier } from 'obsidian';
import { EditorView } from '@codemirror/view';
import ChronoLanguage from '../main';
// Import the effects from main.ts
import { addTriggerDecorationEffect, clearTriggerDecorationsEffect } from '../main';
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
        this.clearDecorations(); // Ensure decorations are cleared when plugin unloads
        this.suggester?.unload();
        this.keyboardHandler.unload();
    }

    private clearDecorations(editorViewToClear?: EditorView) {
        const view = editorViewToClear || this.decoratedEditorView;
        if (view) {
            try {
                // Check if the view is still part of the document to avoid errors on destroyed views
                if (view.dom.isConnected) {
                    view.dispatch({
                        effects: clearTriggerDecorationsEffect.of(null)
                    });
                }
            } catch (e) {
                // console.warn("Chrono: Error clearing decorations, view might be destroyed.", e);
            }

            if (this.decoratedEditorView === view) {
                this.decoratedEditorView = null;
            }
        }
    }

    private clearDecorationsForCurrentEditor(editor: Editor) {
        // Clear decorations only if the current editor's CodeMirror view
        // is the one this suggester instance has decorated.
        if (editor.cm && this.decoratedEditorView === editor.cm) {
            this.clearDecorations(editor.cm);
        }
    }

    onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestContext | null {
        const localLastReplacedTriggerStart = this.lastReplacedTriggerStart;
        const localLastInsertionEnd = this.lastInsertionEnd;
        this.lastReplacedTriggerStart = null;
        this.lastInsertionEnd = null;

        const triggerPhrase = this.plugin.settings.triggerPhrase;
        if (!triggerPhrase) {
            this.clearDecorationsForCurrentEditor(editor);
            return null;
        }

        const line = editor.getLine(cursor.line);
        const cursorSubstring = line.slice(0, cursor.ch);
        const lastTriggerIndex = cursorSubstring.lastIndexOf(triggerPhrase);

        if (lastTriggerIndex === -1 || cursor.ch < lastTriggerIndex + triggerPhrase.length) {
            this.clearDecorationsForCurrentEditor(editor);
            return null;
        }

        // Post-selection re-trigger prevention logic (for selection/replacement)
        if (localLastReplacedTriggerStart && localLastInsertionEnd) {
            if (cursor.line === localLastInsertionEnd.line && cursor.ch === localLastInsertionEnd.ch) {
                if (lastTriggerIndex < localLastReplacedTriggerStart.ch && cursor.line === localLastReplacedTriggerStart.line) {
                    this.clearDecorationsForCurrentEditor(editor);
                    return null;
                }
            }
        }

        const triggerHappy = this.plugin.settings.triggerHappy;
        const posAfterTrigger = lastTriggerIndex + triggerPhrase.length;
        
        const rawQuery = cursorSubstring.slice(posAfterTrigger);
        let processedQuery = rawQuery;
        let replaceLeadingSpace = false;

        if (rawQuery.startsWith('\t')) { // Tab always closes
            this.clearDecorationsForCurrentEditor(editor);
            return null;
        }
        if (rawQuery.startsWith("  ")) { // Double space or more closes
            this.clearDecorationsForCurrentEditor(editor);
            return null;
        }
        
        if (rawQuery.startsWith(" ")) { // Single leading space
            // If rawQuery was " ", processedQuery becomes ""
            // If rawQuery was " text", processedQuery becomes "text"
            processedQuery = rawQuery.substring(1); 
            replaceLeadingSpace = true;
        }
        // If rawQuery does not start with a space (and not tab or multiple spaces), 
        // processedQuery remains rawQuery, replaceLeadingSpace remains false.

        const prevContext = (this.isOpen && this.context) ? { line: this.context.start.line, ch: this.context.start.ch } : null;

        // Universal Check 2: Boundary conditions.
        // These checks are about the characters *around* the trigger phrase itself.
        let blockActivation = false;

        if (prevContext && cursor.line === prevContext.line && lastTriggerIndex < prevContext.ch) {
            // Suggester was open, but current evaluation points to an *earlier* trigger on the same line
            const charAfterEarlierTrigger = posAfterTrigger < line.length ? line.charAt(posAfterTrigger) : ' ';
            if (charAfterEarlierTrigger !== ' ' && charAfterEarlierTrigger !== '\t') {
                blockActivation = true;
            }

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
            const charAfterTrigger = posAfterTrigger < line.length ? line.charAt(posAfterTrigger) : ' '; 
            if (charAfterTrigger !== ' ' && charAfterTrigger !== '\t') {
                blockActivation = true;
            }

            if (!blockActivation && !triggerHappy) {
                if (lastTriggerIndex > 0) {
                    const charBeforeTrigger = cursorSubstring.charAt(lastTriggerIndex - 1);
                    if (charBeforeTrigger !== ' ' && charBeforeTrigger !== '\t') {
                        blockActivation = true; 
                    }
                }
            }
        }

        if (blockActivation) {
            this.clearDecorationsForCurrentEditor(editor);
            return null;
        }

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            this.clearDecorationsForCurrentEditor(editor);
            return null;
        }

        // All checks passed. Suggester will open. Apply/Update decorations.
        const contextStartPos = { line: cursor.line, ch: lastTriggerIndex };

        if (editor.cm) { // editor.cm is the EditorView
            const triggerStartOffset = editor.posToOffset(contextStartPos);
            const triggerEndOffset = triggerStartOffset + triggerPhrase.length;
            const rawQueryEndOffset = editor.posToOffset(cursor); // End of rawQuery

            let queryDecorationFrom = triggerEndOffset;
            if (replaceLeadingSpace) {
                queryDecorationFrom = triggerEndOffset + 1;
            }
            // Ensure queryDecorationFrom does not exceed rawQueryEndOffset.
            // This handles the case where rawQuery was just " " and replaceLeadingSpace is true.
            if (queryDecorationFrom > rawQueryEndOffset) {
                 queryDecorationFrom = rawQueryEndOffset;
            }

            try {
                if (editor.cm.dom.isConnected) {
                    editor.cm.dispatch({
                        effects: addTriggerDecorationEffect.of({ 
                            triggerFrom: triggerStartOffset, 
                            triggerTo: triggerEndOffset, 
                            queryFrom: queryDecorationFrom, // Start of text to be styled as query
                            queryTo: rawQueryEndOffset,     // End of text to be styled as query
                            replaceLeadingSpace: replaceLeadingSpace
                        })
                    });
                    this.decoratedEditorView = editor.cm;

                    // If the query is empty (user just typed the trigger) and no leading space was replaced,
                    // attempt to force a cursor update. The margin-right on the trigger
                    // decoration should create the visual space.
                    if (processedQuery === '' && !replaceLeadingSpace) {
                        requestAnimationFrame(() => {
                            // Check if suggester is still open and view is connected,
                            // as this runs after a delay.
                            if (editor.cm && editor.cm.dom.isConnected && this.isOpen) {
                                // Explicitly set the selection to the end of the trigger phrase.
                                // This might encourage CM to re-evaluate the cursor's visual position
                                // respecting the CSS margin.
                                editor.cm.dispatch({
                                    selection: { anchor: triggerEndOffset, head: triggerEndOffset },
                                    // userEvent: "select.chrono.fixcursor" // Optional: for debugging selection source
                                });
                                // It might also be beneficial to ensure the editor view has focus,
                                // though typically it would if the user just typed.
                                // editor.cm.focus(); 
                            }
                        });
                    }

                } else {
                    // If view not connected, ensure we don't think it's decorated
                    if (this.decoratedEditorView === editor.cm) this.decoratedEditorView = null;
                }
            } catch (e) {
                // console.warn("Chrono: Error applying decorations", e);
                if (this.decoratedEditorView === editor.cm) this.decoratedEditorView = null;
            }
        }

        return {
            start: contextStartPos, // This is start of trigger for replacement purposes
            end: cursor,            // This is end of rawQuery for replacement purposes
            query: processedQuery,  // This is for fetching suggestions
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

        // Clear decorations upon selection, as the trigger phrase is being replaced.
        // The close() method will also be called, which redundantly calls clearDecorations,
        // but clearing here ensures it's done before text replacement if there's any async gap.
        this.clearDecorationsForCurrentEditor(this.context.editor);

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

    close() {
        // Clear decorations when the suggester is explicitly closed.
        this.clearDecorations();
        super.close();
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