import { Plugin } from 'obsidian';
import { ChronoLanguageSettings, ChronoLanguageSettingTab, DEFAULT_SETTINGS } from './settings';
import { EditorSuggester } from './suggest';

export default class ChronoLanguage extends Plugin {
	settings: ChronoLanguageSettings = DEFAULT_SETTINGS;
	contextSuggestion: string | null = null;

	async onload() {
		// Load settings
		await this.loadSettings();

		// Register suggester
		this.registerEditorSuggest(new EditorSuggester(this));

		// Add settings tab
		this.addSettingTab(new ChronoLanguageSettingTab(this.app, this));
	}
	
	onunload() {
		// Clear any remaining state
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
