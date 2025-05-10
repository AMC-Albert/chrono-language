import { 
    INSERT_MODE, 
    CONTENT_FORMAT, 
    MODIFIERS, 
    KEYS, 
    MODIFIER_BEHAVIOR, 
    MODIFIER_KEY, 
} from '../constants';

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