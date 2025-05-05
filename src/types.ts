export interface KeyCombo {
    shift?: boolean;
    ctrl?: boolean;
    alt?: boolean;
    description?: string;
    alternateDesc?: string;  // Alternate description when behavior is inverted
    action: string;
}

export interface KeyState {
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
}

export const DEFAULT_KEYMAP: Record<string, KeyCombo> = {
    'none': { shift: false, ctrl: false, alt: false, description: "Default", action: "link" },
    'shift': { shift: true, ctrl: false, alt: false, description: "Text as alias", action: "selectedalias" },
    'ctrl': { 
        shift: false, 
        ctrl: true, 
        alt: false, 
        description: "Insert as plain text", 
        alternateDesc: "Insert as link",
        action: "plaintext" 
    },
    'alt': { shift: false, ctrl: false, alt: true, description: "Alternate format", action: "alternate" },
    'shift+alt': { shift: true, ctrl: false, alt: true, description: "Force no alias", action: "noalias" },
    'ctrl+shift': { shift: true, ctrl: true, alt: false, action: "selectedplain" },
    'ctrl+alt': { shift: false, ctrl: true, alt: true, action: "altplain" },
    'ctrl+shift+alt': { shift: true, ctrl: true, alt: true, action: "dailynote" },
};
