import { Notice, FuzzySuggestModal, App, FuzzyMatch, moment } from "obsidian";
import ChronoLanguage from "../main";
import { SuggestionProvider } from "./suggestion-provider";
import { EnhancedDateParser } from "../utils/parser";
import { getOrCreateDailyNote } from "../utils/helpers";
import { ERRORS } from "../definitions/constants";

export class OpenDailyNoteModal extends FuzzySuggestModal<string> {
  plugin: ChronoLanguage;
  private suggester: SuggestionProvider;

  constructor(app: App, plugin: ChronoLanguage) {
    super(app);
    this.plugin = plugin;

    // Initialize suggester
    this.suggester = new SuggestionProvider(this.app, this.plugin);

    // Set placeholder text for the input field
    this.setPlaceholder("Enter a date or relative time...");

    // Set up event listeners for key state sync
    this.setupKeyboardEventHandlers();
  }

  private setupKeyboardEventHandlers() {
    ['keydown', 'keyup'].forEach((ev) =>
      this.scope.register([], ev, () => {
        this.suggester.updateAllPreviews();
        return true;
      })
    );
  }

  getItems(): string[] {
    const inputEl = this.modalEl.querySelector(".prompt-input") as HTMLInputElement;
    const query = inputEl?.value || "";
    return this.suggester.getDateSuggestions(
      { query },
      this.plugin.settings.initialOpenDailyNoteSuggestions
    );
  }

  getItemText(item: string): string {
    return item;
  }

  renderSuggestion(item: FuzzyMatch<string>, el: HTMLElement) {
    this.suggester.renderSuggestionContent(item.item, el, this);
  }

  async onChooseItem(item: string): Promise<void> {
    try {
      const parsed = EnhancedDateParser.parseDate(item);
      if (!parsed) {
        new Notice(ERRORS.UNABLE_PARSE_DATE);
        return;
      }
      const momentDate = moment(parsed);
      await getOrCreateDailyNote(this.app, momentDate, true);
    } catch (error) {
      console.error("Error opening daily note:", error);
      new Notice(ERRORS.FAILED_HANDLE_NOTE);
    }
  }
}