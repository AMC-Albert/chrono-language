import { PluginSettingTab, Setting } from 'obsidian';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { MultipleTextComponent } from 'obsidian-dev-utils/obsidian/Components/SettingComponents/MultipleTextComponent';
import { debug, info, warn, error, registerLoggerClass } from '@/utils';
import QuickDates from '../main';

export interface QuickDatesSettings {
	primaryFormat: string;
	alternateFormat: string;
	holidayLocale: string;
	includeFolderInLinks: boolean;
	HideFolders: boolean;
	triggerPhrase: string;
	triggerHappy: boolean;
	plainTextByDefault: boolean;
	swapOpenNoteKeybinds: boolean;
	cleanupTriggerOnClose: boolean;
	initialEditorSuggestions: string[];
	timeFormat: string;
	timeSeparator: string;
	timeOnly: boolean;
	initialOpenDailyNoteSuggestions: string[];
}

export const DEFAULT_SETTINGS: QuickDatesSettings = {
	primaryFormat: '',
	alternateFormat: 'dddd, MMMM Do YYYY',
	holidayLocale: 'US',
	includeFolderInLinks: true,
	HideFolders: true,
	triggerPhrase: 'qd',
	triggerHappy: false,
	plainTextByDefault: false,
	swapOpenNoteKeybinds: false,
	cleanupTriggerOnClose: true,
	initialEditorSuggestions: ['Today', 'Tomorrow', 'Yesterday'],
	timeFormat: '',
	timeSeparator: ' ',
	timeOnly: false,
	initialOpenDailyNoteSuggestions: ['Today', 'Tomorrow', 'Yesterday'],
};

export class QuickDatesSettingTab extends PluginSettingTab {
	plugin: QuickDates;
	hideFoldersSetting: HTMLElement;

	constructor(app: any, plugin: QuickDates) {
		super(app, plugin);
		this.plugin = plugin;
		registerLoggerClass(this, 'QuickDatesSettingTab');
		debug(this, 'Settings tab initialized and ready for user configuration');
	}

	display(): void {
		debug(this, 'Rendering settings tab UI - building user interface elements');
		const { containerEl } = this;

		debug(this, 'Clearing existing settings container content');
		containerEl.empty();
		// TODO: Review UI text and heading guidelines for this section
		debug(this, 'Creating primary date format setting control');
		new Setting(containerEl)
			.setName("Primary date format")
			.setDesc((() => {
				const fragment = document.createDocumentFragment();
				fragment.createSpan({
					text: "Specify your primary human-readable date format. Refer to "
				});
				fragment.createEl("a", {
					text: "format reference",
					href: "https://momentjs.com/docs/#/displaying/format/",
					attr: { target: "_blank", rel: "noopener" }
				});
				fragment.createSpan({
					text: ". It will be used for link aliases and plain text dates. \
					It does not need to match your daily note format."
				});
				return fragment;
			})())
			.addText((text) =>
				text
					.setPlaceholder(getDailyNoteSettings().format || "YYYY-MM-DD")
					.setValue(this.plugin.settings.primaryFormat)
					.onChange(async (value) => {
						debug(this, 'User modified primary date format setting', { 
							oldValue: this.plugin.settings.primaryFormat,
							newValue: value || 'using daily note format'
						});
						this.plugin.settings.primaryFormat = value || "";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Alternate date format")
			.setDesc((() => {
				const fragment = document.createDocumentFragment();
				fragment.createSpan({
					text: "Specify your alternate human-readable date format. It will be used for link aliases and plain text dates (when the "
				});
				const boldAlt = fragment.createEl("b");
				boldAlt.textContent = "alt";
				fragment.createSpan({ text: " key is held while using the editor suggester). It does not need to match your daily note format." });
				return fragment;
			})())
			.addText((text) =>
				text
					.setPlaceholder("dddd, MMMM Do YYYY")
					.setValue(this.plugin.settings.alternateFormat)
					.onChange(async (value) => {
						this.plugin.settings.alternateFormat = value || "";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
		.setName("Holiday locale (IANA country code)")
		.setDesc((() => {
			const fragment = document.createDocumentFragment();
			fragment.createSpan({
				text: "Set your country/region code to show region-specific holidays (IANA format, e.g. 'US', 'GB', 'DE'). Set to empty to disable holiday suggestions."
			});
			fragment.createEl("br");
			fragment.createEl("a", {
				text: "Check if your region is supported here.",
				href: "https://github.com/commenthol/date-holidays?tab=readme-ov-file#supported-countries-states-regions",
				attr: { target: "_blank", rel: "noopener" }
			});
			return fragment;
		})())
		.addText((text) =>
			text
				.setPlaceholder("US")
				.setValue(this.plugin.settings.holidayLocale)
				.onChange(async (value) => {
					this.plugin.settings.holidayLocale = value.trim();
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl).setName('Link format').setHeading();

		new Setting(containerEl)
			.setName("Include folders in links")
			.setDesc("Include the daily note folder path in generated links. \
				This is preferable if you create files using unresolved links to daily notes and have a set folder for them.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeFolderInLinks)
					.onChange(async (value) => {
						this.plugin.settings.includeFolderInLinks = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Hide folders in links using aliases")
			.setDesc("If including folders in links, and no unique alias is being used, use an alias anyway (the note name) to hide the folder path.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.HideFolders)
					.onChange(async (value) => {
						this.plugin.settings.HideFolders = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName('Editor suggester').setHeading()
		debug(this, 'Creating trigger phrase setting control');
		new Setting(containerEl)
			.setName("Trigger phrase")
			.setDesc("Customize the trigger phrase to activate the editor suggester. If empty, the suggester will be disabled. Can be a word or single character.")
			.addText((text) =>
				text
					.setPlaceholder("qd")
					.setValue(this.plugin.settings.triggerPhrase)
					.onChange(async (value) => {
						debug(this, 'User modified trigger phrase setting', { 
							oldValue: this.plugin.settings.triggerPhrase,
							newValue: value,
							suggesterEnabled: !!value
						});
						
						if (!value.trim()) {
							warn(this, 'User disabled editor suggester by clearing trigger phrase', {
								previousTrigger: this.plugin.settings.triggerPhrase
							});
						}
						
						this.plugin.settings.triggerPhrase = value;
						await this.plugin.saveSettings();
						
						info(this, 'Trigger phrase setting updated successfully', {
							newTriggerPhrase: value || 'disabled',
							requiresReload: 'components will reinitialize automatically'
						});
					})
			);

		new Setting(containerEl)
			.setName("Trigger-happy suggester")
			.setDesc("By default (off), the editor suggester will only trigger when the trigger phrase is surrounded by whitespace characters. \
				When enabled, it will trigger unconditionally when the trigger phrase is typed.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.triggerHappy)
					.onChange(async (value) => {
						this.plugin.settings.triggerHappy = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Insert plain text by default")
			.setDesc((() => {
				const fragment = document.createDocumentFragment();
				fragment.createSpan({ text: "When enabled, insert suggestions as plain text by default, and use the " });
				const boldCtrl = fragment.createEl("b");
				boldCtrl.textContent = "ctrl";
				fragment.createSpan({ text: " key modifier to insert as a link." });
				return fragment;
			})())
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.plainTextByDefault)
					.onChange(async (value) => {
						this.plugin.settings.plainTextByDefault = value;
						await this.plugin.saveSettings();
						// Call updateKeyBindings to refresh UI immediately
						this.plugin.updateKeyBindings();
					})
			);

		new Setting(containerEl)
			.setName("Swap 'Open note' keybinds")
			.setDesc((() => {
				const fragment = document.createDocumentFragment();
				fragment.createSpan({ text: "Swap " });
				const boldShiftSpace = fragment.createEl("b");
				boldShiftSpace.textContent = "shift+space";
				fragment.createSpan({ text: " (default: Open suggested note) and " });
				const boldCtrlShiftSpace = fragment.createEl("b");
				boldCtrlShiftSpace.textContent = "ctrl+shift+space";
				fragment.createSpan({ text: " (default: Open suggested note in new tab)." });
				return fragment;
			})())
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.swapOpenNoteKeybinds)
					.onChange(async (value) => {
						this.plugin.settings.swapOpenNoteKeybinds = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Cleanup trigger phrase on dismiss")
			.setDesc("Automatically remove the trigger phrase if no suggestion is chosen. \
				If enabled, make sure you don't accidentally run into a natural occurrence of your trigger phrase in a note.")
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.cleanupTriggerOnClose)
					.onChange(async (value) => {
						this.plugin.settings.cleanupTriggerOnClose = value;
						await this.plugin.saveSettings();
					})
			);

		const initialEditorSuggestionsSettings = new Setting(containerEl)
			.setName("Initial suggestions")
			.setDesc("Enter initial suggestions for the editor suggester. Each suggestion should be on a new line.");
			// Initial suggestions text entry box
			const initialEditorSuggestionsBox = new MultipleTextComponent(initialEditorSuggestionsSettings.controlEl);
			initialEditorSuggestionsBox
				.setPlaceholder("Today\nTomorrow\nYesterday")
				.setValue(this.plugin.settings.initialEditorSuggestions)
				.onChange(async (value) => {
					// Ensure we always have at least the default suggestions if the array is empty
					const suggestions = value.filter(item => item.trim().length > 0); // Filter out empty strings
					this.plugin.settings.initialEditorSuggestions = suggestions.length > 0
						? [...suggestions]
						: DEFAULT_SETTINGS.initialEditorSuggestions;
					await this.plugin.saveSettings();
				});

		new Setting(containerEl).setName('Timestamps').setHeading().setDesc("When inserting a time/date with specified hours/minutes (e.g. 'in 3 hours'), or the special 'Now' phrase, you can append a timestamp automatically.")

		new Setting(containerEl)
		.setName("Time format")
		.setDesc("Specify the time format to use, or leave empty to disable this feature.")
		.addText((text) =>
			text
				.setPlaceholder("LT")
				.setValue(this.plugin.settings.timeFormat)
				.onChange(async (value) => {
					this.plugin.settings.timeFormat = value;
					await this.plugin.saveSettings();
				})
		);
		
		new Setting(containerEl)
			.setName("Separator character(s)")
			.setDesc("Characters to insert between date and time when appending timestamps. Set to empty for no separator. Default is space.")
			.addText((text) =>
				text
					.setPlaceholder(" ")
					.setValue(this.plugin.settings.timeSeparator)
					.onChange(async (value) => {
						this.plugin.settings.timeSeparator = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
		.setName("If inserting a time from today, insert timestamp only")
		.setDesc("Timestamps will be the ONLY thing inserted if selecting some time today.")
		.addToggle((toggle) =>
			toggle
				.setValue(this.plugin.settings.timeOnly)
				.onChange(async (value) => {
					this.plugin.settings.timeOnly = value;
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl).setName('Open daily note modal').setHeading();

		const initialOpenDailyNoteSuggestionsSettings = new Setting(containerEl)
			.setName("Initial suggestions")
			.setDesc("Enter initial suggestions for the 'Open daily note' modal. Each suggestion should be on a new line.");
		// Initial suggestions text entry box
		const initialOpenDailyNoteSuggestionsBox = new MultipleTextComponent(initialOpenDailyNoteSuggestionsSettings.controlEl);
		initialOpenDailyNoteSuggestionsBox
			.setPlaceholder("Today\nTomorrow\nYesterday")
			.setValue(this.plugin.settings.initialOpenDailyNoteSuggestions)			.onChange(async (value) => {
				debug(this, 'User modified open daily note suggestions', { 
					newSuggestionCount: value.filter(item => item.trim().length > 0).length
				});
				const suggestions = value.filter(item => item.trim().length > 0);
				this.plugin.settings.initialOpenDailyNoteSuggestions = suggestions.length > 0
					? [...suggestions]
					: DEFAULT_SETTINGS.initialOpenDailyNoteSuggestions;
				await this.plugin.saveSettings();
			});
			
		debug(this, 'Settings tab UI rendering completed - all controls configured and ready for user interaction');
	}
}