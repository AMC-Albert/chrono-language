/**
 * Constants for Insert Modes
 */
export const INSERT_MODE = {
    LINK: 'Insert as link',
    PLAINTEXT: 'Insert as plain text'
};

/**
 * Constants for Content Formats
 */
export const CONTENT_FORMAT = {
    PRIMARY: 'Primary format',
    ALTERNATE: 'Alternate format',
    DAILY_NOTE: 'Daily note format',
    SUGGESTION_TEXT: 'Use suggestion text'
};

/**
 * Modifier keys
 */
export const MODIFIER_KEY = {
    NONE: 'none',
    CTRL: 'ctrl',
    SHIFT: 'shift',
    ALT: 'alt'
};

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
};

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
};

/**
 * Constants for keyboard keys
 */
export const KEYS = {
    ENTER: 'Enter',
    ARROW_UP: 'ArrowUp',
    ARROW_DOWN: 'ArrowDown',
    CONTROL: 'Control',
    ALT: 'Alt',
    SHIFT: 'Shift'
};

/**
 * Constants for date formats
 */
export const DATE_FORMAT = {
    DEFAULT: 'YYYY-MM-DD'
};

/**
 * Constants for descriptions
 */
export const DESCRIPTIONS = {
    LINK_PRIMARY: 'Insert as link',
    LINK_SUGGESTION_TEXT: 'Insert as link using suggestion text',
    LINK_ALTERNATE: 'Insert as link with alternate format',
    LINK_DAILY_NOTE: 'Insert as link without alias',
    PLAINTEXT_PRIMARY: 'Insert as plain text',
    PLAINTEXT_SUGGESTION_TEXT: 'Insert text as displayed',
    PLAINTEXT_ALTERNATE: 'Insert plain text with alternate format',
    PLAINTEXT_DAILY_NOTE: 'Insert daily note as plain text'
};

/**
 * Constants for error messages
 */
export const ERRORS = {
    FAILED_CREATE_NOTE: 'Failed to create daily note',
    FAILED_FIND_NOTE: 'Failed to find daily note in vault',
    FAILED_HANDLE_NOTE: 'Failed to handle daily note',
    UNABLE_PARSE_DATE: 'Unable to parse date'
};