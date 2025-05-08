import { Plugin } from 'obsidian';
import { ChronoLanguageSettings, ChronoLanguageSettingTab, DEFAULT_SETTINGS } from './settings';
import { EditorSuggester } from './features/editor-suggester';
import { OpenDailyNoteModal } from './features/open-daily-note';
import { triggerDecorationStateField } from './features/editor-suggester/decorations';

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
