import { Plugin } from 'obsidian';
import { ChronoLanguageSettings, ChronoLanguageSettingTab, DEFAULT_SETTINGS } from './settings';
import { EditorSuggester } from './features/editor-suggester';
import { OpenDailyNoteModal } from './features/open-daily-note';
import { StateField, StateEffect } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet } from '@codemirror/view';

// Effects for adding/clearing trigger phrase decorations
export const addTriggerDecorationEffect = StateEffect.define<{ 
    triggerFrom: number, 
    triggerTo: number, 
    queryFrom: number, // Start of the processed query text for styling
    queryTo: number,   // End of the processed query text for styling
    replaceLeadingSpace: boolean 
}>();
export const clearTriggerDecorationsEffect = StateEffect.define<null>();

// The actual decorations to apply
const triggerPhraseDecoration = Decoration.mark({ class: "chrono-active-trigger" }); // Will have margin-right via CSS
const queryTextDecoration = Decoration.mark({ class: "chrono-active-query" }); 
const zeroWidthWidget = Decoration.replace({}); // Widget to visually collapse a character

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
                const { triggerFrom, triggerTo, queryFrom, queryTo, replaceLeadingSpace } = effect.value;
                const newDecorations = [
                    triggerPhraseDecoration.range(triggerFrom, triggerTo)
                ];

                // If user typed a space immediately after the trigger, collapse it.
                // The visual gap when no space is typed will come from margin-right on triggerPhraseDecoration.
                if (replaceLeadingSpace) {
                    if (queryFrom > triggerTo) { // Ensure there's a character (the typed space) to collapse
                        newDecorations.push(zeroWidthWidget.range(triggerTo, queryFrom));
                    }
                }
                
                // Add query decoration only if there is text for the processed query
                if (queryTo > queryFrom) { 
                    newDecorations.push(queryTextDecoration.range(queryFrom, queryTo));
                }
                decorations = Decoration.set(newDecorations);
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
