import { Modifier, Scope } from 'obsidian';
import { 
    InsertMode,
    ContentFormat,
} from '../definitions/types';
import { DESCRIPTIONS, KEY_EVENTS, KEYS, CONTENT_FORMAT } from '../definitions/constants';

// Keybinds are now configured in DEFAULT_KEY_BINDINGS. To add a new keybind, add an entry there and handle its action in the code.

// Define a type for key state change callbacks
type KeyStateChangeCallback = () => void;

/**
 * Handles keyboard shortcuts for the plugin
 */
export class KeyboardHandler {
    private scope: Scope | null;
    private plainTextByDefault: boolean;

    // Key state tracking
    private keyState: Record<string, boolean> = {
        Control: false,
        Shift: false,
        Alt: false
    };

    // Key binding configuration (edit here to add/remove keybinds)
    // Each entry: { action: string, keys: string | string[], description?: string }
    private static DEFAULT_KEY_BINDINGS = [
        { action: 'insertAsPlainText', keys: 'Control', description: 'Insert as plain text (toggle)' },
        { action: 'useAlternateFormat', keys: 'Alt', description: 'Use alternate date format' },
        { action: 'useSuggestionText', keys: 'Shift', description: 'Use suggestion text' },
        { action: 'useDailyNoteFormat', keys: ['Shift', 'Alt'], description: 'Use daily note format' },
        { action: 'openDailyNote', keys: 'Tab', description: 'Open daily note' },
        { action: 'openDailyNoteNewTab', keys: ['Shift', 'Tab'], description: 'Open daily note in new tab' }
        // Add more keybinds here as needed
    ];

    // Map of action => keys (for fast lookup)
    private keyBindings: Record<string, string | string[]> = {};

    // Event listeners for key state changes
    private keyStateChangeListeners: KeyStateChangeCallback[] = [];

    constructor(scope?: Scope, plainTextByDefault: boolean = false) {
        this.scope = scope || null;
        this.plainTextByDefault = plainTextByDefault;

        // Initialize keyBindings from config
        KeyboardHandler.DEFAULT_KEY_BINDINGS.forEach(kb => {
            this.keyBindings[kb.action] = kb.keys;
        });

        // Set up document-level event listeners
        this.setupKeyEventListeners();
    }

    /**
     * Add a listener for key state changes
     */
    addKeyStateChangeListener(callback: KeyStateChangeCallback): void {
        this.keyStateChangeListeners.push(callback);
    }

    /**
     * Remove a listener for key state changes
     */
    removeKeyStateChangeListener(callback: KeyStateChangeCallback): void {
        const index = this.keyStateChangeListeners.indexOf(callback);
        if (index !== -1) {
            this.keyStateChangeListeners.splice(index, 1);
        }
    }

    /**
     * Notify all listeners about key state changes
     */
    private notifyKeyStateChangeListeners(): void {
        this.keyStateChangeListeners.forEach(callback => callback());
    }

    /**
     * Set up event listeners for key events
     */
    private setupKeyEventListeners(): void {
        document.addEventListener(KEY_EVENTS.KEYDOWN, this.handleKeyEvent, true);
        document.addEventListener(KEY_EVENTS.KEYUP, this.handleKeyEvent, true);
    }

    /**
     * Handle key events for tracking modifier key state
     */
    private handleKeyEvent = (event: KeyboardEvent): void => {
        const key = event.key;
        const isKeyDown = event.type === KEY_EVENTS.KEYDOWN;

        // Only track modifier keys
        if (key === KEYS.CONTROL || key === KEYS.SHIFT || key === KEYS.ALT) {
            // Only update and notify if state actually changed
            if (this.keyState[key] !== isKeyDown) {
                this.keyState[key] = isKeyDown;
                this.notifyKeyStateChangeListeners();
            }
        }
    };

    /**
     * Update bindings and settings
     */
    update(settings: { keyBindings?: Record<string, string>; plainTextByDefault?: boolean }): void {
        if (settings.keyBindings) {
            Object.assign(this.keyBindings, settings.keyBindings);
        }

        if (settings.plainTextByDefault !== undefined) {
            this.plainTextByDefault = settings.plainTextByDefault;
        }
    }

    /**
     * Get instructions for display in the UI
     */
    getInstructions(): { command: string, purpose: string }[] {
        const instructions: { command: string, purpose: string }[] = [];

        // Add instructions for modifiers
        if (this.plainTextByDefault) {
            instructions.push({ command: "None", purpose: InsertMode.PLAINTEXT.toString() });
            instructions.push({ 
                command: this.formatKeyComboForDisplay(this.keyBindings.insertAsPlainText as string), 
                purpose: InsertMode.LINK.toString() 
            });
        } else {
            instructions.push({ command: "None", purpose: InsertMode.LINK.toString() });
            instructions.push({ 
                command: this.formatKeyComboForDisplay(this.keyBindings.insertAsPlainText as string), 
                purpose: InsertMode.PLAINTEXT.toString() 
            });
        }

        // Add instructions for content format modifiers
        instructions.push({
            command: this.formatKeyComboForDisplay(this.keyBindings.useAlternateFormat as string),
            purpose: CONTENT_FORMAT.ALTERNATE
        });

        instructions.push({
            command: this.formatKeyComboForDisplay(this.keyBindings.useSuggestionText as string),
            purpose: CONTENT_FORMAT.SUGGESTION_TEXT
        });

        instructions.push({
            command: this.formatKeyComboForDisplay(this.keyBindings.useDailyNoteFormat as string),
            purpose: CONTENT_FORMAT.DAILY_NOTE
        });

        // Add Tab instructions
        instructions.push({
            command: this.formatKeyComboForDisplay(this.keyBindings.openDailyNote as string),
            purpose: DESCRIPTIONS.OPEN_DAILY_NOTE
        });

        instructions.push({
            command: this.formatKeyComboForDisplay(this.keyBindings.openDailyNoteNewTab as string),
            purpose: DESCRIPTIONS.OPEN_DAILY_NOTE_NEW_TAB
        });

        return instructions;
    }

    /**
     * Format a key combo for display in instructions
     */
    formatKeyComboForDisplay(key: string | string[]): string {
        if (!key || key === 'none') return "None";
        if (Array.isArray(key)) {
            return key.map(k => k.charAt(0).toUpperCase() + k.slice(1)).join('+');
        }
        return key.split('+')
            .map(k => k.charAt(0).toUpperCase() + k.slice(1))
            .join('+');
    }

    /**
     * Helper to register all keybinds for a given scope
     */
    registerAllKeyHandlers(callbacks: Record<string, (event: KeyboardEvent) => boolean | void>): void {
        if (!this.scope) return;
        KeyboardHandler.DEFAULT_KEY_BINDINGS.forEach(kb => {
            if (typeof kb.keys === 'string') {
                this.scope?.register([], kb.keys, callbacks[kb.action]);
            } else if (Array.isArray(kb.keys)) {
                // If keys is an array, treat as modifiers + key (e.g., ['Control', 'Tab'])
                const mods = kb.keys.slice(0, -1) as Modifier[];
                const key = kb.keys[kb.keys.length - 1];
                this.scope?.register(mods, key, callbacks[kb.action]);
            }
        });
    }

    /**
     * Register keyboard shortcuts for tab key handling
     */
    registerTabKeyHandlers(callback: (event: KeyboardEvent) => boolean): void {
        this.registerAllKeyHandlers({
            openDailyNote: callback,
            openDailyNoteNewTab: callback
        });
    }

    /**
     * Get the effective insert mode and content format for a given event
     */
    getEffectiveInsertModeAndFormat(event?: KeyboardEvent): { insertMode: InsertMode, contentFormat: ContentFormat } {
        // If we received an event, use that to determine key state
        const ctrlPressed = event ? event.ctrlKey : this.keyState[KEYS.CONTROL];
        const shiftPressed = event ? event.shiftKey : this.keyState[KEYS.SHIFT];
        const altPressed = event ? event.altKey : this.keyState[KEYS.ALT];

        // Determine insert mode based on ctrl state and plainTextByDefault
        const insertMode = this.plainTextByDefault
            ? (ctrlPressed ? InsertMode.LINK : InsertMode.PLAINTEXT)
            : (ctrlPressed ? InsertMode.PLAINTEXT : InsertMode.LINK);

        // Determine content format based on modifier keys
        let contentFormat = ContentFormat.PRIMARY;
        if (shiftPressed && altPressed) {
            contentFormat = ContentFormat.DAILY_NOTE;
        } else if (shiftPressed) {
            contentFormat = ContentFormat.SUGGESTION_TEXT;
        } else if (altPressed) {
            contentFormat = ContentFormat.ALTERNATE;
        }

        return { insertMode, contentFormat };
    }

    /**
     * Check if a key is currently pressed
     */
    isKeyPressed(key: string): boolean {
        return this.keyState[key] || false;
    }

    /**
     * Cleanup when unloading
     */
    unload(): void {
        // Remove event listeners
        document.removeEventListener(KEY_EVENTS.KEYDOWN, this.handleKeyEvent, true);
        document.removeEventListener(KEY_EVENTS.KEYUP, this.handleKeyEvent, true);
        this.keyStateChangeListeners = [];
    }
}
