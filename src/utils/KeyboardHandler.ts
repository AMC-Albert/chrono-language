import { Scope } from 'obsidian';
import { 
	InsertMode,
	ContentFormat,
	createModifierString,
} from '../types';
import { 
	KEY_EVENTS, 
	KEYS,
	MODIFIER_BEHAVIOR,
	MODIFIER_KEY,
	MODIFIER_COMBOS
} from '../constants';
import { loggerDebug, loggerInfo, loggerWarn, loggerError } from './obsidian-logger';

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
	private tabKeyHandlers: ((event: KeyboardEvent) => boolean)[] = [];
	
	// Store references to registered scope handlers for cleanup
	private registeredHandlers: any[] = [];constructor(scope?: Scope, plainTextByDefault: boolean = false) {
		this.scope = scope || null;
		this.plainTextByDefault = plainTextByDefault;
		this.setupScopeKeyHandlers();
		loggerDebug('KeyboardHandler', 'constructor', { 
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
	}	private setupScopeKeyHandlers(): void {
		if (!this.scope) return;
		
		// Register space key handler (no modifiers)
		const spaceHandler = this.scope.register([], 'Space', (event: KeyboardEvent) => {
			return this.handleSpaceKeyEvent(event);
		});
		this.registeredHandlers.push(spaceHandler);
		
		// Register Tab key handler
		const tabHandler = this.scope.register([], 'Tab', (event: KeyboardEvent) => {
			return this.handleTabKeyEvent(event);
		});
		this.registeredHandlers.push(tabHandler);
		
		// NOTE: Backspace is NOT registered globally here - it should only be handled
		// when the suggester is open and specific conditions are met
		// This prevents interfering with normal backspace functionality
		
		// Set up modifier key tracking using document events (needed for state tracking)
		document.addEventListener(KEY_EVENTS.KEYDOWN, this.handleModifierKeyEvent, true);
		document.addEventListener(KEY_EVENTS.KEYUP, this.handleModifierKeyEvent, true);
	}
	
	private handleModifierKeyEvent = (event: KeyboardEvent): void => {
		const key = event.key;
		const isKeyDown = event.type === KEY_EVENTS.KEYDOWN;
		
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
	
	/**
	 * Registers a handler for space key events
	 * @param handler Function that returns true if the space key was handled
	 */
	registerSpaceKeyHandler(handler: SpaceKeyEventHandler): void {
		this.spaceKeyHandlers.push(handler);	}
	
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
			const handler = this.scope!.register(mods, KEYS.ENTER, callback);
			this.registeredHandlers.push(handler);
		});
	}

	/**
	 * Registers handlers for Shift+Space and Ctrl+Shift+Space for daily note actions
	 */
	registerDailyNoteKeyHandlers(shiftSpaceHandler: (event: KeyboardEvent) => boolean, ctrlShiftSpaceHandler: (event: KeyboardEvent) => boolean): void {
		if (!this.scope) return;
		const shiftHandler = this.scope.register([MODIFIER_KEY.SHIFT], 'Space', shiftSpaceHandler);
		const ctrlShiftHandler = this.scope.register([MODIFIER_KEY.CTRL, MODIFIER_KEY.SHIFT], 'Space', ctrlShiftSpaceHandler);
		this.registeredHandlers.push(shiftHandler, ctrlShiftHandler);
	}getEffectiveInsertModeAndFormat(event?: KeyboardEvent): { insertMode: InsertMode, contentFormat: ContentFormat } {
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
		loggerDebug('KeyboardHandler', 'getEffectiveInsertModeAndFormat', `mode: ${insertMode}, format: ${contentFormat}`);

		return { insertMode, contentFormat };
	}
	
	resetModifierKeys(): void {
		this.keyState = { Control: false, Shift: false, Alt: false };
		this.notifyKeyStateChangeListeners();
	}
		unload(): void {
		// Remove document event listeners for modifier keys
		document.removeEventListener(KEY_EVENTS.KEYDOWN, this.handleModifierKeyEvent, true);
		document.removeEventListener(KEY_EVENTS.KEYUP, this.handleModifierKeyEvent, true);
		
		// Unregister all scope handlers
		if (this.scope) {
			this.registeredHandlers.forEach(handler => {
				this.scope?.unregister(handler);
			});
		}
		this.registeredHandlers = [];
		// Clear arrays
		this.keyStateChangeListeners = [];
		this.spaceKeyHandlers = [];
		this.tabKeyHandlers = [];
	}
}