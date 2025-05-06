import { Scope } from 'obsidian';
import { 
    InsertMode,
    ContentFormat,
} from '../definitions/types';
import { DESCRIPTIONS, KEY_EVENTS, KEYS, CONTENT_FORMAT } from '../definitions/constants';

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
    
    // Key binding configuration
    private keyBindings: Record<string, string> = {
        insertAsPlainText: 'Control',
        useAlternateFormat: 'Alt',
        useSuggestionText: 'Shift',
        useDailyNoteFormat: 'Shift+Alt'
    };

    // Event listeners for key state changes
    private keyStateChangeListeners: KeyStateChangeCallback[] = [];

    constructor(scope?: Scope, plainTextByDefault: boolean = false) {
        this.scope = scope || null;
        this.plainTextByDefault = plainTextByDefault;
        
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
                command: this.formatKeyComboForDisplay(this.keyBindings.insertAsPlainText), 
                purpose: InsertMode.LINK.toString() 
            });
        } else {
            instructions.push({ command: "None", purpose: InsertMode.LINK.toString() });
            instructions.push({ 
                command: this.formatKeyComboForDisplay(this.keyBindings.insertAsPlainText), 
                purpose: InsertMode.PLAINTEXT.toString() 
            });
        }
        
        // Add instructions for content format modifiers
        instructions.push({
            command: this.formatKeyComboForDisplay(this.keyBindings.useAlternateFormat),
            purpose: CONTENT_FORMAT.ALTERNATE // Use constant directly instead of enum
        });
        
        instructions.push({
            command: this.formatKeyComboForDisplay(this.keyBindings.useSuggestionText),
            purpose: CONTENT_FORMAT.SUGGESTION_TEXT // Use constant directly instead of enum
        });
        
        instructions.push({
            command: this.formatKeyComboForDisplay(this.keyBindings.useDailyNoteFormat),
            purpose: CONTENT_FORMAT.DAILY_NOTE // Use constant directly instead of enum
        });
        
        // Add Tab instructions
        instructions.push({
            command: this.formatKeyComboForDisplay("tab"),
            purpose: DESCRIPTIONS.OPEN_DAILY_NOTE
        });
        
        instructions.push({
            command: this.formatKeyComboForDisplay("ctrl+tab"),
            purpose: "Open daily note in new tab"
        });

        return instructions;
    }

    /**
     * Format a key combo for display in instructions
     */
    formatKeyComboForDisplay(key: string): string {
        if (!key || key === 'none') return "None";
        return key.split('+')
            .map(k => k.charAt(0).toUpperCase() + k.slice(1))
            .join('+');
    }

    /**
     * Register keyboard shortcuts for tab key handling
     */
    registerTabKeyHandlers(callback: (event: KeyboardEvent) => boolean): void {
        if (!this.scope) return;
        
        // Register Tab key and Ctrl+Tab key for daily note actions
        this.scope.register([], 'Tab', callback);
        this.scope.register(['Ctrl'], 'Tab', callback);
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
