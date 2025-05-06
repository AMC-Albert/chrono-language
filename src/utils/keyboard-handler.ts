import { Modifier, Scope } from 'obsidian';
import { 
    InsertMode,
    ContentFormat,
    createModifierString,
} from '../definitions/types';
import { 
    DESCRIPTIONS, 
    KEY_EVENTS, 
    KEYS, 
    CONTENT_FORMAT,
    MODIFIER_BEHAVIOR,
    MODIFIER_KEY
} from '../definitions/constants';

/**
 * Callback function type for key state change events
 */
type KeyStateChangeCallback = () => void;

export class KeyboardHandler {
    private scope: Scope | null;
    private plainTextByDefault: boolean;
    private keyState: Record<string, boolean> = { Control: false, Shift: false, Alt: false };
    private static DEFAULT_KEY_BINDINGS = [
        { action: 'insertAsPlainText', keys: 'Control', description: 'Insert as plain text (toggle)' },
        { action: 'useAlternateFormat', keys: 'Alt', description: 'Use alternate date format' },
        { action: 'useSuggestionText', keys: 'Shift', description: 'Use suggestion text' },
        { action: 'useDailyNoteFormat', keys: ['Shift', 'Alt'], description: 'Use daily note format' },
        { action: 'openDailyNote', keys: 'Tab', description: 'Open daily note' },
        { action: 'openDailyNoteNewTab', keys: ['Shift', 'Tab'], description: 'Open daily note in new tab' }
    ];
    private keyBindings: Record<string, string | string[]> = {};
    private keyStateChangeListeners: KeyStateChangeCallback[] = [];

    constructor(scope?: Scope, plainTextByDefault: boolean = false) {
        this.scope = scope || null;
        this.plainTextByDefault = plainTextByDefault;
        KeyboardHandler.DEFAULT_KEY_BINDINGS.forEach(kb => {
            this.keyBindings[kb.action] = kb.keys;
        });
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
    update(settings: Partial<{ keyBindings: Record<string, string | string[]>; plainTextByDefault: boolean }>): void {
        if (settings.keyBindings) Object.assign(this.keyBindings, settings.keyBindings);
        if (settings.plainTextByDefault !== undefined) this.plainTextByDefault = settings.plainTextByDefault;
    }
    getInstructions(): { command: string, purpose: string }[] {
        const i = this.keyBindings;
        const fmt = (k: string | string[]) => this.formatKeyComboForDisplay(k);
        const out = [];
        if (this.plainTextByDefault) {
            out.push({ command: "None", purpose: InsertMode.PLAINTEXT.toString() });
            out.push({ command: fmt(i.insertAsPlainText as string), purpose: InsertMode.LINK.toString() });
        } else {
            out.push({ command: "None", purpose: InsertMode.LINK.toString() });
            out.push({ command: fmt(i.insertAsPlainText as string), purpose: InsertMode.PLAINTEXT.toString() });
        }
        out.push({ command: fmt(i.useAlternateFormat as string), purpose: CONTENT_FORMAT.ALTERNATE });
        out.push({ command: fmt(i.useSuggestionText as string), purpose: CONTENT_FORMAT.SUGGESTION_TEXT });
        out.push({ command: fmt(i.useDailyNoteFormat as string[]), purpose: CONTENT_FORMAT.DAILY_NOTE });
        out.push({ command: fmt(i.openDailyNote as string), purpose: DESCRIPTIONS.OPEN_DAILY_NOTE });
        out.push({ command: fmt(i.openDailyNoteNewTab as string[]), purpose: DESCRIPTIONS.OPEN_DAILY_NOTE_NEW_TAB });
        return out;
    }
    formatKeyComboForDisplay(key: string | string[]): string {
        if (!key || key === 'none') return "None";
        if (Array.isArray(key)) return key.map(k => k.charAt(0).toUpperCase() + k.slice(1)).join('+');
        return key.split('+').map(k => k.charAt(0).toUpperCase() + k.slice(1)).join('+');
    }
    registerAllKeyHandlers(callbacks: Record<string, (event: KeyboardEvent) => boolean | void>): void {
        if (!this.scope) return;
        KeyboardHandler.DEFAULT_KEY_BINDINGS.forEach(kb => {
            if (typeof kb.keys === 'string') {
                this.scope!.register([], kb.keys, callbacks[kb.action]);
            } else if (Array.isArray(kb.keys)) {
                const mods = kb.keys.slice(0, -1) as Modifier[];
                const key = kb.keys[kb.keys.length - 1];
                this.scope!.register(mods, key, callbacks[kb.action]);
            }
        });
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
