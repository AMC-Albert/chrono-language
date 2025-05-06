import { 
    INSERT_MODE, 
    CONTENT_FORMAT, 
    MODIFIERS, 
    KEYS, 
    DESCRIPTIONS,
    MODIFIER_BEHAVIOR,
    MODIFIER_KEY,
    HIDDEN_ACTIONS
} from './constants';

/**
 * Types for Insert Modes
 * Using string enums directly to avoid type errors
 */
export enum InsertMode {
    LINK = 'Insert as link',
    PLAINTEXT = 'Insert as plain text'
}

/**
 * Types for Content Format
 * Using string enums directly to avoid type errors
 */
export enum ContentFormat {
    PRIMARY = 'Primary format',
    ALTERNATE = 'Alternate format',
    DAILY_NOTE = 'Daily note format',
    SUGGESTION_TEXT = 'Use suggestion text'
}

// helper to extract all values from a const-object
type ValueOf<T> = T[keyof T];

// derive unions automatically from constants.ts
export type InsertModeUnion = ValueOf<typeof INSERT_MODE>;
export type ContentFormatUnion = ValueOf<typeof CONTENT_FORMAT>;

// expose value namespaces for legacy enum‐style references
export const InsertModeUnion = INSERT_MODE;
export const ContentFormatUnion = CONTENT_FORMAT;

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
    insertMode: InsertModeUnion;
    contentFormat: ContentFormatUnion;
    showInInstructions?: boolean;
    description?: string; // Human-readable description
}

// Create a mapping from key combinations to actions
export interface KeyMapEntry {
    combo: KeyCombo;
    modString: string; // String representation of modifier keys, e.g., "ctrl+shift"
}

// Define insert modes by modifier behavior (not directly by keys)
const INSERT_MODES: Record<string, InsertModeUnion> = {
    [MODIFIER_KEY.NONE]: INSERT_MODE.LINK,
    [MODIFIER_BEHAVIOR.INSERT_MODE_TOGGLE]: INSERT_MODE.PLAINTEXT
};

// Define content formats by modifier behavior (not directly by keys)
const CONTENT_FORMATS: Record<string, ContentFormatUnion> = {
    [MODIFIER_KEY.NONE]: CONTENT_FORMAT.PRIMARY,
    [MODIFIER_BEHAVIOR.CONTENT_SUGGESTION_TOGGLE]: CONTENT_FORMAT.SUGGESTION_TEXT,
    [MODIFIER_BEHAVIOR.CONTENT_FORMAT_TOGGLE]: CONTENT_FORMAT.ALTERNATE,
    [MODIFIER_BEHAVIOR.DAILY_NOTE_TOGGLE]: CONTENT_FORMAT.DAILY_NOTE
};

/**
 * Create a modifier string from key states with consistent ordering
 */
export function createModifierString(
    shift: boolean,
    ctrl: boolean,
    alt: boolean
): ValueOf<typeof MODIFIERS> {    // narrow return type to known modifiers
    const mods = [];
    if (ctrl) mods.push(MODIFIER_KEY.CTRL);
    if (shift) mods.push(MODIFIER_KEY.SHIFT);
    if (alt) mods.push(MODIFIER_KEY.ALT);
    return (mods.length > 0 ? mods.join('+') : MODIFIER_KEY.NONE) as ValueOf<typeof MODIFIERS>;
}

/**
 * Get the base behavior string that controls insert mode
 * Returns the appropriate behavior string based on the current modifiers
 */
function getInsertModeBehaviorString(modString: string): string {
    // In current implementation, insert mode is toggled by the key assigned to MODIFIER_BEHAVIOR.INSERT_MODE_TOGGLE
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
    // Check for the combination assigned to MODIFIER_BEHAVIOR.DAILY_NOTE_TOGGLE first
    if (modString.includes(MODIFIER_BEHAVIOR.DAILY_NOTE_TOGGLE)) {
        return MODIFIER_BEHAVIOR.DAILY_NOTE_TOGGLE;
    }
    
    // Check for the key assigned to MODIFIER_BEHAVIOR.CONTENT_SUGGESTION_TOGGLE
    if (modString.includes(MODIFIER_BEHAVIOR.CONTENT_SUGGESTION_TOGGLE)) {
        return MODIFIER_BEHAVIOR.CONTENT_SUGGESTION_TOGGLE;
    }
    
    // Check for the key assigned to MODIFIER_BEHAVIOR.CONTENT_FORMAT_TOGGLE
    if (modString.includes(MODIFIER_BEHAVIOR.CONTENT_FORMAT_TOGGLE)) {
        return MODIFIER_BEHAVIOR.CONTENT_FORMAT_TOGGLE;
    }
    
    // Default to primary format
    return MODIFIER_KEY.NONE;
}

/**
 * Generates a description for a key combo
 */
function generateDescription(insertMode: InsertModeUnion, contentFormat: ContentFormatUnion): string {
    if (insertMode === INSERT_MODE.PLAINTEXT) {
        if (contentFormat === CONTENT_FORMAT.SUGGESTION_TEXT) {
            return DESCRIPTIONS.PLAINTEXT_SUGGESTION_TEXT;
        } else if (contentFormat === CONTENT_FORMAT.DAILY_NOTE) {
            return DESCRIPTIONS.PLAINTEXT_DAILY_NOTE;
        } else if (contentFormat === CONTENT_FORMAT.ALTERNATE) {
            return DESCRIPTIONS.PLAINTEXT_ALTERNATE;
        } else {
            return DESCRIPTIONS.PLAINTEXT_PRIMARY;
        }
    } else {
        if (contentFormat === CONTENT_FORMAT.SUGGESTION_TEXT) {
            return DESCRIPTIONS.LINK_SUGGESTION_TEXT;
        } else if (contentFormat === CONTENT_FORMAT.DAILY_NOTE) {
            return DESCRIPTIONS.LINK_DAILY_NOTE;
        } else if (contentFormat === CONTENT_FORMAT.ALTERNATE) {
            return DESCRIPTIONS.LINK_ALTERNATE;
        } else {
            return DESCRIPTIONS.LINK_PRIMARY;
        }
    }
}

/**
 * Determine if a key combo should be shown in instructions
 */
function shouldShowInInstructions(combo: KeyCombo): boolean {
    return !HIDDEN_ACTIONS.some(
        h => h.insertMode === combo.insertMode && h.contentFormat === combo.contentFormat
    );
}

/**
 * Dynamically generate key map entries based on modifier combinations
 */
function generateKeyMap(): Record<string, KeyMapEntry> {
    const keyMap: Record<string, KeyMapEntry> = {};
    const booleanOptions = [false, true];

    for (const ctrl of booleanOptions) {
        for (const shift of booleanOptions) {
            for (const alt of booleanOptions) {
                const modString = createModifierString(shift, ctrl, alt);

                const insertModeBehavior = getInsertModeBehaviorString(modString);
                const insertMode = INSERT_MODES[insertModeBehavior];

                const contentFormatBehavior = getContentFormatBehaviorString(modString);
                const contentFormat = CONTENT_FORMATS[contentFormatBehavior] || CONTENT_FORMAT.PRIMARY;

                const description = generateDescription(insertMode, contentFormat);

                const combo: KeyCombo = {
                    shift, ctrl, alt,
                    key: KEYS.ENTER,
                    insertMode,
                    contentFormat,
                    description,
                    showInInstructions: shouldShowInInstructions({ shift, ctrl, alt, key: KEYS.ENTER, insertMode, contentFormat })
                };

                keyMap[modString] = { combo, modString };
            }
        }
    }

    return keyMap;
}

// Define the KEYMAP using dynamic generation
export const KEYMAP = generateKeyMap();

// Helper function to get all key combos
export function getAllKeyCombos(): KeyCombo[] {
    return Object.values(KEYMAP).map((entry: KeyMapEntry) => entry.combo);
}

// Helper function to find combo by modifier state
export function findKeyComboByModifiers(shift: boolean, ctrl: boolean, alt: boolean, invertCtrl: boolean = false): KeyCombo {
    // Invert ctrl if needed (for plainTextByDefault)
    const effectiveCtrl = invertCtrl ? !ctrl : ctrl;
    const modString = createModifierString(shift, effectiveCtrl, alt);
    const entry = KEYMAP[modString];
    return entry ? { ...entry.combo } : KEYMAP[MODIFIER_KEY.NONE].combo;
}
