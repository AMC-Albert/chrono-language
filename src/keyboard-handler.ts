import { Scope, Modifier } from 'obsidian';
import { DEFAULT_KEYMAP, KeyCombo } from './types';

/**
 * Handles keyboard shortcuts for the plugin
 */
export class KeyboardHandler {
    private scope: Scope;
    private invertCtrlBehavior: boolean;
    private callback: (event: KeyboardEvent) => boolean;

    constructor(scope: Scope, invertCtrlBehavior: boolean = false) {
        this.scope = scope;
        this.invertCtrlBehavior = invertCtrlBehavior;
    }

    /**
     * Register all keyboard shortcuts with a callback
     */
    registerShortcuts(callback: (event: KeyboardEvent) => boolean): void {
        this.callback = callback;
        
        // Register each modifier combination separately
        Object.values(DEFAULT_KEYMAP).forEach((combo) => {
            const keys: Modifier[] = [];
            if (combo.shift) keys.push("Shift");
            if (combo.ctrl) keys.push("Ctrl");
            if (combo.alt) keys.push("Alt");
            
            this.scope.register(keys, combo.key, (event: KeyboardEvent) => {
                return this.callback(event);
            });
        });

        // Register arrow navigation
        this.scope.register([], "ArrowDown", (event: KeyboardEvent) => {
            return this.callback(event);
        });

        this.scope.register([], "ArrowUp", (event: KeyboardEvent) => {
            return this.callback(event);
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
        return Object.entries(DEFAULT_KEYMAP)
            .filter(([key, combo]) => {
                return combo.description !== undefined;
            })
            .map(([key, combo]) => {
                let purpose = combo.description!;
                if (this.invertCtrlBehavior && combo.alternateDesc) {
                    purpose = combo.alternateDesc;
                }
                return {
                    command: this.formatKeyComboForDisplay(key),
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
    getMatchedCombo(event: KeyboardEvent | MouseEvent): KeyCombo {
        let keyState = {
            shift: 'shiftKey' in event ? event.shiftKey : false,
            ctrl: 'ctrlKey' in event ? event.ctrlKey : false,
            alt: 'altKey' in event ? event.altKey : false
        };
        
        if (this.invertCtrlBehavior) {
            keyState.ctrl = !keyState.ctrl;
        }
        
        let matchedCombo: KeyCombo = DEFAULT_KEYMAP.none;
        for (const combo of Object.values(DEFAULT_KEYMAP)) {
            const shiftMatch = combo.shift === keyState.shift;
            const ctrlMatch = combo.ctrl === keyState.ctrl;
            const altMatch = combo.alt === keyState.alt;

            if (shiftMatch && ctrlMatch && altMatch) {
                matchedCombo = combo;
                break;
            }
        }
        
        return matchedCombo;
    }
}
