import { Editor, Plugin, EditorSuggest, EditorSuggestContext, EditorPosition } from 'obsidian';
import { ChronoLanguageSettings, DEFAULT_SETTINGS, ChronoLanguageSettingsTab } from './settings';
import { createDailyNoteLink, getDatePreview, getDailyNotePreview } from './utils';

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

class ChronoSuggester extends EditorSuggest<string> {
	plugin: ChronoLanguage;
	
	constructor(plugin: ChronoLanguage) {
		super(plugin.app);
		this.plugin = plugin;
		
		// Add usage instructions
		this.setInstructions([
			{
				command: "Shift",
				purpose: "Force selected text as alias"
			}
		]);

		// Register Shift+Enter to capture shift key during keyboard selection
		this.scope.register(["Shift"], "Enter", (event: KeyboardEvent) => {
			// @ts-ignore
			this.suggestions.useSelectedItem(event);
			return false;
		});
	}
	
	onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestContext | null {
		const line = editor.getLine(cursor.line).slice(0, cursor.ch);
		 // Match @ followed by any characters, but return null if first character is a space
		const m = line.match(/@([^@]*)$/);
		if (!m) return null;
		
		// If the query starts with a space, dismiss the suggester
		if (m[1].startsWith(" ")) return null;
		
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return null;
		return { start: { line: cursor.line, ch: m.index! }, end: cursor, query: m[1], editor, file: activeFile };
	}

	getSuggestions(ctx: EditorSuggestContext): string[] {
		const choices = ['Today', 'Tomorrow', 'Yesterday'];
		const filtered = choices.filter(c => c.toLowerCase().startsWith(ctx.query.toLowerCase()));
		
		// If no matches found, create a fallback suggestion with the user's input
		if (filtered.length === 0 && ctx.query) {
			// Capitalize first letter to match the style of other suggestions
			const capitalizedInput = ctx.query.charAt(0).toUpperCase() + ctx.query.slice(1);
			return [capitalizedInput];
		}
		
		return filtered;
	}

	renderSuggestion(item: string, el: HTMLElement) {
		const container = el.createEl('div', { cls: 'chrono-suggestion-container' });
		container.createEl('span', { text: item, cls: 'chrono-suggestion-text' });
		
		// Get both previews
		const dailyNotePreview = getDailyNotePreview(item);
		const readableDatePreview = getDatePreview(item, this.plugin.settings);
		
		if (dailyNotePreview) {
			// Only show dailyNotePreview if they're the same
			if (dailyNotePreview === readableDatePreview) {
				container.createEl('span', { 
					text: `↳ ${dailyNotePreview}`,
					cls: 'chrono-suggestion-preview' 
				});
			} else {
				container.createEl('span', { 
					text: `↳ ${dailyNotePreview} ⭢ ${readableDatePreview}`,
					cls: 'chrono-suggestion-preview' 
				});
			}
		}
	}

	selectSuggestion(item: string, event: KeyboardEvent | MouseEvent): void {
		if (this.context) {
			const { editor, start, end } = this.context;
			const forceTextAsAlias = event.shiftKey;
			const link = createDailyNoteLink(this.app, this.plugin.settings, this.context.file, item, forceTextAsAlias);
			editor.replaceRange(link, start, end);
		}
	}
}
