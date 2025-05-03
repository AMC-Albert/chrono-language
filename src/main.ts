import { Editor, Plugin, EditorSuggest, EditorSuggestContext, EditorPosition } from 'obsidian';
import { ChronoLanguageSettings, DEFAULT_SETTINGS, ChronoLanguageSettingsTab } from './settings';
import { createDailyNoteLink } from './utils';

export default class ChronoLanguage extends Plugin {
	settings: ChronoLanguageSettings;

	async onload() {
		await this.loadSettings();
		
		// Register settings tab
		this.addSettingTab(new ChronoLanguageSettingsTab(this.app, this));
		
		this.registerEditorSuggest(new ChronoSuggester(this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// Suggestion for @ trigger
class ChronoSuggester extends EditorSuggest<string> {
	plugin: ChronoLanguage;
	
	constructor(plugin: ChronoLanguage) {
		super(plugin.app);
		this.plugin = plugin;
	}
	
	onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestContext | null {
		const line = editor.getLine(cursor.line).slice(0, cursor.ch);
		const m = line.match(/@(\w*)$/);
		if (!m) return null;
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return null;
		return { start: { line: cursor.line, ch: m.index! }, end: cursor, query: m[1], editor, file: activeFile };
	}

	getSuggestions(ctx: EditorSuggestContext): string[] {
		const choices = ['Alice 1', 'Bob 1', 'Charlie 1'];
		return choices.filter(c => c.toLowerCase().startsWith(ctx.query.toLowerCase()));
	}

	renderSuggestion(item: string, el: HTMLElement) {
		el.createEl('div', { text: item });
	}

	selectSuggestion(item: string): void {
		if (this.context) {
			const { editor, start, end } = this.context;
			const link = createDailyNoteLink(this.app, this.plugin.settings, this.context.file);
			editor.replaceRange(link, start, end);
		}
	}
}
