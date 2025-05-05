import { Plugin } from 'obsidian';
import { ChronoLanguageSettings, ChronoLanguageSettingTab, DEFAULT_SETTINGS } from './settings';
import { EditorSuggester } from './features/editor-suggester';
import { OpenDailyNoteModal } from './features/open-daily-note';
import { MODIFIER_BEHAVIOR } from './plugin-data/constants';

export default class ChronoLanguage extends Plugin {
	settings: ChronoLanguageSettings;
	editorSuggester: EditorSuggester;

	async onload() {
		await this.loadSettings();

		// Register Editor Suggester
		this.editorSuggester = new EditorSuggester(this);
		this.registerEditorSuggest(this.editorSuggester);

		// Add command for opening daily notes
		this.addCommand({
			id: 'open-daily-note',
			name: 'Open daily note',
			callback: () => {
				new OpenDailyNoteModal(this.app, this).open();
			}
		});

		// Add settings tab
		this.addSettingTab(new ChronoLanguageSettingTab(this.app, this));
	}
	
	async onSettingsChanged() {
		// Unload and re-register the editor suggester with new settings
		if (this.editorSuggester) {
			this.editorSuggester.unload();
		}
		this.editorSuggester = new EditorSuggester(this);
		this.registerEditorSuggest(this.editorSuggester);
		this.editorSuggester.updateRendererSettingsAndRerender();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		if (this.editorSuggester) {
			this.editorSuggester.updateInstructions();
		}
	}
}
