import { App, PluginSettingTab, Setting } from 'obsidian';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import ChronoLanguage from './main';

export interface ChronoLanguageSettings {
	readableFormat: string;
}

export const DEFAULT_SETTINGS: ChronoLanguageSettings = {
	readableFormat: ''
}

export class ChronoLanguageSettingsTab extends PluginSettingTab {
  plugin: ChronoLanguage;

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
  }
}