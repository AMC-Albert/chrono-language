import { Notice, FuzzySuggestModal, App, FuzzyMatch, moment } from "obsidian";
import ChronoLanguage from "../main";
import { SuggestionProvider } from "./suggestion-provider";
import { EnhancedDateParser } from "../utils/parser";
import { getOrCreateDailyNote } from "../utils/helpers";
import { ERRORS } from "../definitions/constants";

/**
 * Modal for quickly opening daily notes via date parsing
 */
export class OpenDailyNoteModal extends FuzzySuggestModal<string> {
  plugin: ChronoLanguage;
  private suggester: SuggestionProvider;

  constructor(app: App, plugin: ChronoLanguage) {
    super(app);
    this.plugin = plugin;
    this.suggester = new SuggestionProvider(this.app, this.plugin);
    this.setPlaceholder("Enter a date or relative time...");
  }

  getItems(): string[] {
    const query = (this.modalEl.querySelector(".prompt-input") as HTMLInputElement)?.value || "";
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
      
      // Open the file in active leaf
      const file = await getOrCreateDailyNote(this.app, moment(parsed), true);
      if (file) await this.app.workspace.getLeaf().openFile(file);
    } catch (error) {
      console.error("Error opening daily note:", error);
      new Notice(ERRORS.FAILED_HANDLE_NOTE);
    }
  }
}