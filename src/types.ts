export interface KeyCombo {
    shift?: boolean;
    ctrl?: boolean;
    alt?: boolean;
    description?: string;
    action: string;
}

export interface KeyState {
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
}

export const DEFAULT_KEYMAP: Record<string, KeyCombo> = {
    'none': { shift: false, ctrl: false, alt: false, description: "Default", action: "link" },
    'shift': { shift: true, ctrl: false, alt: false, description: "Selected text as alias", action: "alias" },
    'ctrl': { shift: false, ctrl: true, alt: false, description: "Insert as plain text", action: "plaintext" },
    'alt': { shift: false, ctrl: false, alt: true, description: "Alternate format", action: "alternate" },
    'shift+alt': { shift: true, ctrl: false, alt: true, description: "Force no alias", action: "noalias" },
    'ctrl+shift': { shift: true, ctrl: true, alt: false, action: "textplain" },
    'ctrl+alt': { shift: false, ctrl: true, alt: true, action: "altplain" },
    'ctrl+shift+alt': { shift: true, ctrl: true, alt: true, action: "dailynote" },
};
