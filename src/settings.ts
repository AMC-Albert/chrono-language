import { App, PluginSettingTab, Setting } from 'obsidian';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import ChronoLanguage from './main';

export interface ChronoLanguageSettings {
	readableFormat: string;
  includeFolderInLinks: boolean;
  HideFolders: boolean;
}

export const DEFAULT_SETTINGS: ChronoLanguageSettings = {
	readableFormat: '',
  includeFolderInLinks: true,
  HideFolders: true
}

export class ChronoLanguageSettingsTab extends PluginSettingTab {
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
    .setName("Human-readable date format")
    .setDesc((() => {
      const fragment = document.createDocumentFragment();
      fragment.createSpan({
        text: "Specify your preferred human-readable date format. Refer to "
      });
      fragment.createEl("a", {
        text: "format reference",
        href: "https://momentjs.com/docs/#/displaying/format/",
        attr: { target: "_blank", rel: "noopener" }
      });
      fragment.createSpan({
        text: ". This will be used for link aliases and plain text dates. \
        By default, matches the format of your daily notes."
      });
      return fragment;
    })())
    .addText((text) =>
      text
        .setPlaceholder(getDailyNoteSettings().format || "YYYY-MM-DD")
        .setValue(this.plugin.settings.readableFormat)
        .onChange(async (value) => {
          this.plugin.settings.readableFormat = value || "";
          await this.plugin.saveSettings();
        })
    );

    const includeFoldersSetting = new Setting(containerEl)
    .setName("Include folders in links")
    .setDesc("Include the daily note folder path in generated links. \
      This is preferable if you create files using unresolved links to daily notes and have a set folder for them.")
    .addToggle((toggle) =>
      toggle
        .setValue(this.plugin.settings.includeFolderInLinks)
        .onChange(async (value) => {
          this.plugin.settings.includeFolderInLinks = value;
          // Show/hide the "Hide folders" setting based on this toggle
          value
          ? this.hideFoldersSetting.show()
          : this.hideFoldersSetting.hide();
          await this.plugin.saveSettings();
        })
    );

    const hideFoldersSetting = new Setting(containerEl)
    .setName("Hide folders in links using aliases")
    .setDesc("If including folders in links, and no human-readable date format is set (no preferred alias), \
      use an alias anyway (the note name) to hide the folder path.")
    .addToggle((toggle) =>
      toggle
        .setValue(this.plugin.settings.HideFolders)
        .onChange(async (value) => {
          this.plugin.settings.HideFolders = value;
          await this.plugin.saveSettings();
        })
    );
    
    this.hideFoldersSetting = hideFoldersSetting.settingEl;
    
    if (!this.plugin.settings.includeFolderInLinks) {
      this.hideFoldersSetting.hide();
    }
  }
}