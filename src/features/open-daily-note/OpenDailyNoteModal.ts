import { Notice, FuzzySuggestModal, FuzzyMatch, moment } from "obsidian";
import QuickDates from "../../main";
import { SuggestionProvider, DateParser } from "../suggestion-provider";
import { getOrCreateDailyNote, debug, info, warn, error, registerLoggerClass } from "@/utils";
import { ServiceContainer } from "@/services";
import { ERRORS } from "@/constants";

/**
 * Modal for quickly opening daily notes via date parsing
 */
export class OpenDailyNoteModal extends FuzzySuggestModal<string> {
	plugin: QuickDates;
	private suggester: SuggestionProvider;
	private serviceContainer?: ServiceContainer;
	
	constructor(app: any, plugin: QuickDates, serviceContainer?: ServiceContainer) {
		super(app);
		debug(this, 'Initializing daily note modal for quick date-based note access');
		registerLoggerClass(this, 'OpenDailyNoteModal');
		
		this.plugin = plugin;
		this.serviceContainer = serviceContainer;
		debug(this, 'Creating suggestion provider for date parsing and rendering');
		this.suggester = new SuggestionProvider(this.app, this.plugin);
		this.suggester.setOpenDailyModalRef(this);
		this.setPlaceholder('Enter a date or relative time...');
		
		info(this, 'Daily note modal ready for user interaction', {
			placeholder: 'Enter a date or relative time...',
			suggestionProviderConfigured: !!this.suggester,
			serviceLayerEnabled: !!serviceContainer
		});
	}onOpen(): void {
		debug(this, 'Opening daily note modal and setting up keyboard handlers');
		super.onOpen();
		const input = this.modalEl.querySelector('.prompt-input') as HTMLInputElement;
		if (input) {
			debug(this, 'Adding tab key handler for autocomplete functionality');
			input.addEventListener('keydown', this.handleTabKey, true);
		} else {
			warn(this, 'Unable to find prompt input element for keyboard handler setup');
		}
		info(this, 'Daily note modal opened and ready for user input');
	}
	private handleTabKey = (event: KeyboardEvent): void => {
		if (event.key === 'Tab') {
			debug(this, 'Tab key pressed - attempting autocomplete with first suggestion');
			event.preventDefault();
			event.stopPropagation();
			const items = this.getItems();
			if (!items.length) {
				debug(this, 'No autocomplete suggestions available for current input');
				return;
			}
			const selected = items[0];
			debug(this, 'Applying first suggestion as autocomplete', { suggestion: selected });
			const input = this.modalEl.querySelector('.prompt-input') as HTMLInputElement;
			input.value = selected;
			input.dispatchEvent(new Event('input'));
			info(this, 'Autocomplete applied successfully', { 
				originalInput: input.value,
				appliedSuggestion: selected 
			});		}
	}
	
	getItems(): string[] {
		const query = (this.modalEl.querySelector(".prompt-input") as HTMLInputElement)?.value || "";
		debug(this, 'Generating date suggestions for user query', { query: query || '(empty)' });
		
		this.suggester.setOpenDailyModalRef(this);
		const suggestions = this.suggester.getDateSuggestions(
			{ query },
			this.plugin.settings.initialOpenDailyNoteSuggestions
		);
		
		debug(this, 'Date suggestions generated', { 
			query: query || '(empty)',
			suggestionCount: suggestions.length,
			maxSuggestions: this.plugin.settings.initialOpenDailyNoteSuggestions,
			samples: suggestions.slice(0, 3)
		});
		
		return suggestions;
	}

	getItemText(item: string): string {
		return item;
	}
	renderSuggestion(item: FuzzyMatch<string>, el: HTMLElement) {
		const query = (this.modalEl.querySelector(".prompt-input") as HTMLInputElement)?.value || "";
		debug(this, 'Rendering suggestion in modal UI', { 
			suggestion: item.item,
			query: query || '(empty)',
			hasMatch: !!item.match
		});
		this.suggester.renderSuggestionContent(item.item, el, { context: { query } }); // setOpenDailyModalRef already applied
	}	async onChooseItem(item: string): Promise<void> {
		info(this, 'User selected suggestion - processing date and opening note', { selectedItem: item });
		try {
			debug(this, 'Parsing user-selected date suggestion');
			const parsed = DateParser.parseDate(item, this);
			if (!parsed) {
				warn(this, 'Unable to parse selected date - showing error to user', { 
					selectedItem: item,
					userAction: 'display parse error notice'
				});
				new Notice(ERRORS.UNABLE_PARSE_DATE);
				return;
			}
			
			debug(this, 'Date parsing successful - proceeding to open/create daily note', { 
				selectedItem: item, 
				parsedDate: parsed.toISOString(),
				momentFormatted: moment(parsed).format('YYYY-MM-DD')
			});
			
			// Open the file in active leaf
			debug(this, 'Attempting to get or create daily note for parsed date');
			const file = await getOrCreateDailyNote(this.plugin.app, moment(parsed), true);
			if (file) {
				debug(this, 'Daily note retrieved/created - opening in workspace');
				await this.plugin.app.workspace.openLinkText(file.path, '', false);
				info(this, 'Daily note successfully opened for user', { 
					selectedItem: item, 
					filePath: file.path,
					parsedDate: parsed.toISOString()
				});
			} else {
				warn(this, 'Failed to create or retrieve daily note - daily notes plugin may not be configured', { 
					selectedItem: item,
					parsedDate: parsed.toISOString(),
					userAction: 'check daily notes plugin configuration'
				});
			}
		} catch (processingError) {
			error(this, 'Unexpected error while processing selected date', { 
				selectedItem: item, 
				error: processingError instanceof Error ? processingError.message : String(processingError),
				stack: processingError instanceof Error ? processingError.stack : undefined,
				userAction: 'display error notice'
			});
			new Notice(ERRORS.FAILED_HANDLE_NOTE);
		}
	}
}