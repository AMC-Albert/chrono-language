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
			name: 'Convert selected text to date link',
			editorCallback: (editor: Editor, view: MarkdownView) => this.dateCommands.parseDateAsLink(editor, view)
		});

		this.addCommand({
			id: 'parse-date-as-text',
			name: 'Convert selected text to plain-text date',
			editorCallback: (editor: Editor, view: MarkdownView) => this.dateCommands.parseDateAsText(editor, view)
		});

		this.addCommand({
			id: 'parse-all-dates-as-links',
			name: 'Convert all dates in note to date links',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				await this.dateCommands.parseAllDatesAsLinks(editor, view);
			}
		});

		this.addCommand({
			id: 'parse-all-dates-as-text',
			name: 'Convert all dates in note to plain-text dates',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				await this.dateCommands.parseAllDatesAsText(editor, view);
			}
		});

		this.addCommand({
			id: 'parse-date-as-link-keep-alias',
			name: 'Convert selected text to date link (keep original text as alias)',
			editorCallback: (editor: Editor, view: MarkdownView) => this.dateCommands.parseDateAsLinkKeepOriginalTextAlias(editor, view)
		});

		this.addCommand({
			id: 'parse-all-dates-as-links-keep-alias',
			name: 'Convert all dates in note to date links (keep original text as alias)',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				await this.dateCommands.parseAllDatesAsLinksKeepOriginalTextAlias(editor, view);
			}
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
		const loaded = (await this.loadData()) as Partial<ChronoLanguageSettings>;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded) as ChronoLanguageSettings;
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
