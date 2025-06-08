import { Plugin, Editor, MarkdownView } from 'obsidian';
import { QuickDatesSettings, QuickDatesSettingTab, DEFAULT_SETTINGS } from '@/settings';
import { EditorSuggester, OpenDailyNoteModal, DateCommands } from '@/features';
import { triggerDecorationStateField } from '@/features/editor-suggester/decorations';
import { initLogger, debug, info, warn, error, registerLoggerClass } from '@/utils';
import { ServiceContainer, ConfigurationService, EventBus, ResourceManager, ErrorHandler } from '@/services';
import type { ServiceInterface } from '@/services';

export default class QuickDates extends Plugin implements ServiceInterface {
	name = 'QuickDates';
	settings: QuickDatesSettings;
	editorSuggester: EditorSuggester;
	dateCommands: DateCommands;
		// Service layer components
	private serviceContainer: ServiceContainer;
	private configService: ConfigurationService;
	private eventBus: EventBus;
	private resourceManager: ResourceManager;
	private errorHandler: ErrorHandler;
		constructor(app: any, manifest: any) {
		super(app, manifest);
		debug(this, 'Initializing logger system for Quick Dates plugin');
		initLogger(this);
		registerLoggerClass(this, 'QuickDates');
		
		// Initialize service layer
		debug(this, 'Initializing service layer and dependency injection container');
		this.initializeServices();
	}	/**
	 * Initialize the service layer and dependency injection container
	 */
	private initializeServices(): void {
		this.eventBus = new EventBus();
		this.resourceManager = new ResourceManager();
		this.errorHandler = new ErrorHandler(this.eventBus);
		this.configService = new ConfigurationService(DEFAULT_SETTINGS, this, this.eventBus);
		
		this.serviceContainer = new ServiceContainer(this, DEFAULT_SETTINGS);
		this.serviceContainer.register('eventBus', this.eventBus);
		this.serviceContainer.register('resourceManager', this.resourceManager);
		this.serviceContainer.register('configService', this.configService);
		this.serviceContainer.register('errorHandler', this.errorHandler);
		this.serviceContainer.register('plugin', this);
		
		debug(this, 'Service layer initialized successfully', {
			registeredServices: ['eventBus', 'resourceManager', 'configService', 'errorHandler', 'plugin']
		});
	}

	/**
	 * Service interface implementation
	 */
	async initialize(): Promise<void> {
		debug(this, 'Initializing QuickDates service');
		// Service initialization is handled in onload()
	}
	async cleanup(): Promise<void> {
		debug(this, 'Cleaning up QuickDates service');
		await this.resourceManager.dispose();
	}

	async dispose(): Promise<void> {
		debug(this, 'Disposing QuickDates service');
		await this.cleanup();
	}
	async onload() {
		info(this, 'Quick Dates plugin starting initialization', { version: this.manifest.version });
		
		try {
			debug(this, 'Loading plugin settings from vault storage');
			await this.loadSettings();
					// Update configuration service with loaded settings
			this.configService.setSettings(this.settings);			debug(this, 'Creating and registering editor suggester component');
			this.editorSuggester = new EditorSuggester(this, this.serviceContainer);
			this.registerEditorSuggest(this.editorSuggester);

			debug(this, 'Registering CodeMirror extension for trigger decorations');
			this.registerEditorExtension(triggerDecorationStateField);

			debug(this, 'Initializing date commands component');
			this.dateCommands = new DateCommands(this.app, this.settings, this.serviceContainer);

			debug(this, 'Registering all logger classes for enhanced debugging');
			registerLoggerClass(this.editorSuggester, 'EditorSuggester');
			registerLoggerClass(this.dateCommands, 'DateCommands');

			debug(this, 'Registering command palette entries for date operations');
			this.registerDateCommands();

			debug(this, 'Adding settings tab to Obsidian preferences');
			this.addSettingTab(new QuickDatesSettingTab(this.app, this));			// Set up event listeners for configuration changes
			this.eventBus.on('settings:changed', this.onSettingsChanged.bind(this));

			info(this, 'Quick Dates plugin successfully loaded and ready', { 
				settingsLoaded: !!this.settings,
				componentsInitialized: !!(this.editorSuggester && this.dateCommands),
				triggerPhrase: this.settings.triggerPhrase,
				servicesInitialized: true
			});		} catch (initError) {
			error(this, 'Failed to initialize Quick Dates plugin', { 
				error: initError instanceof Error ? initError.message : String(initError),
				stack: initError instanceof Error ? initError.stack : undefined
			});
			throw initError;
		}
	}

	async onunload() {
		info(this, 'Quick Dates plugin shutting down');
		
		try {
			debug(this, 'Cleaning up service layer and components');
			await this.cleanup();
			
			info(this, 'Quick Dates plugin successfully unloaded');
		} catch (unloadError) {
			error(this, 'Error during plugin unload', {
				error: unloadError instanceof Error ? unloadError.message : String(unloadError)
			});
		}
	}
	private registerDateCommands(): void {
		debug(this, 'Registering date parsing command: convert selected text to date link');
		this.addCommand({
			id: 'parse-date-as-link',
			name: 'Convert selected text to date link',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				debug(this, 'User executed convert-to-link command');
				return this.dateCommands.parseDateAsLink(editor, view);
			}
		});

		debug(this, 'Registering date parsing command: convert selected text to plain text date');
		this.addCommand({
			id: 'parse-date-as-text',
			name: 'Convert selected text to plain-text date',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				debug(this, 'User executed convert-to-text command');
				return this.dateCommands.parseDateAsText(editor, view);
			}
		});

		debug(this, 'Registering bulk date parsing command: convert all dates to links');
		this.addCommand({
			id: 'parse-all-dates-as-links',
			name: 'Convert all dates in note to date links',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				debug(this, 'User executed convert-all-to-links command');
				await this.dateCommands.parseAllDatesAsLinks(editor, view);
			}
		});

		debug(this, 'Registering bulk date parsing command: convert all dates to plain text');
		this.addCommand({
			id: 'parse-all-dates-as-text',
			name: 'Convert all dates in note to plain-text dates',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				debug(this, 'User executed convert-all-to-text command');
				await this.dateCommands.parseAllDatesAsText(editor, view);
			}
		});

		debug(this, 'Registering alias-preserving date command: convert with original text as alias');
		this.addCommand({
			id: 'parse-date-as-link-keep-alias',
			name: 'Convert selected text to date link (keep original text as alias)',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				debug(this, 'User executed convert-to-link-keep-alias command');
				return this.dateCommands.parseDateAsLinkKeepOriginalTextAlias(editor, view);
			}
		});

		debug(this, 'Registering bulk alias-preserving date command: convert all with aliases');
		this.addCommand({
			id: 'parse-all-dates-as-links-keep-alias',
			name: 'Convert all dates in note to date links (keep original text as alias)',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				debug(this, 'User executed convert-all-to-links-keep-alias command');
				await this.dateCommands.parseAllDatesAsLinksKeepOriginalTextAlias(editor, view);
			}
		});
		debug(this, 'Registering daily note command: open daily note modal');
		this.addCommand({
			id: 'open-daily-note',
			name: 'Open daily note',
			callback: () => {
				debug(this, 'User executed open-daily-note command');
				return new OpenDailyNoteModal(this.app, this, this.serviceContainer).open();
			}
		});

		debug(this, 'All command palette entries registered successfully');
	}	async onSettingsChanged(newSettings?: QuickDatesSettings) {
		debug(this, 'Processing settings change - reinitializing components with new configuration');
		
		try {
			// Use provided settings or current settings
			const settings = newSettings || this.settings;
			
			debug(this, 'Cleaning up existing editor suggester instance');
			if (this.editorSuggester) this.editorSuggester.unload();
					debug(this, 'Creating new editor suggester with updated settings');
			this.editorSuggester = new EditorSuggester(this, this.serviceContainer);
			this.registerEditorSuggest(this.editorSuggester);
			registerLoggerClass(this.editorSuggester, 'EditorSuggester');
			
			debug(this, 'Applying updated settings to editor suggester component');
			this.editorSuggester.updateSettings({ 
				plainTextByDefault: settings.plainTextByDefault,
				holidayLocale: settings.holidayLocale,
				swapOpenNoteKeybinds: settings.swapOpenNoteKeybinds
			});

			debug(this, 'Updating date commands with new settings configuration');
			if (this.dateCommands) {
				this.dateCommands.updateSettings(settings);
			}
			
			info(this, 'Settings change successfully applied to all components', {
				plainTextByDefault: settings.plainTextByDefault,
				triggerPhrase: settings.triggerPhrase,
				holidayLocale: settings.holidayLocale
			});
		} catch (settingsError) {
			error(this, 'Failed to apply settings changes', { 
				error: settingsError instanceof Error ? settingsError.message : String(settingsError),
				stack: settingsError instanceof Error ? settingsError.stack : undefined
			});
		}
	}async loadSettings() {
		debug(this, 'Loading plugin settings from vault storage');
		
		try {
			const savedData = await this.loadData() as Partial<QuickDatesSettings>;
			this.settings = Object.assign({}, DEFAULT_SETTINGS, savedData) as QuickDatesSettings;
			
			info(this, 'Plugin settings loaded successfully', { 
				settingsKeys: Object.keys(this.settings).length,
				triggerPhrase: this.settings.triggerPhrase,
				primaryFormat: this.settings.primaryFormat || 'using daily note format',
				plainTextByDefault: this.settings.plainTextByDefault
			});
		} catch (loadError) {
			error(this, 'Failed to load plugin settings from storage', { 
				error: loadError instanceof Error ? loadError.message : String(loadError),
				fallbackAction: 'using default settings'
			});
			this.settings = DEFAULT_SETTINGS;
			warn(this, 'Using default settings due to load failure - user configuration reset');
		}
	}	async saveSettings() {
		debug(this, 'Persisting plugin settings to vault storage');
		
		try {
			await this.saveData(this.settings);
					// Update configuration service
			this.configService.setSettings(this.settings);
			
			// Emit settings changed event
			this.eventBus.emit('settings:changed', this.settings);
			
			info(this, 'Plugin settings successfully saved to vault storage', { 
				settingsKeys: Object.keys(this.settings),
				triggerPhrase: this.settings.triggerPhrase,
				plainTextByDefault: this.settings.plainTextByDefault
			});
		} catch (saveError) {
			error(this, 'Failed to save plugin settings to vault storage', { 
				error: saveError instanceof Error ? saveError.message : String(saveError),
				settings: this.settings,
				retryAction: 'user should try changing settings again'
			});
			throw saveError;
		}
	}
	updateKeyBindings(): void {
		debug(this, 'Updating key bindings configuration for editor suggester');
		this.editorSuggester?.updateSettings({ 
			plainTextByDefault: this.settings.plainTextByDefault,
			holidayLocale: this.settings.holidayLocale,
			swapOpenNoteKeybinds: this.settings.swapOpenNoteKeybinds
		});
		info(this, 'Key bindings successfully updated with current settings', {
			swapOpenNoteKeybinds: this.settings.swapOpenNoteKeybinds,
			plainTextByDefault: this.settings.plainTextByDefault
		});
	}
}

