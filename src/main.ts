import { Plugin } from 'obsidian';
import { ChronoLanguageSettings, ChronoLanguageSettingTab, DEFAULT_SETTINGS } from './settings';
import { EditorSuggester } from './features/editor-suggester';
import { OpenDailyNoteModal } from './features/open-daily-note';
import { StateField, StateEffect } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet } from '@codemirror/view';

// Effects for adding/clearing trigger phrase decorations
export const addTriggerDecorationEffect = StateEffect.define<{ from: number, to: number }>();
export const clearTriggerDecorationsEffect = StateEffect.define<null>();

// The actual decoration to apply
const triggerPhraseDecoration = Decoration.mark({ class: "chrono-active-trigger" });

// StateField to manage the decorations
export const triggerDecorationStateField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(decorations, tr) {
        // Map existing decorations through changes in the transaction
        decorations = decorations.map(tr.changes);

        for (let effect of tr.effects) {
            if (effect.is(addTriggerDecorationEffect)) {
                // Add new decoration
                // Clear any existing decorations first to prevent duplicates if effects are rapid
                decorations = Decoration.none; 
                decorations = decorations.update({
                    add: [triggerPhraseDecoration.range(effect.value.from, effect.value.to)]
                });
            } else if (effect.is(clearTriggerDecorationsEffect)) {
                // Clear all decorations managed by this field
                decorations = Decoration.none;
            }
        }
        return decorations;
    },
    provide: f => EditorView.decorations.from(f)
});

export default class ChronoLanguage extends Plugin {
	settings: ChronoLanguageSettings;
	editorSuggester: EditorSuggester;

	async onload() {
		await this.loadSettings();
		this.editorSuggester = new EditorSuggester(this);
		this.registerEditorSuggest(this.editorSuggester);

		// Register the StateField for decorations
		this.registerEditorExtension(triggerDecorationStateField);

		this.addCommand({
			id: 'open-daily-note',
			name: 'Open daily note',
			callback: () => new OpenDailyNoteModal(this.app, this).open()
		});
		this.addSettingTab(new ChronoLanguageSettingTab(this.app, this));
	}

	async onSettingsChanged() {
		if (this.editorSuggester) this.editorSuggester.unload();
		this.editorSuggester = new EditorSuggester(this);
		this.registerEditorSuggest(this.editorSuggester);
		this.editorSuggester.updateSettings({ 
			plainTextByDefault: this.settings.plainTextByDefault,
			holidayLocale: this.settings.holidayLocale 
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.editorSuggester?.updateInstructions(); 
	}

	updateKeyBindings(): void {
		this.editorSuggester?.updateSettings({ 
			plainTextByDefault: this.settings.plainTextByDefault,
			holidayLocale: this.settings.holidayLocale,
		});
	}
}
