import { Notice, FuzzySuggestModal, FuzzyMatch, moment } from "obsidian";
import QuickDates from "../../main";
import { SuggestionProvider, DateParser } from "../suggestion-provider";
import { loggerDebug, loggerInfo, loggerWarn, loggerError, registerLoggerClass } from "@/utils";
import { DailyNotesService } from "@/services";
import { ERRORS } from "@/constants";

/**
 * Modal for quickly opening daily notes via date parsing
 */
export class OpenDailyNoteModal extends FuzzySuggestModal<string> {
	plugin: QuickDates;
	private suggester: SuggestionProvider;
	private dailyNotesService: DailyNotesService;
	private inputElement: HTMLInputElement | null = null;
	constructor(app: any, plugin: QuickDates, dailyNotesService: DailyNotesService) {
		super(app);
		loggerDebug(this, 'Initializing daily note modal for quick date-based note access');
		registerLoggerClass(this, 'OpenDailyNoteModal');
		
		this.plugin = plugin;
		this.dailyNotesService = dailyNotesService;
		loggerDebug(this, 'Creating suggestion provider for date parsing and rendering');
		
		// Get DailyNotesService
		if (!this.dailyNotesService) {
			throw new Error('DailyNotesService not available');
		}
		
		this.suggester = new SuggestionProvider(this.app, this.plugin, this.dailyNotesService);		this.suggester.setOpenDailyModalRef(this);
		this.setPlaceholder('Enter a date or relative time...');
		
		loggerInfo(this, 'Daily note modal ready for user interaction', {
			placeholder: 'Enter a date or relative time...',
			suggestionProviderConfigured: !!this.suggester
		});
	}

	/**
	 * Gets the DailyNotesService
	 */
	private getDailyNotesService(): DailyNotesService {
		return this.dailyNotesService;
	}

	onOpen(): void {
		loggerDebug(this, 'Opening daily note modal and setting up keyboard handlers');
		super.onOpen();
		
		// Try using scope if available, otherwise fall back to addEventListener
		if (this.scope) {
			loggerDebug(this, 'Using scope-based Tab key handler for autocomplete functionality');
			this.scope.register([], 'Tab', (event: KeyboardEvent) => {
				this.handleTabKey(event);
				return false; // Let the event continue to be processed normally if not handled
			});
		} else {
			// Fallback to direct event listener if scope is not available
			const input = this.modalEl.querySelector('.prompt-input') as HTMLInputElement;
			if (input) {
				loggerDebug(this, 'Using direct event listener for Tab key handler (scope not available)');
				this.inputElement = input;
				input.addEventListener('keydown', this.handleTabKey, true);
			} else {
				loggerWarn(this, 'Unable to find prompt input element for keyboard handler setup');
			}
		}
		loggerInfo(this, 'Daily note modal opened and ready for user input');
	}

	onClose(): void {
		loggerDebug(this, 'Closing daily note modal and cleaning up event listeners');
		// Only clean up direct event listeners (scope handlers are automatically cleaned up)
		if (this.inputElement) {
			this.inputElement.removeEventListener('keydown', this.handleTabKey, true);
			this.inputElement = null;
		}
		super.onClose();
		loggerInfo(this, 'Daily note modal closed and cleaned up successfully');
	}

	private handleTabKey = (event: KeyboardEvent): void => {
		if (event.key === 'Tab') {
			loggerDebug(this, 'Tab key pressed - attempting autocomplete with first suggestion');
			event.preventDefault();
			event.stopPropagation();
			const items = this.getItems();
			if (!items.length) {
				loggerDebug(this, 'No autocomplete suggestions available for current input');
				return;
			}
			const selected = items[0];
			loggerDebug(this, 'Applying first suggestion as autocomplete', { suggestion: selected });
			const input = this.modalEl.querySelector('.prompt-input') as HTMLInputElement;
			input.value = selected;
			input.dispatchEvent(new Event('input'));
			loggerInfo(this, 'Autocomplete applied successfully', { 
				originalInput: input.value,
				appliedSuggestion: selected 
			});		}
	}
	
	getItems(): string[] {
		const query = (this.modalEl.querySelector(".prompt-input") as HTMLInputElement)?.value || "";
		loggerDebug(this, 'Generating date suggestions for user query', { query: query || '(empty)' });
		
		this.suggester.setOpenDailyModalRef(this);
		const suggestions = this.suggester.getDateSuggestions(
			{ query },
			this.plugin.settings.initialOpenDailyNoteSuggestions
		);
		
		loggerDebug(this, 'Date suggestions generated', { 
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
		loggerDebug(this, 'Rendering suggestion in modal UI', { 
			suggestion: item.item,
			query: query || '(empty)',
			hasMatch: !!item.match
		});
		this.suggester.renderSuggestionContent(item.item, el, { context: { query } }); // setOpenDailyModalRef already applied
	}

	async onChooseItem(item: string): Promise<void> {
		loggerInfo(this, 'User selected suggestion - processing date and opening note', { selectedItem: item });
		try {
			loggerDebug(this, 'Parsing user-selected date suggestion');
			const parsed = DateParser.parseDate(item, this);
			if (!parsed) {
				loggerWarn(this, 'Unable to parse selected date - showing error to user', { 
					selectedItem: item,
					userAction: 'display parse error notice'
				});
				new Notice(ERRORS.UNABLE_PARSE_DATE);
				return;
			}
			
			loggerDebug(this, 'Date parsing successful - proceeding to open/create daily note', { 
				selectedItem: item, 
				parsedDate: parsed.toISOString(),
				momentFormatted: moment(parsed).format('YYYY-MM-DD')
			});

			// Open the file in active leaf
			loggerDebug(this, 'Attempting to get or create daily note for parsed date');
			const dailyNotesService = this.getDailyNotesService();
			const file = await dailyNotesService.getOrCreateDailyNote(moment(parsed), true);
			if (file) {
				loggerDebug(this, 'Daily note retrieved/created - opening in workspace');
				await this.plugin.app.workspace.openLinkText(file.path, '', false);
				loggerInfo(this, 'Daily note successfully opened for user', { 
					selectedItem: item, 
					filePath: file.path,
					parsedDate: parsed.toISOString()
				});
			} else {
				loggerWarn(this, 'Failed to create or retrieve daily note - daily notes plugin may not be configured', { 
					selectedItem: item,
					parsedDate: parsed.toISOString(),
					userAction: 'check daily notes plugin configuration'
				});
			}
		} catch (processingError) {
			loggerError(this, 'Unexpected error while processing selected date', { 
				selectedItem: item, 
				error: processingError instanceof Error ? processingError.message : String(processingError),
				stack: processingError instanceof Error ? processingError.stack : undefined,
				userAction: 'display error notice'
			});
			new Notice(ERRORS.FAILED_HANDLE_NOTE);
		}
	}
}