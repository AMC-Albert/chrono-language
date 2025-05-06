import { Scope, Modifier } from 'obsidian';
import { 
    KEYMAP, 
    KeyCombo, 
    InsertMode,
    ContentFormat,
    getAllKeyCombos, 
    findKeyComboByModifiers, 
    KeyMapEntry 
} from '../definitions/types';
import { KEYS } from '../definitions/constants';

/**
 * Handles keyboard shortcuts for the plugin
 */
export class KeyboardHandler {
    private scope: Scope | null;
    private plainTextByDefault: boolean;
    private callback: ((event: KeyboardEvent) => boolean) | null = null;
    
    // Key state tracking
    private keyState: { shift: boolean, ctrl: boolean, alt: boolean } = { shift: false, ctrl: false, alt: false };

    constructor(scope?: Scope, plainTextByDefault: boolean = false) {
        this.scope = scope || null;
        this.plainTextByDefault = plainTextByDefault;
    }

    /**
     * Register all keyboard shortcuts with a callback
     */
    registerShortcuts(callback: (event: KeyboardEvent) => boolean): void {
        this.callback = callback;
        
        // Only register shortcuts if we have a scope
        if (!this.scope) return;
        
        // Register each modifier combination for Enter key
        getAllKeyCombos().forEach((combo) => {
            const keys: Modifier[] = [];
            if (combo.shift) keys.push("Shift");
            if (combo.ctrl) keys.push("Ctrl");
            if (combo.alt) keys.push("Alt");
            
            this.scope?.register(keys, combo.key, (event: KeyboardEvent) => {
                if (this.callback) return this.callback(event);
                return false;
            });
        });
    }

    /**
     * Update the plain text by default setting
     */
    setPlainTextByDefault(plain: boolean): void {
        this.plainTextByDefault = plain;
    }

    /**
     * Get instructions for display in the UI
     */
    getInstructions(): { command: string, purpose: string }[] {
        return Object.values(KEYMAP)
            .filter((entry: KeyMapEntry) => entry.combo.showInInstructions === true)
            .filter((entry: KeyMapEntry) => entry.modString !== 'none')
            .map((entry: KeyMapEntry) => {
                const combo = entry.combo;
                const modString = entry.modString;
                
                // Use the combo's description or fallback to the insert mode and content format
                let purpose = combo.description || 
                    `${combo.insertMode} with ${combo.contentFormat}`;
                
                // Handle plain text by default behavior
                if (this.plainTextByDefault && modString === 'ctrl') {
                    purpose = InsertMode.LINK.toString(); // When Ctrl is inverted, it acts as no modifiers
                } else if (this.plainTextByDefault && modString === 'none') {
                    purpose = InsertMode.PLAINTEXT.toString(); // When no modifiers with Ctrl inverted, it acts as Ctrl
                }
                
                return {
                    command: this.formatKeyComboForDisplay(modString),
                    purpose: purpose
                };
            });
    }

    /**
     * Format a key combo for display in instructions
     */
    formatKeyComboForDisplay(key: string): string {
        if (key === 'none') return "None";
        return key.split('+')
            .map(k => k.charAt(0).toUpperCase() + k.slice(1))
            .join('+');
    }

    /**
     * Update key state based on keyboard events
     */
    updateKeyState(event: KeyboardEvent, isKeyDown: boolean): boolean {
        let updated = false;
        
        if (event.key === KEYS.ALT && this.keyState.alt !== isKeyDown) {
            this.keyState.alt = isKeyDown;
            updated = true;
        } else if (event.key === KEYS.CONTROL && this.keyState.ctrl !== isKeyDown) {
            this.keyState.ctrl = isKeyDown;
            updated = true;
        } else if (event.key === KEYS.SHIFT && this.keyState.shift !== isKeyDown) {
            this.keyState.shift = isKeyDown;
            updated = true;
        }
        
        return updated;
    }

    /**
     * Get the current key state
     */
    getKeyState(): { shift: boolean, ctrl: boolean, alt: boolean } {
        return { ...this.keyState };
    }

    /**
     * Set the key state directly (useful for syncing between components)
     */
    setKeyState(state: { shift: boolean, ctrl: boolean, alt: boolean }): void {
        this.keyState = { ...state };
    }

    /**
     * Get the current KeyCombo based on key state
     */
    getCurrentKeyCombo(): { insertMode: InsertMode, contentFormat: ContentFormat } {
        let effectiveState = { ...this.keyState };
        // Invert ctrl if plainTextByDefault is true
        const combo = findKeyComboByModifiers(
            effectiveState.shift, 
            effectiveState.ctrl, 
            effectiveState.alt,
            this.plainTextByDefault // pass invertCtrl
        );
        return {
            insertMode: combo.insertMode,
            contentFormat: combo.contentFormat
        };
    }

    /**
     * Get the effective insert mode and content format for a given event or key state
     * Always respects plainTextByDefault
     */
    getEffectiveInsertModeAndFormat(eventOrState?: KeyboardEvent | { shift: boolean, ctrl: boolean, alt: boolean }): { insertMode: InsertMode, contentFormat: ContentFormat } {
        let shift: boolean, ctrl: boolean, alt: boolean;
        if (!eventOrState) {
            ({ shift, ctrl, alt } = this.keyState);
        } else if ('shiftKey' in eventOrState) {
            shift = eventOrState.shiftKey;
            ctrl = eventOrState.ctrlKey;
            alt = eventOrState.altKey;
        } else {
            ({ shift, ctrl, alt } = eventOrState);
        }
        // Invert ctrl if plainTextByDefault
        const effectiveCtrl = this.plainTextByDefault ? !ctrl : ctrl;
        const combo = findKeyComboByModifiers(shift, effectiveCtrl, alt, false);
        return {
            insertMode: combo.insertMode,
            contentFormat: combo.contentFormat
        };
    }
}
