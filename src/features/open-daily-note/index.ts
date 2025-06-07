import { Notice, FuzzySuggestModal, FuzzyMatch, moment } from "obsidian";
import QuickDates from "../../main";
import { SuggestionProvider } from "../suggestion-provider";
import { DateParser } from "../suggestion-provider/date-parser";
import { getOrCreateDailyNote } from "../../utils/helpers";
import { ERRORS } from "../../constants";
import { debug, info, warn, error, registerLoggerClass } from '../../utils/obsidian-logger';

/**
 * Modal for quickly opening daily notes via date parsing
 */
export class OpenDailyNoteModal extends FuzzySuggestModal<string> {
	plugin: QuickDates;
	private suggester: SuggestionProvider;  constructor(app: any, plugin: QuickDates) {
		super(app);
		this.plugin = plugin;
		registerLoggerClass(this, 'OpenDailyNoteModal');
		this.suggester = new SuggestionProvider(this.app, this.plugin);
		this.suggester.setOpenDailyModalRef(this);
		this.setPlaceholder('Enter a date or relative time...');
		debug(this, 'constructor', { pluginId: this.plugin.manifest.id });
	}
	onOpen(): void {
		super.onOpen();
		debug(this, 'onOpen', {});
		const input = this.modalEl.querySelector('.prompt-input') as HTMLInputElement;
		if (input) input.addEventListener('keydown', this.handleTabKey, true);
	}

	private handleTabKey = (event: KeyboardEvent): void => {
		if (event.key === 'Tab') {
			event.preventDefault();
			event.stopPropagation();
			const items = this.getItems();
			if (!items.length) return;
			const selected = items[0];
			const input = this.modalEl.querySelector('.prompt-input') as HTMLInputElement;
			input.value = selected;
			input.dispatchEvent(new Event('input'));
		}
	}
	getItems(): string[] {
		const query = (this.modalEl.querySelector(".prompt-input") as HTMLInputElement)?.value || "";
		debug(this, 'getItems', { query });
		this.suggester.setOpenDailyModalRef(this);
		const suggestions = this.suggester.getDateSuggestions(
			{ query },
			this.plugin.settings.initialOpenDailyNoteSuggestions
		);
		debug(this, 'getItems', 'result:', { query, suggestionCount: suggestions.length });
		return suggestions;
	}

	getItemText(item: string): string {
		return item;
	}

	renderSuggestion(item: FuzzyMatch<string>, el: HTMLElement) {
		const query = (this.modalEl.querySelector(".prompt-input") as HTMLInputElement)?.value || "";
		this.suggester.renderSuggestionContent(item.item, el, { context: { query } }); // setOpenDailyModalRef already applied
	}
	async onChooseItem(item: string): Promise<void> {
		info(this, 'onChooseItem', { item });
		try {
			const parsed = DateParser.parseDate(item, this);
			if (!parsed) {
				warn(this, 'onChooseItem', 'unable to parse date', { item });
				new Notice(ERRORS.UNABLE_PARSE_DATE);
				return;
			}
			
			debug(this, 'onChooseItem', 'parsed date successfully', { 
				item, 
				parsedDate: parsed.toISOString() 
			});
			
			// Open the file in active leaf
			const file = await getOrCreateDailyNote(this.plugin.app, moment(parsed), true);
			if (file) {
				await this.plugin.app.workspace.openLinkText(file.path, '', false);
				info(this, 'onChooseItem', 'opened daily note', { 
					item, 
					filePath: file.path 
				});
			} else {
				warn(this, 'onChooseItem', 'failed to create/get daily note', { item });
			}
		} catch (error) {
			error(this, 'onChooseItem', 'error handling note', { item, error });
			new Notice(ERRORS.FAILED_HANDLE_NOTE);
		}
	}
}