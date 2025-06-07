import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { StateEffect } from '@codemirror/state'; 
import QuickDates from '../../main';
import { addTriggerDecorationEffect, addSpacerWidgetEffect, safelyClearDecorations } from './decorations';
import { SuggestionProvider } from '../suggestion-provider';
import { KeyboardHandler } from '../../utils/keyboard-handler';
import { KEYS, CLASSES, getInstructionDefinitions, MODIFIER_KEY } from '../../constants';
import { parseTriggerContext } from './trigger-parser';
import { debug, info, warn, error, registerLoggerClass } from '../../utils/obsidian-logger';

/**
 * A suggester for the editor that provides date parsing suggestions
 */
export class EditorSuggester extends EditorSuggest<string> {
	plugin: QuickDates;
	private suggester: SuggestionProvider | null = null;
	private keyboardHandler: KeyboardHandler;

	// For tracking state after a suggestion is selected to prevent immediate re-trigger on an earlier phrase
	private lastReplacedTriggerStart: { line: number, ch: number } | null = null;
	private lastInsertionEnd: { line: number, ch: number } | null = null;

	private decoratedEditorView: EditorView | null = null; // To track editor view with active decorations
	private firstSpaceBlocked = false; // Track if we've already blocked the first space
	private shouldInsertSpaceOnOpen: boolean = false; // Flag to insert space when suggester opens
	private suggestionChosen = false;
	private lastContext: EditorSuggestContext | null = null;
	private cleanupEnd: EditorPosition | null = null;

	// Handler references for daily note keybinds
	private openDailySameTabHandler: any = null;
	private openDailyNewTabHandler: any = null;    constructor(plugin: QuickDates) {
		super(plugin.app);
		this.plugin = plugin;
		registerLoggerClass(this, 'EditorSuggester');
		debug(this, 'constructor', 'Initializing...');
		this.initComponents();
		debug(this, 'constructor', 'Initialization complete');
	}

	private initComponents() {
		debug(this, 'initComponents', 'Initializing components...');
		// Initialize keyboard handler and suggester
		this.keyboardHandler = new KeyboardHandler(this.scope, this.plugin.settings.plainTextByDefault);
		this.suggester = new SuggestionProvider(this.app, this.plugin);
		this.suggester.setEditorSuggesterRef(this);

		// Register Enter key handlers
		this.keyboardHandler.registerEnterKeyHandlers(this.handleSelectionKey);

		// Register daily note keybinds (Shift+Space / Ctrl+Shift+Space)
		this.registerDailyNoteKeybinds();

		this.keyboardHandler.registerBackspaceKeyHandler(this.handleBackspaceKey);
		this.keyboardHandler.registerTabKeyHandler(this.handleTabKey);
		this.keyboardHandler.addKeyStateChangeListener(() => this.updateInstructions());
		this.updateInstructions();
		debug(this, 'initComponents', 'Components initialized successfully');
	}

	/** Handle Shift+Space to open daily note in same tab */
	private handleDailyNote(event: KeyboardEvent): boolean {
		if (!this.isOpen || !this.suggester || !this.context) return false;
		this.suggester.handleDailyNoteAction(event, false, this.context);
		return true;
	}

	/** Handle Ctrl+Shift+Space to open daily note in new tab */
	private handleDailyNoteNewTab(event: KeyboardEvent): boolean {
		if (!this.isOpen || !this.suggester || !this.context) return false;
		this.suggester.handleDailyNoteAction(event, true, this.context);
		return true;
	}

	private handleSelectionKey = (event: KeyboardEvent): boolean => {
		if (!this.isOpen || !this.suggester || !this.context) return false;
		if (event.shiftKey) event.preventDefault();
		this.suggestionChosen = true;
		return this.suggestions.useSelectedItem(event);
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
			this.suggestionChosen = true; // prevent cleanup of trigger when removing space
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
	 * Handles Tab key events to auto-complete the selected suggestion
	 * Returns true if the event was handled (should be prevented)
	 */
	private handleTabKey = (event: KeyboardEvent): boolean => {
		this.suggestionChosen = true;
		if (!this.isOpen || !this.context || !this.suggester) return false;
		
		// Get the currently selected suggestion
		const selectedItem = this.suggestions.values[this.suggestions.selectedItem];
		if (!selectedItem) return false;
		
		// Extract just the query part and replace it with the suggestion text
		const editor = this.context.editor;
		const { start, end, query } = this.context;
		
		// Check if there's already a space after the trigger phrase
		const line = editor.getLine(start.line);
		const triggerEndCh = start.ch + this.plugin.settings.triggerPhrase.length;
		const hasSpaceAfterTrigger = triggerEndCh < line.length && line[triggerEndCh] === ' ';
		
		// Calculate the starting position of just the query (after trigger phrase and space if present)
		const queryStart = {
			line: start.line,
			ch: start.ch + this.plugin.settings.triggerPhrase.length + (hasSpaceAfterTrigger ? 1 : 0)
		};
		
		// For initial suggestions with no space yet, we need to insert a space
		if (query === '' && !hasSpaceAfterTrigger) {
			// Insert a space first
			editor.replaceRange(' ', queryStart, queryStart);
			
			// Adjust the queryStart to be after the space
			queryStart.ch += 1;
			
			// Also adjust the end position
			end.ch += 1;
		}
		  // Don't close suggester, just replace the query text with the selected suggestion text
		editor.replaceRange(selectedItem.toString(), queryStart, end);
		
		// Update context to reflect new query text
		this.context.query = selectedItem.toString();
		this.context.end = {
			line: queryStart.line,
			ch: queryStart.ch + selectedItem.toString().length
		};
		
		// Set cursor position to the end of the inserted text
		editor.setCursor({
			line: queryStart.line,
			ch: queryStart.ch + selectedItem.toString().length
		});
		
		// Reapply trigger decorations
		this.applyTriggerDecorations();
		
		// Prevent the Tab key being inserted
		return true;
	};

	/**
	 * Updates the instructions display based on keyboard handler settings
	 */
	updateInstructions(swapOpenNoteKeybindsOverride?: boolean) {
		// Use dynamic instruction definitions
		this.setInstructions(getInstructionDefinitions(
			this.plugin.settings.plainTextByDefault,
			swapOpenNoteKeybindsOverride ?? this.plugin.settings.swapOpenNoteKeybinds
		));
		this.suggester?.updateSettings({
			plainTextByDefault: this.plugin.settings.plainTextByDefault,
			holidayLocale: this.plugin.settings.holidayLocale,
		});
	}

	unload() {
		this.clearDecorations();
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
		this.suggester?.setEditorSuggesterRef(this);
		// Add a unique class to the newly opened suggestion container
		setTimeout(() => {
			const containers = document.body.querySelectorAll('.suggestion-container');
			const last = containers[containers.length - 1];
			if (last) last.classList.add(CLASSES.suggester);
		}, 0);

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
		if (this.plugin.settings.cleanupTriggerOnClose && !this.suggestionChosen && !this.lastInsertionEnd && this.lastContext && this.cleanupEnd) {
			const { start, editor } = this.lastContext;
			try {
				const lineText = editor.getLine(start.line);
				const toRemove = lineText.slice(start.ch, this.cleanupEnd.ch);
				// Only remove if range still matches trigger phrase
				if (toRemove === this.plugin.settings.triggerPhrase) {
					// Remove trigger phrase
					editor.replaceRange('', start, this.cleanupEnd);
					// Also remove following space if present
					const postLine = editor.getLine(start.line);
					if (postLine[start.ch] === ' ') {
						editor.replaceRange('', start, { line: start.line, ch: start.ch + 1 });
					}
				}
			} catch {
				// ignore invalid range errors
			}
		}
		// Clear cleanup state
		this.cleanupEnd = null;
		this.lastContext = null;
		this.lastInsertionEnd = null;
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
		// Maintain a spacer widget at trigger end when query is empty
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
		debug(this, 'Called at position', cursor);
		this.suggestionChosen = false;
		const triggerPhrase = this.plugin.settings.triggerPhrase;
		if (!triggerPhrase) {
			warn(this, 'No trigger phrase configured');
			this.firstSpaceBlocked = false;
			return null;
		}
		debug(this, 'Using trigger phrase:', triggerPhrase);
		
		const result = parseTriggerContext(
			cursor,
			editor,
			triggerPhrase,
			this.plugin.settings.triggerHappy,
			this.lastReplacedTriggerStart,
			this.lastInsertionEnd,
			this.isOpen
		);
		this.lastReplacedTriggerStart = null;
		this.lastInsertionEnd = null;
		if (!result) {
			debug(this, 'No trigger context found');
			this.firstSpaceBlocked = false;
			return null;
		}
		debug(this, 'Context found:', { start: result.start, end: result.end, query: result.query });        
		this.shouldInsertSpaceOnOpen = result.shouldInsertSpaceOnOpen;
		this.firstSpaceBlocked = result.firstSpaceBlocked;
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			warn(this, 'No active file');
			this.firstSpaceBlocked = false;
			return null;
		}
		// Track range to cleanup: just the trigger phrase
		this.cleanupEnd = { line: result.start.line, ch: result.start.ch + triggerPhrase.length };
		info(this, 'Creating suggestion context');
		const ctx: EditorSuggestContext = {
			start: result.start,
			end: result.end,
			query: result.query,
			editor,
			file: activeFile
		};
		this.lastContext = ctx;
		return ctx;
	}

	getSuggestions(ctx: EditorSuggestContext): string[] {
		if (!this.suggester) return [];
		return this.suggester.getDateSuggestions(
			{ query: ctx.query },
			this.plugin.settings.initialEditorSuggestions
		);
	}

	renderSuggestion(item: string, el: HTMLElement) {
		// Forward current query context for highlighting
		const query = this.context?.query ?? '';
		this.suggester?.renderSuggestionContent(item, el, { context: { query } });
	}

	selectSuggestion(item: string, event: KeyboardEvent | MouseEvent): void {
		debug(this, 'selectSuggestion called with item:', item);
		this.suggestionChosen = true;
		if (!this.context || !this.suggester) {
			error(this, 'No context or suggester available for selection');
			return;
		}

		const { editor, start, end, file } = this.context; // 'start' is trigger start, 'end' is query end
		debug(this, 'Selection context:', { start, end, file: file?.name });

		// Calculate finalText first, as its generation is independent of the removal timing
		const { insertMode, contentFormat } = this.keyboardHandler.getEffectiveInsertModeAndFormat(event as KeyboardEvent);
		debug(this, 'Insert mode and format:', { insertMode, contentFormat });

		const finalText = this.suggester.getFinalInsertText(
			item,
			insertMode,
			contentFormat,
			this.plugin.settings,
			file, // Pass the active TFile
			this.app // Pass the App instance
		);
		debug(this, 'Generated final text:', finalText);

		// Store the original start position of the trigger phrase. This is where the new text will be inserted.
		const originalTriggerStartPos = { line: start.line, ch: start.ch };

		// Step 1: Remove the trigger phrase and any query text.
		// The range (start, end) from the context covers the trigger phrase and the query.
		editor.replaceRange('', start, end);
		debug(this, 'Removed trigger phrase and query');

		// Step 2: Insert the final text at the original start position of the trigger phrase.
		// After the first editor.replaceRange, the cursor is effectively at originalTriggerStartPos.
		// We insert the finalText there, so the range for this replacement is (originalTriggerStartPos, originalTriggerStartPos).
		editor.replaceRange(finalText, originalTriggerStartPos, originalTriggerStartPos);
		info(this, 'Successfully inserted suggestion:', finalText);

		// Update state for preventing re-trigger. This should be based on the original trigger start
		// and the length of the newly inserted text.
		this.lastReplacedTriggerStart = { line: originalTriggerStartPos.line, ch: originalTriggerStartPos.ch };
		this.lastInsertionEnd = { line: originalTriggerStartPos.line, ch: originalTriggerStartPos.ch + finalText.length };
		
		// Explicitly set the cursor to the end of the inserted text
		editor.setCursor(this.lastInsertionEnd);
		// Disable cleanup after a selection
		this.cleanupEnd = null;
		
		// The EditorSuggest base class typically handles closing the suggester after this method completes.
	}

	/**
	 * Update settings and trigger UI refresh
	 */
	updateSettings(settings: { keyBindings?: Record<string, string>; plainTextByDefault?: boolean; holidayLocale?: string; swapOpenNoteKeybinds?: boolean }): void {
		this.keyboardHandler.update(settings);
		// Update keybinds immediately based on new settings
		this.registerDailyNoteKeybinds();
		this.updateInstructions(settings.swapOpenNoteKeybinds);
		this.suggester?.updateSettings({
			plainTextByDefault: settings.plainTextByDefault ?? this.plugin.settings.plainTextByDefault,
			holidayLocale: settings.holidayLocale ?? this.plugin.settings.holidayLocale,
		});
	}

	/**
	 * Register daily note keybinds based on current settings
	 */
	private registerDailyNoteKeybinds(): void {
		// Unregister previous handlers
		if (this.openDailySameTabHandler) {
			this.scope.unregister(this.openDailySameTabHandler);
			this.openDailySameTabHandler = null;
		}
		if (this.openDailyNewTabHandler) {
			this.scope.unregister(this.openDailyNewTabHandler);
			this.openDailyNewTabHandler = null;
		}
		// Register new handlers according to current settings
		if (this.plugin.settings.swapOpenNoteKeybinds) {
			this.openDailySameTabHandler = this.scope.register([MODIFIER_KEY.CTRL, MODIFIER_KEY.SHIFT], KEYS.SPACE, this.handleDailyNote.bind(this));
			this.openDailyNewTabHandler = this.scope.register([MODIFIER_KEY.SHIFT], KEYS.SPACE, this.handleDailyNoteNewTab.bind(this));
		} else {
			this.openDailySameTabHandler = this.scope.register([MODIFIER_KEY.SHIFT], KEYS.SPACE, this.handleDailyNote.bind(this));
			this.openDailyNewTabHandler = this.scope.register([MODIFIER_KEY.CTRL, MODIFIER_KEY.SHIFT], KEYS.SPACE, this.handleDailyNoteNewTab.bind(this));
		}
	}
}