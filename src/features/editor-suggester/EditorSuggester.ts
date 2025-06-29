import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, KeymapEventHandler } from 'obsidian';
import QuickDates from '../../main';
import { SuggestionProvider } from '../suggestion-provider';
import { KeyboardHandler, loggerDebug, loggerInfo, loggerWarn, loggerError, registerLoggerClass } from '@/utils';
import { KEYS, CLASSES, getInstructionDefinitions, MODIFIER_KEY } from '@/constants';
import { parseTriggerContext } from './trigger-parser';
import { DailyNotesService } from '@/services';
import { addTriggerDecorationEffect, clearTriggerDecorationsEffect, safelyClearDecorations } from './decorations';

/**
 * A suggester for the editor that provides date parsing suggestions
 */
export class EditorSuggester extends EditorSuggest<string> {
	plugin: QuickDates;
	private suggester: SuggestionProvider | null = null;
	private keyboardHandler!: KeyboardHandler;
	private dailyNotesService: DailyNotesService;

	// For tracking state after a suggestion is selected to prevent immediate re-trigger on an earlier phrase
	private lastReplacedTriggerStart: { line: number, ch: number } | null = null;
	private lastInsertionEnd: { line: number, ch: number } | null = null;

	private firstSpaceBlocked = false; // Track if we've already blocked the first space
	private shouldInsertSpaceOnOpen: boolean = false; // Flag to insert space when suggester opens
	private suggestionChosen = false;
	private lastContext: EditorSuggestContext | null = null;
	private cleanupEnd: EditorPosition | null = null;	// Handler references for daily note keybinds
	private openDailySameTabHandler: KeymapEventHandler | null = null;
	private openDailyNewTabHandler: KeymapEventHandler | null = null;

	constructor(plugin: QuickDates, dailyNotesService: DailyNotesService) {
		super(plugin.app);
		this.plugin = plugin;
		this.dailyNotesService = dailyNotesService;
		registerLoggerClass(this, 'EditorSuggester');
		
		loggerDebug(this, 'Initializing editor suggester component for date parsing');
		this.initComponents();
		
		loggerInfo(this, 'Editor suggester successfully initialized and ready for user input', {
			triggerPhrase: plugin.settings.triggerPhrase,
			plainTextByDefault: plugin.settings.plainTextByDefault,
			swapOpenNoteKeybinds: plugin.settings.swapOpenNoteKeybinds
		});
	}
	private initComponents() {
		loggerDebug(this, 'Setting up keyboard handlers and suggestion provider components');
		
		this.keyboardHandler = new KeyboardHandler(this.scope, this.plugin.settings.plainTextByDefault);
		// Get DailyNotesService
		if (!this.dailyNotesService) {
			throw new Error('DailyNotesService not available');
		}
		
		this.suggester = new SuggestionProvider(this.app, this.plugin, this.dailyNotesService, this.keyboardHandler);
		this.suggester.setEditorSuggesterRef(this);
		loggerDebug(this, 'Registering keyboard event handlers for suggester interaction');
		this.keyboardHandler.registerEnterKeyHandlers(this.handleSelectionKey);
		this.registerDailyNoteKeybinds();
		// Note: Backspace is registered dynamically when suggester opens to avoid interfering with normal editing
		this.keyboardHandler.registerTabKeyHandler(this.handleTabKey);
		
		loggerDebug(this, 'Setting up key state change listeners for dynamic instruction updates');
		this.keyboardHandler.addKeyStateChangeListener(() => this.updateInstructions());
		this.updateInstructions();
		
		loggerDebug(this, 'Editor suggester component initialization completed');
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
		this.suggester?.unload();
		this.keyboardHandler.unload();
	}

	// Track when the suggester is opened
	open(): void {
		super.open();
		this.suggester?.setEditorSuggesterRef(this);
		// Add a unique class to the newly opened suggestion container
		window.setTimeout(() => {
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
		
		// Add targeted backspace listener to detect removal of auto-inserted space
		document.addEventListener('keydown', this.handleAutoSpaceBackspace, true);
	}

	// Clear decorations when suggester is closed
	close() {
		// Always clear decorations first when closing
		if (this.context?.editor?.cm) {
			safelyClearDecorations(this.context.editor.cm);
		}
		// Remove backspace listener when closing
		document.removeEventListener('keydown', this.handleAutoSpaceBackspace, true);
		
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

	/**
	 * Targeted backspace handler that detects removal of auto-inserted space
	 * and closes the suggester while cleaning up the trigger phrase
	 */
	private handleAutoSpaceBackspace = (event: KeyboardEvent): void => {
		// Only handle backspace with no modifiers when suggester is open
		if (event.key !== 'Backspace' || event.shiftKey || event.ctrlKey || event.altKey || !this.isOpen || !this.context) {
			return;
		}

		const editor = this.context.editor;
		const cursor = editor.getCursor();
		const query = this.context.query;
		
		// Check if user is about to backspace the auto-inserted space
		// This happens when:
		// 1. Query is empty (no characters after trigger)
		// 2. Cursor is right after the trigger phrase + space
		if (query === '') {
			const expectedSpacePos = {
				line: this.context.start.line,
				ch: this.context.start.ch + this.plugin.settings.triggerPhrase.length + 1
			};
			
			if (cursor.line === expectedSpacePos.line && cursor.ch === expectedSpacePos.ch) {
				// User wants to remove the auto-inserted space - interpret this as canceling the suggester
				event.preventDefault();
				event.stopImmediatePropagation();
				
				// Remove both the space and the trigger phrase entirely
				const triggerStart = this.context.start;
				const spaceEnd = { line: triggerStart.line, ch: triggerStart.ch + this.plugin.settings.triggerPhrase.length + 1 };
				
				editor.replaceRange('', triggerStart, spaceEnd);
				
				// Mark as suggestion chosen to prevent cleanup issues
				this.suggestionChosen = true;
				
				// Close the suggester
				this.close();
				
				return;
			}
		}
		// For all other cases, let backspace work normally
	};

	// Apply decorations based on current context
	private applyTriggerDecorations(): void {
		if (!this.isOpen || !this.context) return;
		
		const editor = this.context.editor;
		const triggerPhrase = this.plugin.settings.triggerPhrase;
		if (!editor.cm || !triggerPhrase) return;
		
		// Clear any existing decorations first
		safelyClearDecorations(editor.cm);
		
		// Only apply new decorations if the suggester is open
		const triggerStartOffset = editor.posToOffset(this.context.start);
		const triggerEndOffset = triggerStartOffset + triggerPhrase.length;
		const effects = [addTriggerDecorationEffect.of({ from: triggerStartOffset, to: triggerEndOffset })];

		try {
			if (editor.cm.dom.isConnected) {
				editor.cm.dispatch({
					effects: effects
				});
			}
		} catch (e) {
			// Handle any dispatch errors silently
		}
	}
	onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestContext | null {
		this.suggestionChosen = false;
		const triggerPhrase = this.plugin.settings.triggerPhrase;
		
		if (!triggerPhrase) {
			loggerWarn(this, 'Editor suggester disabled - no trigger phrase configured in settings', {
				settingsPath: 'Settings > Editor suggester > Trigger phrase'
			});
			this.firstSpaceBlocked = false;
			return null;
		}
		
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
			this.firstSpaceBlocked = false;
			return null;
		}
		loggerDebug(this, 'Valid trigger context detected - preparing suggestion interface');
		
		this.shouldInsertSpaceOnOpen = result.shouldInsertSpaceOnOpen;
		this.firstSpaceBlocked = result.firstSpaceBlocked;
		
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			loggerWarn(this, 'Cannot activate suggester - no active file in workspace', {
				workspace: 'no file currently open for editing'
			});
			this.firstSpaceBlocked = false;
			return null;
		}
		
		this.cleanupEnd = { line: result.start.line, ch: result.start.ch + triggerPhrase.length };
		
		loggerInfo(this, 'Creating suggestion context for date parsing interface', {
			activeFile: activeFile.name,
			queryLength: result.query.length
		});
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
		// Forward current query context for highlighting, including full context for cleanup
		const query = this.context?.query ?? '';
		this.suggester?.renderSuggestionContent(item, el, { context: this.context ?? undefined, query });
	}

	selectSuggestion(item: string, event: KeyboardEvent | MouseEvent): void {
		loggerDebug(this, 'selectSuggestion called with item:', item);
		this.suggestionChosen = true;
		if (!this.context || !this.suggester) {
			loggerError(this, 'No context or suggester available for selection');
			return;
		}

		const { editor, start, end, file } = this.context; // 'start' is trigger start, 'end' is query end
		loggerDebug(this, 'Selection context:', { start, end, file: file?.name });

		// Calculate finalText first, as its generation is independent of the removal timing
		const { insertMode, contentFormat } = this.keyboardHandler.getEffectiveInsertModeAndFormat(event as KeyboardEvent);
		loggerDebug(this, 'Insert mode and format:', { insertMode, contentFormat });

		const finalText = this.suggester.getFinalInsertText(
			item,
			insertMode,
			contentFormat,
			this.plugin.settings,
			file, // Pass the active TFile
			this.app // Pass the App instance
		);
		loggerDebug(this, 'Generated final text:', finalText);

		// Store the original start position of the trigger phrase. This is where the new text will be inserted.
		const originalTriggerStartPos = { line: start.line, ch: start.ch };

		// Step 1: Remove the trigger phrase and any query text.
		// The range (start, end) from the context covers the trigger phrase and the query.
		editor.replaceRange('', start, end);
		loggerDebug(this, 'Removed trigger phrase and query');

		// Step 2: Insert the final text at the original start position of the trigger phrase.
		// After the first editor.replaceRange, the cursor is effectively at originalTriggerStartPos.
		// We insert the finalText there, so the range for this replacement is (originalTriggerStartPos, originalTriggerStartPos).
		editor.replaceRange(finalText, originalTriggerStartPos, originalTriggerStartPos);
		loggerInfo(this, 'Successfully inserted suggestion:', finalText);

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

	/**
	 * Get the suggestion provider for debugging
	 */
	public getSuggestionProvider(): SuggestionProvider | null {
		return this.suggester;
	}

	/**
	 * Handle key state changes by updating UI
	 */
}