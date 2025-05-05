import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, ChronoLanguageSettings, ChronoLanguageSettingTab } from './settings';
import { EditorSuggester } from './features/editor-suggester';
import { OpenDailyNoteModal } from './features/open-daily-note';

export default class ChronoLanguage extends Plugin {
	settings: ChronoLanguageSettings = DEFAULT_SETTINGS;
	editorSuggester: EditorSuggester;
	contextSuggestion: string | null = null;

	async onload() {
		// Load settings
		await this.loadSettings();

		// Add settings tab
		this.addSettingTab(new ChronoLanguageSettingTab(this.app, this));

		// Register suggester
		this.editorSuggester = new EditorSuggester(this);
		this.registerEditorSuggest(this.editorSuggester);

		// Add command to open daily note modal
		this.addCommand({
			id: 'open-daily-note-modal',
			name: 'Open daily note',
			callback: () => {
				new OpenDailyNoteModal(this.app, this).open();
			}
		});
	}
	
	async onunload() {
		this.editorSuggester.unload();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		
		// Update UI elements that depend on settings
		if (this.editorSuggester) {
			this.editorSuggester.updateInstructions();
		}
	}
}
