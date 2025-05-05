export enum Action {
    LINK = 'Insert as link',
    SUGGESTION_TEXT = 'Use suggestion text',
    PLAINTEXT = 'Insert as plain text',
    ALTERNATE = 'Alternate format',
    NO_ALIAS = 'Force no alias',
    SELECTED_PLAIN = 'Insert selected text',
    ALT_PLAIN = 'Insert alternate format plain text',
    DAILY_NOTE = 'Insert Daily Note Reference'
}

export interface KeyCombo {
    shift?: boolean;
    ctrl?: boolean;
    alt?: boolean;
    key: string;
    alternateDesc?: Action;
    action: Action;
    showInInstructions?: boolean;
}

export interface KeyState {
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
}

// Create a mapping from key combinations to actions
export interface KeyMapEntry {
    combo: KeyCombo;
    modString: string; // String representation of modifier keys, e.g., "ctrl+shift"
}

// Define the DEFAULT_KEYMAP using Actions as keys
export const DEFAULT_KEYMAP: Record<Action, KeyMapEntry> = {
    [Action.LINK]: {
        combo: { 
            shift: false, 
            ctrl: false, 
            alt: false, 
            key: 'Enter', 
            action: Action.LINK, 
            showInInstructions: false 
        },
        modString: 'none'
    },
    [Action.SUGGESTION_TEXT]: {
        combo: { 
            shift: true, 
            ctrl: false, 
            alt: false, 
            key: 'Enter', 
            action: Action.SUGGESTION_TEXT, 
            showInInstructions: true 
        },
        modString: 'shift'
    },
    [Action.PLAINTEXT]: {
        combo: { 
            shift: false, 
            ctrl: true, 
            alt: false, 
            key: 'Enter', 
            alternateDesc: Action.LINK,
            action: Action.PLAINTEXT,
            showInInstructions: true 
        },
        modString: 'ctrl'
    },
    [Action.ALTERNATE]: {
        combo: { 
            shift: false, 
            ctrl: false, 
            alt: true, 
            key: 'Enter', 
            action: Action.ALTERNATE,
            showInInstructions: true 
        },
        modString: 'alt'
    },
    [Action.NO_ALIAS]: {
        combo: { 
            shift: true, 
            ctrl: false, 
            alt: true, 
            key: 'Enter', 
            action: Action.NO_ALIAS,
            showInInstructions: true 
        },
        modString: 'shift+alt'
    },
    [Action.SELECTED_PLAIN]: {
        combo: { 
            shift: true, 
            ctrl: true, 
            alt: false, 
            key: 'Enter', 
            action: Action.SELECTED_PLAIN,
            showInInstructions: false
        },
        modString: 'ctrl+shift'
    },
    [Action.ALT_PLAIN]: {
        combo: { 
            shift: false, 
            ctrl: true, 
            alt: true, 
            key: 'Enter', 
            action: Action.ALT_PLAIN,
            showInInstructions: false
        },
        modString: 'ctrl+alt'
    },
    [Action.DAILY_NOTE]: {
        combo: { 
            shift: true, 
            ctrl: true, 
            alt: true, 
            key: 'Enter', 
            action: Action.DAILY_NOTE,
            showInInstructions: false
        },
        modString: 'ctrl+shift+alt'
    }
};

// Helper function to get all key combos
export function getAllKeyCombos(): KeyCombo[] {
    return Object.values(DEFAULT_KEYMAP).map((entry: KeyMapEntry) => entry.combo);
}

// Helper function to find combo by modifier state
export function findKeyComboByModifiers(shift: boolean, ctrl: boolean, alt: boolean): KeyCombo {
    for (const entry of Object.values(DEFAULT_KEYMAP) as KeyMapEntry[]) {
        const combo = entry.combo;
        if (combo.shift === shift && combo.ctrl === ctrl && combo.alt === alt) {
            return { ...combo }; // Return a copy of the combo
        }
    }
    return DEFAULT_KEYMAP[Action.LINK].combo; // Default
}

// Helper function to find key map entry by modifier string
export function findKeyMapEntryByModString(modString: string): KeyMapEntry | undefined {
    for (const entry of Object.values(DEFAULT_KEYMAP) as KeyMapEntry[]) {
        if (entry.modString === modString) {
            return entry;
        }
    }
    return undefined;
}

// Helper function to get modString for an action
export function getModStringForAction(action: Action): string {
    return DEFAULT_KEYMAP[action].modString;
}
