import { Scope } from 'obsidian';
import { 
    InsertMode,
    ContentFormat,
    createModifierString,
} from '../definitions/types';
import { 
    KEY_EVENTS, 
    KEYS, 
    MODIFIER_BEHAVIOR,
    MODIFIER_KEY
} from '../definitions/constants';
import { getInstructionDefinitions } from '../definitions/constants';

/**
 * Callback function type for key state change events
 */
type KeyStateChangeCallback = () => void;

export class KeyboardHandler {
    private scope: Scope | null;
    private plainTextByDefault: boolean;
    private keyState: Record<string, boolean> = { Control: false, Shift: false, Alt: false };
    private keyStateChangeListeners: KeyStateChangeCallback[] = [];

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
        if (key === KEYS.CONTROL || key === KEYS.SHIFT || key === KEYS.ALT) {
            if (this.keyState[key] !== isKeyDown) {
                this.keyState[key] = isKeyDown;
                this.notifyKeyStateChangeListeners();
            }
        }
    };
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
    }
}
