import { Scope, Modifier } from 'obsidian';
import { 
    KEYMAP, 
    KeyCombo, 
    InsertMode,
    ContentFormat,
    getAllKeyCombos, 
    findKeyComboByModifiers, 
    KeyMapEntry 
} from '../plugin-data/types';
import { KEYS } from '../plugin-data/constants';

/**
 * Handles keyboard shortcuts for the plugin
 */
export class KeyboardHandler {
    private scope: Scope | null;
    private invertCtrlBehavior: boolean;
    private callback: ((event: KeyboardEvent) => boolean) | null = null;
    
    // Key state tracking
    private keyState: { shift: boolean, ctrl: boolean, alt: boolean } = { shift: false, ctrl: false, alt: false };

    constructor(scope?: Scope, invertCtrlBehavior: boolean = false) {
        this.scope = scope || null;
        this.invertCtrlBehavior = invertCtrlBehavior;
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

        // Register arrow keys
        this.scope.register([], KEYS.ARROW_DOWN, (event: KeyboardEvent) => {
            if (this.callback) return this.callback(event);
            return false;
        });

        this.scope.register([], KEYS.ARROW_UP, (event: KeyboardEvent) => {
            if (this.callback) return this.callback(event);
            return false;
        });
    }

    /**
     * Update the invert control behavior setting
     */
    setInvertCtrlBehavior(invert: boolean): void {
        this.invertCtrlBehavior = invert;
    }

    /**
     * Get instructions for display in the UI
     */
    getInstructions(): { command: string, purpose: string }[] {
        return Object.values(KEYMAP)
            .filter((entry: KeyMapEntry) => entry.combo.showInInstructions === true)
            .map((entry: KeyMapEntry) => {
                const combo = entry.combo;
                const modString = entry.modString;
                
                // Use the combo's description or fallback to the insert mode and content format
                let purpose = combo.description || 
                    `${combo.insertMode} with ${combo.contentFormat}`;
                
                // Handle inverted control behavior
                if (this.invertCtrlBehavior && modString === 'ctrl') {
                    purpose = InsertMode.LINK.toString(); // When Ctrl is inverted, it acts as no modifiers
                } else if (this.invertCtrlBehavior && modString === 'none') {
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
    getCurrentKeyCombo(): KeyCombo {
        let effectiveState = { ...this.keyState };
        
        if (this.invertCtrlBehavior) {
            effectiveState.ctrl = !effectiveState.ctrl;
        }
        
        return findKeyComboByModifiers(
            effectiveState.shift, 
            effectiveState.ctrl, 
            effectiveState.alt
        );
    }

    /**
     * Find the matched key combo based on key event state
     */
    getMatchedCombo(event: KeyboardEvent | MouseEvent | any): KeyCombo {
        let keyState = {
            shift: 'shiftKey' in event ? event.shiftKey : false,
            ctrl: 'ctrlKey' in event ? event.ctrlKey : false,
            alt: 'altKey' in event ? event.altKey : false
        };
        
        if (this.invertCtrlBehavior) {
            keyState.ctrl = !keyState.ctrl;
        }
        
        return findKeyComboByModifiers(keyState.shift, keyState.ctrl, keyState.alt);
    }
}
