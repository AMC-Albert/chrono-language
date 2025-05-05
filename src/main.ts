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

		// Apply settings to modifier behavior configuration
		this.updateModifierBehaviors();
		
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

	/**
	 * Update modifier behaviors based on user settings
	 */
	updateModifierBehaviors() {
		// Apply user settings to the modifier behavior configuration
		// This allows users to customize which keys perform which actions
		MODIFIER_BEHAVIOR.INSERT_MODE_TOGGLE = this.settings.insertModeToggleKey;
		MODIFIER_BEHAVIOR.CONTENT_SUGGESTION_TOGGLE = this.settings.contentSuggestionToggleKey;
		MODIFIER_BEHAVIOR.CONTENT_FORMAT_TOGGLE = this.settings.contentFormatToggleKey;
		MODIFIER_BEHAVIOR.DAILY_NOTE_TOGGLE = this.settings.dailyNoteToggleCombo;
	}

	/**
	 * Update suggester instructions when settings change
	 */
	updateSuggesterInstructions() {
		if (this.editorSuggester) {
			this.editorSuggester.updateInstructions();
		}
	}
	
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.updateModifierBehaviors();
		this.updateSuggesterInstructions();
	}
}
