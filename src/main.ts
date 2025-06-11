import { Plugin, Editor, MarkdownView } from 'obsidian';
import { QuickDatesSettings, QuickDatesSettingTab, DEFAULT_SETTINGS } from '@/settings';
import { EditorSuggester, OpenDailyNoteModal, DateCommands } from '@/features';
import { triggerDecorationStateField } from '@/features/editor-suggester/decorations';
import { initLogger, loggerDebug, loggerInfo, loggerWarn, loggerError, registerLoggerClass, initializeDebugSystem } from '@/utils';
import { DailyNotesService } from '@/services';

export default class QuickDates extends Plugin {
	name = 'QuickDates';
	settings: QuickDatesSettings;
	editorSuggester: EditorSuggester;
	dateCommands: DateCommands;
	dailyNotesService: DailyNotesService;

	constructor(app: any, manifest: any) {
		super(app, manifest);
		initLogger(this);
		registerLoggerClass(this, 'QuickDates');
		
		// Initialize daily notes service
		loggerDebug(this, 'Initializing daily notes service');
		this.dailyNotesService = new DailyNotesService(this.app);
	}
	async onload() {
		loggerInfo(this, 'Quick Dates plugin starting initialization', { version: this.manifest.version });
		
		try {
			loggerDebug(this, 'Loading plugin settings from vault storage');
			await this.loadSettings();

			loggerDebug(this, 'Creating and registering editor suggester component');
			this.editorSuggester = new EditorSuggester(this, this.dailyNotesService);
			this.registerEditorSuggest(this.editorSuggester);

			loggerDebug(this, 'Registering CodeMirror extension for trigger decorations');
			this.registerEditorExtension(triggerDecorationStateField);

			loggerDebug(this, 'Initializing date commands component');
			this.dateCommands = new DateCommands(this.app, this.settings, this.dailyNotesService);

			loggerDebug(this, 'Registering command palette entries for date operations');
			this.registerDateCommands();

			loggerDebug(this, 'Adding settings tab to Obsidian preferences');
			this.addSettingTab(new QuickDatesSettingTab(this.app, this));

			loggerInfo(this, 'Quick Dates plugin successfully loaded and ready', { 
				settingsLoaded: !!this.settings,
				componentsInitialized: !!(this.editorSuggester && this.dateCommands),
				triggerPhrase: this.settings.triggerPhrase
			});
		} catch (initError) {
			loggerError(this, 'Failed to initialize Quick Dates plugin', { 
				error: initError instanceof Error ? initError.message : String(initError),
				stack: initError instanceof Error ? initError.stack : undefined
			});
			throw initError;
		}

		this.app.workspace.onLayoutReady(() => {
			initializeDebugSystem();
		});
	}
	async onunload() {
		loggerInfo(this, 'Quick Dates plugin shutting down');
		
		try {
			loggerInfo(this, 'Quick Dates plugin successfully unloaded');
		} catch (unloadError) {
			loggerError(this, 'Error during plugin unload', {
				error: unloadError instanceof Error ? unloadError.message : String(unloadError)
			});
		}
	}
	private registerDateCommands(): void {
		loggerDebug(this, 'Registering date parsing command: convert selected text to date link');
		this.addCommand({
			id: 'parse-date-as-link',
			name: 'Convert selected text to date link',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				loggerDebug(this, 'User executed convert-to-link command');
				return this.dateCommands.parseDateAsLink(editor, view);
			}
		});

		loggerDebug(this, 'Registering date parsing command: convert selected text to plain text date');
		this.addCommand({
			id: 'parse-date-as-text',
			name: 'Convert selected text to plain-text date',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				loggerDebug(this, 'User executed convert-to-text command');
				return this.dateCommands.parseDateAsText(editor, view);
			}
		});

		loggerDebug(this, 'Registering bulk date parsing command: convert all dates to links');
		this.addCommand({
			id: 'parse-all-dates-as-links',
			name: 'Convert all dates in note to date links',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				loggerDebug(this, 'User executed convert-all-to-links command');
				await this.dateCommands.parseAllDatesAsLinks(editor, view);
			}
		});

		loggerDebug(this, 'Registering bulk date parsing command: convert all dates to plain text');
		this.addCommand({
			id: 'parse-all-dates-as-text',
			name: 'Convert all dates in note to plain-text dates',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				loggerDebug(this, 'User executed convert-all-to-text command');
				await this.dateCommands.parseAllDatesAsText(editor, view);
			}
		});

		loggerDebug(this, 'Registering alias-preserving date command: convert with original text as alias');
		this.addCommand({
			id: 'parse-date-as-link-keep-alias',
			name: 'Convert selected text to date link (keep original text as alias)',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				loggerDebug(this, 'User executed convert-to-link-keep-alias command');
				return this.dateCommands.parseDateAsLinkKeepOriginalTextAlias(editor, view);
			}
		});

		loggerDebug(this, 'Registering bulk alias-preserving date command: convert all with aliases');
		this.addCommand({
			id: 'parse-all-dates-as-links-keep-alias',
			name: 'Convert all dates in note to date links (keep original text as alias)',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				loggerDebug(this, 'User executed convert-all-to-links-keep-alias command');
				await this.dateCommands.parseAllDatesAsLinksKeepOriginalTextAlias(editor, view);
			}
		});		loggerDebug(this, 'Registering daily note command: open daily note modal');
		this.addCommand({
			id: 'open-daily-note',
			name: 'Open daily note',
			callback: () => {
				loggerDebug(this, 'User executed open-daily-note command');
				return new OpenDailyNoteModal(this.app, this, this.dailyNotesService).open();
			}
		});

		loggerDebug(this, 'All command palette entries registered successfully');
	}
		async onSettingsChanged(newSettings?: QuickDatesSettings) {
		loggerDebug(this, 'Processing settings change - reinitializing components with new configuration');
		
		try {
			// Use provided settings or current settings
			const settings = newSettings || this.settings;
			
			loggerDebug(this, 'Applying updated settings to editor suggester component');
			if (this.editorSuggester) {
				this.editorSuggester.updateSettings({ 
					plainTextByDefault: settings.plainTextByDefault,
					holidayLocale: settings.holidayLocale,
					swapOpenNoteKeybinds: settings.swapOpenNoteKeybinds
				});
			}

			loggerDebug(this, 'Updating date commands with new settings configuration');
			if (this.dateCommands) {
				this.dateCommands.updateSettings(settings);
			}
			
			loggerInfo(this, 'Settings change successfully applied to all components', {
				plainTextByDefault: settings.plainTextByDefault,
				triggerPhrase: settings.triggerPhrase,
				holidayLocale: settings.holidayLocale
			});
		} catch (settingsError) {
			loggerError(this, 'Failed to apply settings changes', { 
				error: settingsError instanceof Error ? settingsError.message : String(settingsError),
				stack: settingsError instanceof Error ? settingsError.stack : undefined
			});
		}
	}
	
	async loadSettings() {
		loggerDebug(this, 'Loading plugin settings from vault storage');
		
		try {
			const savedData = await this.loadData() as Partial<QuickDatesSettings>;
			this.settings = Object.assign({}, DEFAULT_SETTINGS, savedData) as QuickDatesSettings;
			
			loggerInfo(this, 'Plugin settings loaded successfully', { 
				settingsKeys: Object.keys(this.settings).length,
				triggerPhrase: this.settings.triggerPhrase,
				primaryFormat: this.settings.primaryFormat || 'using daily note format',
				plainTextByDefault: this.settings.plainTextByDefault
			});
		} catch (loadError) {
			loggerError(this, 'Failed to load plugin settings from storage', { 
				error: loadError instanceof Error ? loadError.message : String(loadError),
				fallbackAction: 'using default settings'
			});
			this.settings = DEFAULT_SETTINGS;
			loggerWarn(this, 'Using default settings due to load failure - user configuration reset');
		}
	}
		async saveSettings() {
		loggerDebug(this, 'Persisting plugin settings to vault storage');
		
		try {
			await this.saveData(this.settings);
			
			loggerInfo(this, 'Plugin settings successfully saved to vault storage', { 
				settingsKeys: Object.keys(this.settings),
				triggerPhrase: this.settings.triggerPhrase,
				plainTextByDefault: this.settings.plainTextByDefault
			});
		} catch (saveError) {
			loggerError(this, 'Failed to save plugin settings to vault storage', { 
				error: saveError instanceof Error ? saveError.message : String(saveError),
				settings: this.settings,
				retryAction: 'user should try changing settings again'
			});
			throw saveError;
		}
	}
	
	updateKeyBindings(): void {
		loggerDebug(this, 'Updating key bindings configuration for editor suggester');
		this.editorSuggester?.updateSettings({ 
			plainTextByDefault: this.settings.plainTextByDefault,
			holidayLocale: this.settings.holidayLocale,
			swapOpenNoteKeybinds: this.settings.swapOpenNoteKeybinds
		});
		loggerInfo(this, 'Key bindings successfully updated with current settings', {
			swapOpenNoteKeybinds: this.settings.swapOpenNoteKeybinds,
			plainTextByDefault: this.settings.plainTextByDefault
		});
	}
}

