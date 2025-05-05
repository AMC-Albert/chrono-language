import { Notice, FuzzySuggestModal, App, FuzzyMatch } from "obsidian";
import ChronoLanguage from "../main";
import { Suggester } from "./suggestion-renderer";
import { EnhancedDateParser } from "../utils/parser";
import { getOrCreateDailyNote } from "../utils/helpers";
import { KeyboardHandler } from "../utils/keyboard-handler";
import { KEY_EVENTS } from "../plugin-data/constants";

export class OpenDailyNoteModal extends FuzzySuggestModal<string> {
  plugin: ChronoLanguage;
  private suggester: Suggester;
  private keyboardHandler: KeyboardHandler;

  constructor(app: App, plugin: ChronoLanguage) {
    super(app);
    this.plugin = plugin;
    
    // Initialize keyboard handler for modal context
    this.keyboardHandler = new KeyboardHandler(
      this.scope, 
      plugin.settings.plainTextByDefault
    );
    
    // Initialize suggester after keyboard handler
    this.suggester = new Suggester(this.app, this.plugin);
    
    // Set placeholder text for the input field
    this.setPlaceholder("Enter a date or relative time...");
    
    // Set up event listeners for key state sync
    this.setupKeyboardEventHandlers();
  }
  
  private setupKeyboardEventHandlers() {
    // Set up event listeners to sync key states between suggester and modal
    this.scope.register([], KEY_EVENTS.KEYDOWN, (event: KeyboardEvent) => {
      // Update keyboard handler state
      const updated = this.keyboardHandler.updateKeyState(event, true);
      
      // If state changed, sync with suggester and update previews
      if (updated) {
        this.suggester.syncKeyStateFrom(this.keyboardHandler);
        this.suggester.updateAllPreviews();
      }
      
      return true; // Allow event to propagate
    });
    
    this.scope.register([], KEY_EVENTS.KEYUP, (event: KeyboardEvent) => {
      // Update keyboard handler state
      const updated = this.keyboardHandler.updateKeyState(event, false);
      
      // If state changed, sync with suggester and update previews
      if (updated) {
        this.suggester.syncKeyStateFrom(this.keyboardHandler);
        this.suggester.updateAllPreviews();
      }
      
      return true; // Allow event to propagate
    });
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

  async onChooseItem(item: string, event: MouseEvent | KeyboardEvent): Promise<void> {
    try {
      // Use the new centralized logic for mode/format
      const { insertMode, contentFormat } = this.keyboardHandler.getEffectiveInsertModeAndFormat(event);
      const parsedDateResult = EnhancedDateParser.parseDate(item);
      if (!parsedDateResult || isNaN(parsedDateResult.getTime())) {
        new Notice("Unable to parse date");
        return;
      }
      const momentDate = window.moment(parsedDateResult);
      if (insertMode === InsertMode.PLAINTEXT) {
        let text = '';
        if (contentFormat === ContentFormat.SUGGESTION_TEXT) {
          text = item;
        } else if (contentFormat === ContentFormat.DAILY_NOTE) {
          text = getDailyNotePreview(item);
        } else {
          text = getDatePreview(
            item,
            this.plugin.settings,
            contentFormat === ContentFormat.ALTERNATE,
            false,
            contentFormat === ContentFormat.DAILY_NOTE
          );
        }
        // Insert plain text into the editor if available
        if (this.app.workspace.activeEditor?.editor) {
          this.app.workspace.activeEditor.editor.replaceSelection(text);
        }
      } else {
        await getOrCreateDailyNote(this.app, momentDate, true);
      }
    } catch (error) {
      console.error("Error opening daily note:", error);
      new Notice("Failed to open daily note");
    }
  }
}