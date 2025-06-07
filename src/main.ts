import { Plugin, Editor, MarkdownView } from 'obsidian';
import { QuickDatesSettings, QuickDatesSettingTab, DEFAULT_SETTINGS } from './settings';
import { EditorSuggester } from './features/editor-suggester';
import { OpenDailyNoteModal } from './features/open-daily-note';
import { triggerDecorationStateField } from './features/editor-suggester/decorations';
import { DateCommands } from './features/commands';
import { initLogger, debug, info, warn, error, registerLoggerClass } from './utils/obsidian-logger';

export default class QuickDates extends Plugin {
	settings: QuickDatesSettings;
	editorSuggester: EditorSuggester;
	dateCommands: DateCommands;
	
	constructor(app: any, manifest: any) {
		super(app, manifest);
		// Initialize the logger system
		initLogger(this);
		registerLoggerClass(this, 'QuickDates');
	}
		async onload() {
		debug(this, 'onload', 'Plugin loading...');
		await this.loadSettings();
		debug(this, 'onload', 'Settings loaded');
		// Initialize editor suggester
		this.editorSuggester = new EditorSuggester(this);
		this.registerEditorSuggest(this.editorSuggester);
		debug(this, 'onload', 'Editor suggester initialized');

		// Register the StateField for decorations
		this.registerEditorExtension(triggerDecorationStateField);

		// Initialize date commands
		this.dateCommands = new DateCommands(this.app, this.settings);
		debug(this, 'onload', 'Date commands initialized');
		// Register date-related commands
		debug(this, 'onload', 'Registering date-related commands...');
		this.addCommand({
			id: 'parse-date-as-link',
			name: 'Convert selected text to date link',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				debug(this, 'parse-date-as-link', 'Command executed');
				return this.dateCommands.parseDateAsLink(editor, view);
			}
		});

		this.addCommand({
			id: 'parse-date-as-text',
			name: 'Convert selected text to plain-text date',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				debug(this, 'parse-date-as-text', 'Command executed');
				return this.dateCommands.parseDateAsText(editor, view);
			}
		});
		this.addCommand({
			id: 'parse-all-dates-as-links',
			name: 'Convert all dates in note to date links',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				debug(this, 'parse-all-dates-as-links', 'Command executed');
				await this.dateCommands.parseAllDatesAsLinks(editor, view);
			}
		});

		this.addCommand({
			id: 'parse-all-dates-as-text',
			name: 'Convert all dates in note to plain-text dates',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				debug(this, 'parse-all-dates-as-text', 'Command executed');
				await this.dateCommands.parseAllDatesAsText(editor, view);
			}
		});

		this.addCommand({
			id: 'parse-date-as-link-keep-alias',
			name: 'Convert selected text to date link (keep original text as alias)',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				debug(this, 'parse-date-as-link-keep-alias', 'Command executed');
				return this.dateCommands.parseDateAsLinkKeepOriginalTextAlias(editor, view);
			}
		});
		this.addCommand({
			id: 'parse-all-dates-as-links-keep-alias',
			name: 'Convert all dates in note to date links (keep original text as alias)',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				debug(this, 'parse-all-dates-as-links-keep-alias', 'Command executed');
				await this.dateCommands.parseAllDatesAsLinksKeepOriginalTextAlias(editor, view);
			}
		});

		this.addCommand({
			id: 'open-daily-note',
			name: 'Open daily note',
			callback: () => {
				debug(this, 'open-daily-note', 'Command executed');
				return new OpenDailyNoteModal(this.app, this).open();
			}
		});
		debug(this, 'onload', 'All commands registered successfully');
		this.addSettingTab(new QuickDatesSettingTab(this.app, this));
		info(this, 'onload', 'Quick Dates plugin loaded successfully');
	}	async onSettingsChanged() {
		debug(this, 'onSettingsChanged', 'Settings changed, reinitializing editor suggester');
		try {
			if (this.editorSuggester) this.editorSuggester.unload();
			this.editorSuggester = new EditorSuggester(this);
			this.registerEditorSuggest(this.editorSuggester);
			this.editorSuggester.updateSettings({ 
				plainTextByDefault: this.settings.plainTextByDefault,
				holidayLocale: this.settings.holidayLocale,
				swapOpenNoteKeybinds: this.settings.swapOpenNoteKeybinds
			});			debug(this, 'onSettingsChanged', 'Editor suggester settings updated');
			
			// Update settings in date commands
			if (this.dateCommands) {
				this.dateCommands.updateSettings(this.settings);
				debug(this, 'onSettingsChanged', 'Date commands settings updated');
			}
			info(this, 'onSettingsChanged', 'Settings changed successfully applied');
		} catch (error) {
			error(this, 'onSettingsChanged', { error });
		}
	}	async loadSettings() {
		debug(this, 'loadSettings', 'Loading settings...');
		try {
			const loaded = (await this.loadData()) as Partial<QuickDatesSettings>;
			this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded) as QuickDatesSettings;
			debug(this, 'loadSettings', 'Settings loaded successfully');
		} catch (error) {
			error(this, 'loadSettings', { error });
			this.settings = DEFAULT_SETTINGS;			warn(this, 'loadSettings', 'Using default settings due to load failure');
		}
	}
	
	async saveSettings() {
		debug(this, 'saveSettings', 'Saving settings...');
		try {
			await this.saveData(this.settings);
			debug(this, 'saveSettings', 'Settings saved successfully');
			
			// Apply updated settings immediately
			this.editorSuggester?.updateSettings({ 
				plainTextByDefault: this.settings.plainTextByDefault,
				holidayLocale: this.settings.holidayLocale,
				swapOpenNoteKeybinds: this.settings.swapOpenNoteKeybinds
			});
			debug(this, 'saveSettings', 'Editor suggester settings updated after save');
			
			// Update commands if needed
			this.dateCommands?.updateSettings(this.settings);
			debug(this, 'saveSettings', 'Date commands settings updated after save');
		} catch (error) {
			error(this, 'saveSettings', { error });
		}
	}

	updateKeyBindings(): void {
		debug(this, 'updateKeyBindings', 'Updating key bindings...');
		this.editorSuggester?.updateSettings({ 
			plainTextByDefault: this.settings.plainTextByDefault,
			holidayLocale: this.settings.holidayLocale,
			swapOpenNoteKeybinds: this.settings.swapOpenNoteKeybinds
		});
		debug(this, 'updateKeyBindings', 'Key bindings updated');
	}
}

