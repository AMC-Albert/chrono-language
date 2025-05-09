import { Plugin, Editor, MarkdownView } from 'obsidian';
import { ChronoLanguageSettings, ChronoLanguageSettingTab, DEFAULT_SETTINGS } from './settings';
import { EditorSuggester } from './features/editor-suggester';
import { OpenDailyNoteModal } from './features/open-daily-note';
import { triggerDecorationStateField } from './features/editor-suggester/decorations';
import { DateCommands } from './features/commands';

export default class ChronoLanguage extends Plugin {
	settings: ChronoLanguageSettings;
	editorSuggester: EditorSuggester;
	dateCommands: DateCommands;

	async onload() {
		await this.loadSettings();
		
		// Initialize editor suggester
		this.editorSuggester = new EditorSuggester(this);
		this.registerEditorSuggest(this.editorSuggester);

		// Register the StateField for decorations
		this.registerEditorExtension(triggerDecorationStateField);
		
		// Initialize date commands
		this.dateCommands = new DateCommands(this.app, this.settings);
		
		// Register date-related commands
		this.addCommand({
			id: 'parse-date-as-link',
			name: 'Parse selected text as date link',
			editorCallback: (editor: Editor, view: MarkdownView) => this.dateCommands.parseDateAsLink(editor, view)
		});

		this.addCommand({
			id: 'parse-date-as-text',
			name: 'Parse selected text as plain date',
			editorCallback: (editor: Editor, view: MarkdownView) => this.dateCommands.parseDateAsText(editor, view)
		});

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
		
		// Update settings in date commands
		if (this.dateCommands) {
			this.dateCommands.updateSettings(this.settings);
		}
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
