import { Notice, FuzzySuggestModal, App, FuzzyMatch, TFile } from "obsidian";
import ChronoLanguage from "../main";
import { Suggester } from "../suggester";
import { getDailyNote, getAllDailyNotes, createDailyNote } from 'obsidian-daily-notes-interface';
import { EnhancedDateParser } from "../parser";

export class OpenDailyNoteModal extends FuzzySuggestModal<string> {
  plugin: ChronoLanguage;
  private suggester: Suggester;

  constructor(app: App, plugin: ChronoLanguage) {
    super(app);
    this.plugin = plugin;
    this.suggester = new Suggester(this.app, this.plugin);
    
    // Set placeholder text for the input field
    this.setPlaceholder("Enter a date...");
  }

  getItems(): string[] {
    const inputEl = this.modalEl.querySelector(".prompt-input") as HTMLInputElement;
    const query = inputEl?.value || "";
    return this.suggester.getDateSuggestions(
      { query },
      ['Today', 'Yesterday', 'Tomorrow']
    );
  }

  getItemText(item: string): string {
    return item;
  }

  renderSuggestion(item: FuzzyMatch<string>, el: HTMLElement) {
    this.suggester.renderSuggestionContent(item.item, el);
  }

  async onChooseItem(item: string): Promise<void> {
    try {
      const parsedDateResult = EnhancedDateParser.parseDate(item);
      if (!parsedDateResult || isNaN(parsedDateResult.getTime())) {
        new Notice("Unable to parse date");
        return;
      }

      const momentDate = window.moment(parsedDateResult); // Convert Date to Moment
      
      // Get the daily note or create it if it doesn't exist
      let dailyNote = getDailyNote(momentDate, getAllDailyNotes());
      
      if (!dailyNote) dailyNote = await createDailyNote(momentDate);
      
      if (dailyNote) {
        const obsidianFile = this.app.vault.getAbstractFileByPath(dailyNote.path);
        if (obsidianFile instanceof TFile) {
          await this.app.workspace.getLeaf().openFile(obsidianFile);
        } else {
          new Notice("Failed to find daily note in vault");
        }
      } else {
        new Notice("Failed to create or find daily note");
      }
    } catch (error) {
      console.error("Error opening daily note:", error);
      new Notice("Failed to open daily note");
    }
  }
}