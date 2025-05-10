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
    NONE: 'none', // Used for string constants, not directly as an Obsidian modifier
    CTRL: 'Ctrl',
    SHIFT: 'Shift',
    ALT: 'Alt'
} as const;

import { Platform } from 'obsidian';

/**
 * Primary modifier key label, Cmd on macOS or Ctrl elsewhere
 */
export const PRIMARY_MOD = Platform.isMacOS ? '⌘' : 'ctrl';

/**
 * Centralized instruction definitions for key combos and their purposes
 * Now a function to support swappable primary mod (cmd/ctrl) and no-modifier behavior
 */
export function getInstructionDefinitions(plainTextByDefault: boolean, swapOpenNoteKeybinds: boolean) {
    const instructions = [
        { command: '↑↓', purpose: 'to navigate' },
        { command: `${PRIMARY_MOD} ↵`, purpose: plainTextByDefault ? 'to insert link' : 'to insert plain text' },
        { command: 'alt ↵', purpose: 'to use alt format' },
        { command: 'shift ↵', purpose: 'to use suggested text' },
        { command: 'shift alt ↵', purpose: 'to force no alias' },
        { command: 'shift ␣', purpose: swapOpenNoteKeybinds ? 'to open in new tab' : 'to open note' },
        { command: `${PRIMARY_MOD} shift ␣`, purpose: swapOpenNoteKeybinds ? 'to open note' : 'to open in new tab' },
        { command: 'esc', purpose: 'to dismiss' }
    ];
    return instructions;
}

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
    NONE: MODIFIER_KEY.NONE, // This will be 'none'
    CTRL: MODIFIER_KEY.CTRL, // This will be 'Ctrl'
    SHIFT: MODIFIER_KEY.SHIFT, // This will be 'Shift'
    ALT: MODIFIER_KEY.ALT, // This will be 'Alt'
    CTRL_SHIFT: `${MODIFIER_KEY.CTRL}+${MODIFIER_KEY.SHIFT}`, // 'Ctrl+Shift'
    CTRL_ALT: `${MODIFIER_KEY.CTRL}+${MODIFIER_KEY.ALT}`, // 'Ctrl+Alt'
    SHIFT_ALT: `${MODIFIER_KEY.SHIFT}+${MODIFIER_KEY.ALT}`, // 'Shift+Alt'
    CTRL_SHIFT_ALT: `${MODIFIER_KEY.CTRL}+${MODIFIER_KEY.SHIFT}+${MODIFIER_KEY.ALT}` // 'Ctrl+Shift+Alt'
} as const;

/**
 * Array of modifier key combinations for registering hotkeys.
 * Uses Obsidian's Modifier type.
 */
export const MODIFIER_COMBOS: import('obsidian').Modifier[][] = [
    [], // No modifiers
    [MODIFIER_KEY.CTRL], // Ctrl
    [MODIFIER_KEY.SHIFT], // Shift
    [MODIFIER_KEY.ALT], // Alt
    [ // Ctrl+Shift
        MODIFIER_KEY.CTRL,
        MODIFIER_KEY.SHIFT
    ],
    [ // Ctrl+Alt
        MODIFIER_KEY.CTRL,
        MODIFIER_KEY.ALT
    ],
    [ // Shift+Alt
        MODIFIER_KEY.SHIFT,
        MODIFIER_KEY.ALT
    ],
    [ // Ctrl+Shift+Alt
        MODIFIER_KEY.CTRL,
        MODIFIER_KEY.SHIFT,
        MODIFIER_KEY.ALT
    ]
];

/**
 * Constants for keyboard keys
 */
export const KEYS = {
    ENTER: 'Enter',
    CONTROL: 'Control',
    ALT: 'Alt',
    SHIFT: 'Shift',
    SPACE: ' ', // Add SPACE for clarity
    TAB: 'Tab'
} as const;

/**
 * Navigation keys that should be prevented from propagating to Obsidian
 * when modifier keys are pressed
 */
export const NAVIGATION_KEYS = [
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'PageUp', 'PageDown', 'Home', 'End'
] as const;

/**
 * Constants for key event types
 */
export const KEY_EVENTS = {
    KEYDOWN: 'keydown',
    KEYUP: 'keyup'
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
    OPEN_DAILY_NOTE: 'Open daily note',
    OPEN_DAILY_NOTE_NEW_TAB: 'Open daily note in new tab',
} as const;

/**
 * CSS class names
 */
export const CLASSES = {
    suggestionContainer: 'qd-suggestion-container',
    suggestionText: 'qd-suggestion-text',
    suggestionPreview: 'qd-suggestion-preview',
    unresolvedLink: 'qd-is-unresolved-link',
    unresolvedText: 'qd-is-unresolved-text',
    errorText: 'qd-error-text',
    errorIcon: 'qd-error-icon',
    timeRelevantSuggestion: 'qd-time-relevant-suggestion',
    activeTrigger: 'qd-active-trigger',
    suggester: 'qd-suggester',
};

/**
 * Constants for error messages
 */
export const ERRORS = {
    FAILED_CREATE_NOTE: 'Failed to create daily note',
    FAILED_FIND_NOTE: 'Failed to find daily note in vault',
    FAILED_HANDLE_NOTE: 'Failed to handle daily note',
    UNABLE_PARSE_DATE: 'Unable to parse date',
    DAILY_NOTES_FOLDER_MISSING: 'Failed to find daily notes folder. Please check that the folder you have set in the daily notes core plugin settings exists.',
    FAILED_CREATE_FOLDER: 'Failed to create daily notes folder.',
} as const;

/**
 * List of insertMode + contentFormat combos to hide in instruction list
 */
export const HIDDEN_ACTIONS = [
    { insertMode: INSERT_MODE.PLAINTEXT, contentFormat: CONTENT_FORMAT.SUGGESTION_TEXT },
    { insertMode: INSERT_MODE.PLAINTEXT, contentFormat: CONTENT_FORMAT.ALTERNATE },
    { insertMode: INSERT_MODE.PLAINTEXT, contentFormat: CONTENT_FORMAT.DAILY_NOTE },
] as const;

/**
 * Common string constants, typically in lowercase for matching.
 */
export const COMMON_STRINGS = {
    TODAY: 'today',
    TOMORROW: 'tomorrow',
    YESTERDAY: 'yesterday',
    NOW: 'now',
    NEXT: 'next',
    LAST: 'last',
    AGO: 'ago',
    IN: 'in',

    // Time units (singular, lowercase)
    YEAR: 'year',
    MONTH: 'month',
    WEEK: 'week',
    DAY: 'day',
    HOUR: 'hour',
    MINUTE: 'minute',
    SECOND: 'second',

    // Days of the week (full name, lowercase)
    MONDAY: 'monday',
    TUESDAY: 'tuesday',
    WEDNESDAY: 'wednesday',
    THURSDAY: 'thursday',
    FRIDAY: 'friday',
    SATURDAY: 'saturday',
    SUNDAY: 'sunday',

    // Months of the year (full name, lowercase)
    JANUARY: 'january',
    FEBRUARY: 'february',
    MARCH: 'march',
    APRIL: 'april',
    MAY: 'may',
    JUNE: 'june',
    JULY: 'july',
    AUGUST: 'august',
    SEPTEMBER: 'september',
    OCTOBER: 'october',
    NOVEMBER: 'november',
    DECEMBER: 'december',

    // Relative terms
    THIS: 'this',
} as const;

/**
 * Arrays of day and month names, capitalized.
 */
export const DAYS_OF_THE_WEEK = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
] as const;

export const MONTHS_OF_THE_YEAR = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
] as const;

/**
 * Common time-of-day phrases (capitalized for display, qd can parse these)
 */
export const TIME_OF_DAY_PHRASES = [
    'Noon',
    'Midday',
    'Midnight',
    'Morning',
    'Afternoon',
    'Evening',
    'Night',
    'Now'
] as const;

/**
 * Holiday aliases for parser
 */
export const HOLIDAY_ALIASES: Record<string, string> = {
    "Xmas": 'christmas',
    "X-mas": 'christmas',
    "July 4th": 'independence day',
    "4th of July": 'independence day',
};