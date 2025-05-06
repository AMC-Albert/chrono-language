/**
 * Constants for Insert Modes
 */
export const INSERT_MODE = {
    LINK: 'Insert as link',
    PLAINTEXT: 'Insert as plain text',
} as const;

/**
 * Constants for Content Formats
 */
export const CONTENT_FORMAT = {
    PRIMARY: 'Primary format',
    ALTERNATE: 'Alternate format',
    DAILY_NOTE: 'Daily note format',
    SUGGESTION_TEXT: 'Use suggestion text'
} as const;

/**
 * Modifier keys
 */
export const MODIFIER_KEY = {
    NONE: 'none',
    CTRL: 'ctrl',
    SHIFT: 'shift',
    ALT: 'alt'
} as const;

/**
 * Modifier behaviors - map physical keys to logical functions
 * This allows us to change which physical key controls which behavior
 */
export const MODIFIER_BEHAVIOR = {
    // The key that toggles between link and plaintext
    INSERT_MODE_TOGGLE: MODIFIER_KEY.CTRL,
    // The key that toggles between primary and suggestion text
    CONTENT_SUGGESTION_TOGGLE: MODIFIER_KEY.SHIFT,
    // The key that toggles between primary and alternate format
    CONTENT_FORMAT_TOGGLE: MODIFIER_KEY.ALT,
    // The combination that triggers daily note format
    DAILY_NOTE_TOGGLE: `${MODIFIER_KEY.SHIFT}+${MODIFIER_KEY.ALT}`
} as const;

/**
 * Constants for modifier combinations
 * These are derived from the basic modifier keys
 */
export const MODIFIERS = {
    NONE: 'none',
    CTRL: MODIFIER_KEY.CTRL,
    SHIFT: MODIFIER_KEY.SHIFT,
    ALT: MODIFIER_KEY.ALT,
    CTRL_SHIFT: `${MODIFIER_KEY.CTRL}+${MODIFIER_KEY.SHIFT}`,
    CTRL_ALT: `${MODIFIER_KEY.CTRL}+${MODIFIER_KEY.ALT}`,
    SHIFT_ALT: `${MODIFIER_KEY.SHIFT}+${MODIFIER_KEY.ALT}`,
    CTRL_SHIFT_ALT: `${MODIFIER_KEY.CTRL}+${MODIFIER_KEY.SHIFT}+${MODIFIER_KEY.ALT}`
} as const;

/**
 * Constants for keyboard keys
 */
export const KEYS = {
    ENTER: 'Enter',
    CONTROL: 'Control',
    ALT: 'Alt',
    SHIFT: 'Shift',
    TAB: 'Tab'
} as const;

/**
 * Constants for key event types
 */
export const KEY_EVENTS = {
    KEYDOWN: 'keydown',
    KEYUP: 'keyup'
} as const;

/**
 * Constants for date formats
 */
export const DATE_FORMAT = {
    DEFAULT: 'YYYY-MM-DD'
} as const;

/**
 * Constants for descriptions
 */
export const DESCRIPTIONS = {
    LINK_PRIMARY: 'Insert as link',
    LINK_SUGGESTION_TEXT: 'Use suggestion text',
    LINK_ALTERNATE: 'Alternate format',
    LINK_DAILY_NOTE: 'Force no alias',
    PLAINTEXT_PRIMARY: 'Insert as plain text',
    PLAINTEXT_SUGGESTION_TEXT: 'Use suggestion text',
    PLAINTEXT_ALTERNATE: 'Alternate format',
    PLAINTEXT_DAILY_NOTE: 'Force no alias',
    OPEN_DAILY_NOTE: 'Open daily note'
} as const;

/**
 * Constants for error messages
 */
export const ERRORS = {
    FAILED_CREATE_NOTE: 'Failed to create daily note',
    FAILED_FIND_NOTE: 'Failed to find daily note in vault',
    FAILED_HANDLE_NOTE: 'Failed to handle daily note',
    UNABLE_PARSE_DATE: 'Unable to parse date'
} as const;

/**
 * List of insertMode + contentFormat combos to hide in instruction list
 */
export const HIDDEN_ACTIONS = [
    { insertMode: INSERT_MODE.PLAINTEXT, contentFormat: CONTENT_FORMAT.SUGGESTION_TEXT },
    { insertMode: INSERT_MODE.PLAINTEXT, contentFormat: CONTENT_FORMAT.ALTERNATE },
    { insertMode: INSERT_MODE.PLAINTEXT, contentFormat: CONTENT_FORMAT.DAILY_NOTE },
] as const;