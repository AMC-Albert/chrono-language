import { Scope } from 'obsidian';
import { 
	InsertMode,
	ContentFormat,
	createModifierString,
} from '../types';
import { 
	KEY_EVENTS, 
	KEYS,    MODIFIER_BEHAVIOR,
	MODIFIER_KEY,
	MODIFIER_COMBOS
} from '../constants';
import { debug, info, warn, error } from './obsidian-logger';

/**
 * Callback function type for key state change events
 */
type KeyStateChangeCallback = () => void;

/**
 * Type definition for space key event handler
 * Returns true if the event was handled (should be prevented)
 */
type SpaceKeyEventHandler = (event: KeyboardEvent) => boolean;

export class KeyboardHandler {
	private scope: Scope | null;
	private plainTextByDefault: boolean;
	private keyState: Record<string, boolean> = { Control: false, Shift: false, Alt: false };
	private keyStateChangeListeners: KeyStateChangeCallback[] = [];
	private spaceKeyHandlers: SpaceKeyEventHandler[] = [];
	private backspaceKeyHandlers: ((event: KeyboardEvent) => boolean)[] = [];
	private tabKeyHandlers: ((event: KeyboardEvent) => boolean)[] = [];    constructor(scope?: Scope, plainTextByDefault: boolean = false) {
		this.scope = scope || null;
		this.plainTextByDefault = plainTextByDefault;
		this.setupKeyEventListeners();
		debug('KeyboardHandler', 'constructor', { 
			hasScope: !!scope, 
			plainTextByDefault 
		});
	}

	addKeyStateChangeListener(callback: KeyStateChangeCallback): void {
		this.keyStateChangeListeners.push(callback);
	}
	removeKeyStateChangeListener(callback: KeyStateChangeCallback): void {
		const i = this.keyStateChangeListeners.indexOf(callback);
		if (i !== -1) this.keyStateChangeListeners.splice(i, 1);
	}
	private notifyKeyStateChangeListeners(): void {
		this.keyStateChangeListeners.forEach(cb => cb());
	}
	private setupKeyEventListeners(): void {
		document.addEventListener(KEY_EVENTS.KEYDOWN, this.handleKeyEvent, true);
		document.addEventListener(KEY_EVENTS.KEYUP, this.handleKeyEvent, true);
	}
	private handleKeyEvent = (event: KeyboardEvent): void => {
		const key = event.key;
		const isKeyDown = event.type === KEY_EVENTS.KEYDOWN;
		
		// Handle space key intercept if this is a keydown event
		if (isKeyDown && key === ' ') {
			// Only intercept pure space (no modifiers); shift+space, ctrl+space, etc. go to CodeMirror scope
			if (!event.shiftKey && !event.ctrlKey && !event.altKey) {
				if (this.handleSpaceKeyEvent(event)) {
					event.preventDefault();
					event.stopImmediatePropagation();
				}
			}
		}

		// Handle Tab key for auto-completion
		if (isKeyDown && key === KEYS.TAB) {
			if (this.handleTabKeyEvent(event)) {
				event.preventDefault();
				event.stopImmediatePropagation();
			}
		}

		if (isKeyDown && key === 'Backspace') {
			if (this.handleBackspaceKeyEvent(event)) {
				event.preventDefault();
				event.stopImmediatePropagation();
			}
		}
		
		if (key === KEYS.CONTROL || key === KEYS.SHIFT || key === KEYS.ALT) {
			if (this.keyState[key] !== isKeyDown) {
				this.keyState[key] = isKeyDown;
				this.notifyKeyStateChangeListeners();
			}
		}
	};
	
	/**
	 * Handles space key events by passing them to registered handlers
	 * @param event The keyboard event
	 * @returns true if the event was handled and should be prevented
	 */
	private handleSpaceKeyEvent(event: KeyboardEvent): boolean {
		for (const handler of this.spaceKeyHandlers) {
			if (handler(event)) {
				return true; // Event was handled
			}
		}
		return false; // No handler prevented the event
	}

	/**
	 * Handles tab key events by passing them to registered handlers
	 * @param event The keyboard event
	 * @returns true if the event was handled and should be prevented
	 */
	private handleTabKeyEvent(event: KeyboardEvent): boolean {
		for (const handler of this.tabKeyHandlers) {
			if (handler(event)) {
				return true; // Event was handled
			}
		}
		return false; // No handler prevented the event
	}

	private handleBackspaceKeyEvent(event: KeyboardEvent): boolean {
		for (const handler of this.backspaceKeyHandlers) {
			if (handler(event)) {
				return true;
			}
		}
		return false;
	}
	
	/**
	 * Registers a handler for space key events
	 * @param handler Function that returns true if the space key was handled
	 */
	registerSpaceKeyHandler(handler: SpaceKeyEventHandler): void {
		this.spaceKeyHandlers.push(handler);
	}
	
	/**
	 * Registers a handler for backspace key events
	 */
	registerBackspaceKeyHandler(handler: (event: KeyboardEvent) => boolean): void {
		this.backspaceKeyHandlers.push(handler);
	}
	
	/**
	 * Unregisters a space key event handler
	 * @param handler The handler to remove
	 */
	unregisterSpaceKeyHandler(handler: SpaceKeyEventHandler): void {
		const index = this.spaceKeyHandlers.indexOf(handler);
		if (index !== -1) {
			this.spaceKeyHandlers.splice(index, 1);
		}
	}
	
	/**
	 * Unregisters a backspace key event handler
	 */
	unregisterBackspaceKeyHandler(handler: (event: KeyboardEvent) => boolean): void {
		const index = this.backspaceKeyHandlers.indexOf(handler);
		if (index !== -1) {
			this.backspaceKeyHandlers.splice(index, 1);
		}
	}

	/**
	 * Registers a handler for tab key events
	 * @param handler Function that returns true if the tab key was handled
	 */
	registerTabKeyHandler(handler: (event: KeyboardEvent) => boolean): void {
		this.tabKeyHandlers.push(handler);
	}
	
	/**
	 * Unregisters a tab key event handler
	 */
	unregisterTabKeyHandler(handler: (event: KeyboardEvent) => boolean): void {
		const index = this.tabKeyHandlers.indexOf(handler);
		if (index !== -1) {
			this.tabKeyHandlers.splice(index, 1);
		}
	}

	update(settings: Partial<{ plainTextByDefault: boolean }>): void {
		if (settings.plainTextByDefault !== undefined) this.plainTextByDefault = settings.plainTextByDefault;
	}
	
	/**
	 * Registers Enter key handlers for all modifier combinations
	 */
	registerEnterKeyHandlers(callback: (event: KeyboardEvent) => boolean): void {
		if (!this.scope) return;
		MODIFIER_COMBOS.forEach(mods => {
			this.scope!.register(mods, KEYS.ENTER, callback);
		});
	}

	/**
	 * Registers handlers for Shift+Space and Ctrl+Shift+Space for daily note actions
	 */
	registerDailyNoteKeyHandlers(shiftSpaceHandler: (event: KeyboardEvent) => boolean, ctrlShiftSpaceHandler: (event: KeyboardEvent) => boolean): void {
		if (!this.scope) return;
		this.scope.register([MODIFIER_KEY.SHIFT], KEYS.SPACE, shiftSpaceHandler);
		this.scope.register([MODIFIER_KEY.CTRL, MODIFIER_KEY.SHIFT], KEYS.SPACE, ctrlShiftSpaceHandler);
	}    getEffectiveInsertModeAndFormat(event?: KeyboardEvent): { insertMode: InsertMode, contentFormat: ContentFormat } {
		const ctrl = event ? event.ctrlKey : this.keyState[KEYS.CONTROL];
		const shift = event ? event.shiftKey : this.keyState[KEYS.SHIFT];
		const alt = event ? event.altKey : this.keyState[KEYS.ALT];
		const modString = createModifierString(shift, ctrl, alt);
		const insertModeToggled = MODIFIER_BEHAVIOR.INSERT_MODE_TOGGLE && modString.includes(MODIFIER_BEHAVIOR.INSERT_MODE_TOGGLE);
		const insertMode = this.plainTextByDefault
			? (insertModeToggled ? InsertMode.LINK : InsertMode.PLAINTEXT)
			: (insertModeToggled ? InsertMode.PLAINTEXT : InsertMode.LINK);
		let contentFormat = ContentFormat.PRIMARY;
		if (MODIFIER_BEHAVIOR.DAILY_NOTE_TOGGLE !== MODIFIER_KEY.NONE && modString.includes(MODIFIER_BEHAVIOR.DAILY_NOTE_TOGGLE)) {
			contentFormat = ContentFormat.DAILY_NOTE;
		} else if (MODIFIER_BEHAVIOR.CONTENT_SUGGESTION_TOGGLE && modString.includes(MODIFIER_BEHAVIOR.CONTENT_SUGGESTION_TOGGLE)) {
			contentFormat = ContentFormat.SUGGESTION_TEXT;
		} else if (MODIFIER_BEHAVIOR.CONTENT_FORMAT_TOGGLE && modString.includes(MODIFIER_BEHAVIOR.CONTENT_FORMAT_TOGGLE)) {
			contentFormat = ContentFormat.ALTERNATE;
		}
		  debug('KeyboardHandler', 'getEffectiveInsertModeAndFormat', `mode: ${insertMode}, format: ${contentFormat}`);
		
		return { insertMode, contentFormat };
	}
	
	resetModifierKeys(): void {
		this.keyState = { Control: false, Shift: false, Alt: false };
		this.notifyKeyStateChangeListeners();
	}
	
	unload(): void {
		document.removeEventListener(KEY_EVENTS.KEYDOWN, this.handleKeyEvent, true);
		document.removeEventListener(KEY_EVENTS.KEYUP, this.handleKeyEvent, true);
		this.keyStateChangeListeners = [];
		this.spaceKeyHandlers = [];
		this.backspaceKeyHandlers = [];
	}
}