import { Scope, Modifier } from 'obsidian';
import { DEFAULT_KEYMAP, KeyCombo, Action, getAllKeyCombos, findKeyComboByModifiers, KeyMapEntry } from './types';

/**
 * Handles keyboard shortcuts for the plugin
 */
export class KeyboardHandler {
    private scope: Scope | null;
    private invertCtrlBehavior: boolean;
    private callback: ((event: KeyboardEvent) => boolean) | null = null;

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

        // Use simpler registration for arrow keys
        // The specific modifier combinations will be handled in handleArrowKeys
        this.scope.register([], "ArrowDown", (event: KeyboardEvent) => {
            if (this.callback) return this.callback(event);
            return false;
        });

        this.scope.register([], "ArrowUp", (event: KeyboardEvent) => {
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
        // Add explicit type annotation to fix the 'unknown' type error
        return Object.values(DEFAULT_KEYMAP)
            .filter((entry: KeyMapEntry) => entry.combo.showInInstructions === true)
            .map((entry: KeyMapEntry) => {
                const combo = entry.combo;
                const modString = entry.modString;
                
                // Use the enum's string value as the description
                let purpose = combo.action;
                // Still respect the alternate description for ctrl key when inverted
                if (this.invertCtrlBehavior && combo.alternateDesc) {
                    purpose = combo.alternateDesc;
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
        
        // Find the combo using the helper function
        return findKeyComboByModifiers(keyState.shift, keyState.ctrl, keyState.alt);
    }

    /**
     * Get a key combination by name (deprecated - use getKeyComboByAction instead)
     * This method has been kept for backward compatibility
     */
    getKeyComboByName(name: string): KeyCombo {
        // Convert string to Action enum if possible
        const action = Object.values(Action).find(a => a === name);
        if (action) {
            return this.getKeyComboByAction(action);
        }
        
        // Fallback: look for key combo by modifier string
        for (const [actionKey, entry] of Object.entries(DEFAULT_KEYMAP) as [Action, KeyMapEntry][]) {
            if (entry.modString === name) {
                return entry.combo;
            }
        }
        
        // Default fallback
        return DEFAULT_KEYMAP[Action.LINK].combo;
    }

    /**
     * Get a key combination by action
     */
    getKeyComboByAction(action: Action): KeyCombo {
        return DEFAULT_KEYMAP[action]?.combo || DEFAULT_KEYMAP[Action.LINK].combo;
    }
}
