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
    MODIFIER_KEY
} from '../constants';
import { getInstructionDefinitions } from '../constants';

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

    constructor(scope?: Scope, plainTextByDefault: boolean = false) {
        this.scope = scope || null;
        this.plainTextByDefault = plainTextByDefault;
        this.setupKeyEventListeners();
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
        // The actual space insertion will NOT be prevented here.
        // Registered spaceKeyHandlers will be notified and can perform actions (like state changes or closing suggesters),
        // but they will no longer block the space character itself via a return value here.
        if (isKeyDown && key === ' ') {
            this.handleSpaceKeyEvent(event);
            // NOTE: event.preventDefault() and event.stopPropagation() are removed here.
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

    update(settings: Partial<{ plainTextByDefault: boolean }>): void {
        if (settings.plainTextByDefault !== undefined) this.plainTextByDefault = settings.plainTextByDefault;
    }
    getInstructions(): { command: string, purpose: string }[] {
        // Use dynamic instruction definitions based on current setting
        return getInstructionDefinitions(this.plainTextByDefault);
    }
    registerAllKeyHandlers(callbacks: Record<string, (event: KeyboardEvent) => boolean | void>): void {
        if (!this.scope) return;
        // Register Tab and Shift+Tab explicitly for openDailyNote actions
        this.scope.register([], KEYS.TAB, (event: KeyboardEvent) => {
            if (callbacks.openDailyNote) return callbacks.openDailyNote(event);
        });
        this.scope.register([MODIFIER_KEY.SHIFT], KEYS.TAB, (event: KeyboardEvent) => {
            if (callbacks.openDailyNoteNewTab) return callbacks.openDailyNoteNewTab(event);
        });
        // ...other dynamic key registrations if needed...
    }
    registerTabKeyHandlers(callback: (event: KeyboardEvent) => boolean): void {
        this.registerAllKeyHandlers({ openDailyNote: callback, openDailyNoteNewTab: callback });
    }
    getEffectiveInsertModeAndFormat(event?: KeyboardEvent): { insertMode: InsertMode, contentFormat: ContentFormat } {
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
        return { insertMode, contentFormat };
    }
    isKeyPressed(key: string): boolean {
        return !!this.keyState[key];
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
