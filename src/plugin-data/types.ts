import { 
    INSERT_MODE, 
    CONTENT_FORMAT, 
    MODIFIERS, 
    KEYS, 
    DESCRIPTIONS,
    MODIFIER_BEHAVIOR,
    MODIFIER_KEY
} from './constants';

// Define two distinct action type groups for better organization and type safety
export enum InsertMode {
    LINK = INSERT_MODE.LINK,
    PLAINTEXT = INSERT_MODE.PLAINTEXT
}

export enum ContentFormat {
    PRIMARY = CONTENT_FORMAT.PRIMARY,
    ALTERNATE = CONTENT_FORMAT.ALTERNATE,
    DAILY_NOTE = CONTENT_FORMAT.DAILY_NOTE,
    SUGGESTION_TEXT = CONTENT_FORMAT.SUGGESTION_TEXT
}

export interface KeyState {
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
}

// KeyCombo definition using the action grouping
export interface KeyCombo {
    shift?: boolean;
    ctrl?: boolean;
    alt?: boolean;
    key: string;
    insertMode: InsertMode;
    contentFormat: ContentFormat;
    showInInstructions?: boolean;
    description?: string; // Human-readable description
}

// Create a mapping from key combinations to actions
export interface KeyMapEntry {
    combo: KeyCombo;
    modString: string; // String representation of modifier keys, e.g., "ctrl+shift"
}

// Define insert modes by modifier behavior (not directly by keys)
const INSERT_MODES: Record<string, InsertMode> = {
    [MODIFIER_KEY.NONE]: InsertMode.LINK,
    [MODIFIER_BEHAVIOR.INSERT_MODE_TOGGLE]: InsertMode.PLAINTEXT
};

// Define content formats by modifier behavior (not directly by keys)
const CONTENT_FORMATS: Record<string, ContentFormat> = {
    [MODIFIER_KEY.NONE]: ContentFormat.PRIMARY,
    [MODIFIER_BEHAVIOR.CONTENT_SUGGESTION_TOGGLE]: ContentFormat.SUGGESTION_TEXT,
    [MODIFIER_BEHAVIOR.CONTENT_FORMAT_TOGGLE]: ContentFormat.ALTERNATE,
    [MODIFIER_BEHAVIOR.DAILY_NOTE_TOGGLE]: ContentFormat.DAILY_NOTE
};

/**
 * Create a modifier string from key states with consistent ordering
 */
export function createModifierString(shift: boolean, ctrl: boolean, alt: boolean): string {
    // Always order as 'ctrl+shift+alt' or subset of that for consistency
    const mods = [];
    if (ctrl) mods.push(MODIFIER_KEY.CTRL);
    if (shift) mods.push(MODIFIER_KEY.SHIFT);
    if (alt) mods.push(MODIFIER_KEY.ALT);
    return mods.length > 0 ? mods.join('+') : MODIFIER_KEY.NONE;
}

/**
 * Get the base behavior string that controls insert mode
 * Returns the appropriate behavior string based on the current modifiers
 */
function getInsertModeBehaviorString(modString: string): string {
    // In current implementation, insert mode is toggled by ctrl
    // But this function allows us to change which key controls this behavior
    return modString.includes(MODIFIER_BEHAVIOR.INSERT_MODE_TOGGLE)
        ? MODIFIER_BEHAVIOR.INSERT_MODE_TOGGLE
        : MODIFIER_KEY.NONE;
}

/**
 * Get the content format behavior based on the modifiers
 * Returns the appropriate behavior string for the content format
 */
function getContentFormatBehaviorString(modString: string): string {
    // Check for shift+alt first (the daily note toggle)
    if (modString.includes(MODIFIER_BEHAVIOR.DAILY_NOTE_TOGGLE)) {
        return MODIFIER_BEHAVIOR.DAILY_NOTE_TOGGLE;
    }
    
    // Check for the content suggestion toggle (shift)
    if (modString.includes(MODIFIER_BEHAVIOR.CONTENT_SUGGESTION_TOGGLE)) {
        return MODIFIER_BEHAVIOR.CONTENT_SUGGESTION_TOGGLE;
    }
    
    // Check for the content format toggle (alt)
    if (modString.includes(MODIFIER_BEHAVIOR.CONTENT_FORMAT_TOGGLE)) {
        return MODIFIER_BEHAVIOR.CONTENT_FORMAT_TOGGLE;
    }
    
    // Default to primary format
    return MODIFIER_KEY.NONE;
}

/**
 * Generates a description for a key combo
 */
function generateDescription(insertMode: InsertMode, contentFormat: ContentFormat): string {
    if (insertMode === InsertMode.PLAINTEXT) {
        if (contentFormat === ContentFormat.SUGGESTION_TEXT) {
            return DESCRIPTIONS.PLAINTEXT_SUGGESTION_TEXT;
        } else if (contentFormat === ContentFormat.DAILY_NOTE) {
            return DESCRIPTIONS.PLAINTEXT_DAILY_NOTE;
        } else if (contentFormat === ContentFormat.ALTERNATE) {
            return DESCRIPTIONS.PLAINTEXT_ALTERNATE;
        } else {
            return DESCRIPTIONS.PLAINTEXT_PRIMARY;
        }
    } else {
        if (contentFormat === ContentFormat.SUGGESTION_TEXT) {
            return DESCRIPTIONS.LINK_SUGGESTION_TEXT;
        } else if (contentFormat === ContentFormat.DAILY_NOTE) {
            return DESCRIPTIONS.LINK_DAILY_NOTE;
        } else if (contentFormat === ContentFormat.ALTERNATE) {
            return DESCRIPTIONS.LINK_ALTERNATE;
        } else {
            return DESCRIPTIONS.LINK_PRIMARY;
        }
    }
}

/**
 * Determine if a key combo should be shown in instructions
 */
function shouldShowInInstructions(modString: string): boolean {
    // Hide certain combinations from instructions
    return ![MODIFIERS.CTRL_SHIFT_ALT, MODIFIERS.CTRL_SHIFT, MODIFIERS.CTRL_ALT].includes(modString);
}

/**
 * Dynamically generate key map entries based on modifier combinations
 */
function generateKeyMap(): Record<string, KeyMapEntry> {
    const keyMap: Record<string, KeyMapEntry> = {};
    
    // Generate all possible modifier combinations
    const booleanOptions = [false, true];
    for (const ctrl of booleanOptions) {
        for (const shift of booleanOptions) {
            for (const alt of booleanOptions) {
                const modString = createModifierString(shift, ctrl, alt);
                
                // Get the insert mode based on behavior
                const insertModeBehavior = getInsertModeBehaviorString(modString);
                const insertMode = INSERT_MODES[insertModeBehavior];
                
                // Get content format based on behavior
                const contentFormatBehavior = getContentFormatBehaviorString(modString);
                const contentFormat = CONTENT_FORMATS[contentFormatBehavior] || ContentFormat.PRIMARY;
                
                // Generate the description
                const description = generateDescription(insertMode, contentFormat);
                
                // Create the combo
                keyMap[modString] = {
                    combo: {
                        shift,
                        ctrl,
                        alt,
                        key: KEYS.ENTER,
                        insertMode,
                        contentFormat,
                        description,
                        showInInstructions: shouldShowInInstructions(modString)
                    },
                    modString
                };
            }
        }
    }
    
    return keyMap;
}

// Define the KEYMAP using dynamic generation
export const KEYMAP = generateKeyMap();

/**
 * Create a key state object from event
 */
export function getKeyStateFromEvent(event: KeyboardEvent | MouseEvent): KeyState {
    return {
        shift: 'shiftKey' in event ? event.shiftKey : false,
        ctrl: 'ctrlKey' in event ? event.ctrlKey : false,
        alt: 'altKey' in event ? event.altKey : false
    };
}

// Helper function to get all key combos
export function getAllKeyCombos(): KeyCombo[] {
    return Object.values(KEYMAP).map((entry: KeyMapEntry) => entry.combo);
}

// Helper function to find combo by modifier state
export function findKeyComboByModifiers(shift: boolean, ctrl: boolean, alt: boolean): KeyCombo {
    const modString = createModifierString(shift, ctrl, alt);
    const entry = KEYMAP[modString];
    return entry ? { ...entry.combo } : KEYMAP[MODIFIER_KEY.NONE].combo;
}

// Helper function to find key map entry by modifier string
export function findKeyMapEntryByModString(modString: string): KeyMapEntry {
    return KEYMAP[modString] || KEYMAP[MODIFIER_KEY.NONE];
}

// For backward compatibility - can be removed if needed
export const DEFAULT_KEYMAP = KEYMAP;
