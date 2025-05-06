import { Plugin } from 'obsidian';
import { ChronoLanguageSettings, ChronoLanguageSettingTab, DEFAULT_SETTINGS } from './settings';
import { EditorSuggester } from './features/editor-suggester';
import { OpenDailyNoteModal } from './features/open-daily-note';
import { MODIFIER_BEHAVIOR } from './definitions/constants';
import { SuggestionProvider } from './features/suggestion-provider';

export default class ChronoLanguage extends Plugin {
	settings: ChronoLanguageSettings;
	editorSuggester: EditorSuggester;
	suggestionProvider: SuggestionProvider;

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
		
		// Use the new updateSettings method instead of updateRendererSettingsAndRerender
		this.editorSuggester.updateSettings({
			plainTextByDefault: this.settings.plainTextByDefault
		});
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

	/**
	 * Update key bindings in all components that use keyboard handlers
	 */
	updateKeyBindings(): void {
		// Update the editor suggester keyboard bindings using the new updateSettings method
		if (this.editorSuggester) {
			this.editorSuggester.updateSettings({
				plainTextByDefault: this.settings.plainTextByDefault
			});
		}
		
		// Update the suggestion provider keyboard bindings
		if (this.suggestionProvider) {
			this.suggestionProvider.updateSettings({
				plainTextByDefault: this.settings.plainTextByDefault
			});
		}
	}
}
