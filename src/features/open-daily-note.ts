import { Notice, FuzzySuggestModal, App, FuzzyMatch } from "obsidian";
import ChronoLanguage from "../main";
import { Suggester } from "../suggester";
import { EnhancedDateParser } from "../parser";
import { getOrCreateDailyNote } from "../utils";

export class OpenDailyNoteModal extends FuzzySuggestModal<string> {
  plugin: ChronoLanguage;
  private suggester: Suggester;

  constructor(app: App, plugin: ChronoLanguage) {
    super(app);
    this.plugin = plugin;
    this.suggester = new Suggester(this.app, this.plugin);
    
    // Set placeholder text for the input field
    this.setPlaceholder("Enter a date or relative time...");
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
      const parsedDateResult = EnhancedDateParser.parseDate(item);
      if (!parsedDateResult || isNaN(parsedDateResult.getTime())) {
        new Notice("Unable to parse date");
        return;
      }

      const momentDate = window.moment(parsedDateResult);
      
      // Use the utility function to get or create and open the note
      await getOrCreateDailyNote(this.app, momentDate, true);
    } catch (error) {
      console.error("Error opening daily note:", error);
      new Notice("Failed to open daily note");
    }
  }
}