import { App, PluginSettingTab, Setting } from 'obsidian';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { MultipleTextComponent } from 'obsidian-dev-utils/obsidian/Components/SettingComponents/MultipleTextComponent';
import ChronoLanguage from './main';

export interface ChronoLanguageSettings {
	primaryFormat: string;
	alternateFormat: string;
	includeFolderInLinks: boolean;
	HideFolders: boolean;
	triggerPhrase: string;
	triggerHappy: boolean;
	plainTextByDefault: boolean;
	initialEditorSuggestions: string[];
	initialOpenDailyNoteSuggestions: string[];
	holidayLocale: string;
	timeFormat: string;
	timeOnly: boolean;
}

export const DEFAULT_SETTINGS: ChronoLanguageSettings = {
	primaryFormat: '',
	alternateFormat: 'dddd, MMMM Do YYYY',
	includeFolderInLinks: true,
	HideFolders: true,
	triggerPhrase: '@',
	triggerHappy: false,
	plainTextByDefault: false,
	initialEditorSuggestions: ['Today', 'Tomorrow', 'Yesterday'],
	initialOpenDailyNoteSuggestions: ['Today', 'Tomorrow', 'Yesterday'],
	holidayLocale: '',
	timeFormat: '',
	timeOnly: false,
};

export class ChronoLanguageSettingTab extends PluginSettingTab {
	plugin: ChronoLanguage;
	hideFoldersSetting: HTMLElement;

	constructor(app: App, plugin: ChronoLanguage) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

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
						this.plugin.settings.primaryFormat = value || "";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Alternate date format")
			.setDesc("Specify your alternate human-readable date format. \
				It will be used for link aliases and plain text dates \
				(when the Alt key is held while using the editor suggester). \
				It does not need to match your daily note format.")
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
				text: "Set your country/region code to show region-specific holidays (IANA format, e.g. 'US', 'GB', 'DE')."
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

		new Setting(containerEl).setName('Link Format').setHeading().setDesc(
			"Adjust how inserted links are formatted. Chrono Language respects your native Obsidian settings for using wikilinks/markdown links and relative paths.");

		const includeFoldersSetting = new Setting(containerEl)
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

		const hideFoldersSetting = new Setting(containerEl)
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

		this.hideFoldersSetting = hideFoldersSetting.settingEl;

		new Setting(containerEl).setName('Editor suggester').setHeading()

		new Setting(containerEl)
			.setName("Trigger phrase")
			.setDesc("Customize the trigger phrase to activate the editor suggester. If empty, the suggester will be disabled.")
			.addText((text) =>
				text
					.setPlaceholder("@")
					.setValue(this.plugin.settings.triggerPhrase)
					.onChange(async (value) => {
						this.plugin.settings.triggerPhrase = value;
						await this.plugin.saveSettings();
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
			.setDesc("When enabled, insert suggestions as plain text by default, and use the Ctrl key modifier to insert as a link.")
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
		.setName("Add timestamp when relevant")
		.setDesc("When inserting a time/date with specified hours/minutes (e.g. 'in 3 hours', or the 'Now' phrase), add a timestamp to the insertion. Specify the time format to use, or leave empty to disable this feature.")
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
		.setName("Insert only the timestamp when selected date is today and time is relevant")
		.setDesc("Timestamps (specified above) will be the ONLY thing inserted if the selected date is today, and time is relevant. If disabled, the timestamp will be appended to the date.")
		.addToggle((toggle) =>
			toggle
				.setValue(this.plugin.settings.timeOnly)
				.onChange(async (value) => {
					this.plugin.settings.timeOnly = value;
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

		new Setting(containerEl).setName('Open daily note modal').setHeading();

		const initialOpenDailyNoteSuggestionsSettings = new Setting(containerEl)
			.setName("Initial suggestions")
			.setDesc("Enter initial suggestions for the 'Open daily note' modal. Each suggestion should be on a new line.");
		// Initial suggestions text entry box
		const initialOpenDailyNoteSuggestionsBox = new MultipleTextComponent(initialOpenDailyNoteSuggestionsSettings.controlEl);
		initialOpenDailyNoteSuggestionsBox
			.setPlaceholder("Today\nTomorrow\nYesterday")
			.setValue(this.plugin.settings.initialOpenDailyNoteSuggestions)
			.onChange(async (value) => {
				const suggestions = value.filter(item => item.trim().length > 0);
				this.plugin.settings.initialOpenDailyNoteSuggestions = suggestions.length > 0
					? [...suggestions]
					: DEFAULT_SETTINGS.initialOpenDailyNoteSuggestions;
				await this.plugin.saveSettings();
			});
	}
}