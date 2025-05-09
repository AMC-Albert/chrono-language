import { App, Editor, MarkdownView, Notice, moment, TFile } from 'obsidian';
import { DateParser } from '../suggestion-provider/parser';
import { DateFormatter, createDailyNoteLink } from '../../utils/helpers';
import { ContentFormat } from '../../types';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { ChronoLanguageSettings } from '../../settings';
import { TextSearcher } from './text-searcher';

/**
 * Commands for parsing and formatting dates from selected text
 */
export class DateCommands {
    private app: App;
    private settings: ChronoLanguageSettings;

    constructor(app: App, settings: ChronoLanguageSettings) {
        this.app = app;
        this.settings = settings;
    }

    /**
     * Updates the plugin settings reference
     */
    updateSettings(settings: ChronoLanguageSettings): void {
        this.settings = settings;
    }    
    /**
     * Gets the potential date expression at or around cursor position
     * Uses TextSearcher for improved logic (month + number, etc)
     */
    private getWordAtCursor(editor: Editor): { word: string, from: number, to: number } | null {
        return TextSearcher.getWordAtCursor(editor);
    }
    
    /**
     * Scans backwards for a date expression
     * Delegates to TextSearcher for consistency
     */
    private scanBackwardsForDateExpression(editor: Editor, cursor: { line: number, ch: number }): { word: string, from: number, to: number } | null {
        // This method is now handled by TextSearcher, keep for backward compatibility if needed
        return TextSearcher.scanBackwardsForDateExpression(editor, cursor);
    }

    /**
     * Parses selected text and replaces it with a date link
     */
    parseDateAsLink(editor: Editor, view: MarkdownView): void {
        let textToProcess = editor.getSelection();
        let from: number | null = null;
        let to: number | null = null;
        
        // If no text is selected, try to get the word at cursor
        if (!textToProcess) {
            const wordAtCursor = this.getWordAtCursor(editor);
            if (wordAtCursor) {
                textToProcess = wordAtCursor.word;
                
                // Try to parse it as a date first
                const potentialDate = DateParser.parseDate(textToProcess);
                if (!potentialDate) {
                    new Notice(`Text at cursor position "${textToProcess}" doesn't appear to be a date`);
                    return;
                }
                
                from = wordAtCursor.from;
                to = wordAtCursor.to;
            } else {
                new Notice('No text selected and no text found at cursor position');
                return;
            }
        }

        const parsedDate = DateParser.parseDate(textToProcess);
        if (!parsedDate) {
            new Notice(`Could not parse "${textToProcess}" as a date`);
            return;
        }

        if (!view.file) {
            new Notice('Cannot create link: file not saved');
            return;
        }

        const link = createDailyNoteLink(
            this.app,
            this.settings,
            view.file,
            textToProcess
        );

        if (from !== null && to !== null) {
            // Replace the word at cursor with the link
            const cursor = editor.getCursor();
            editor.replaceRange(link, { line: cursor.line, ch: from }, { line: cursor.line, ch: to });
        } else {
            // Replace the selection with the link
            editor.replaceSelection(link);
        }
    }    
    /**
     * Parses selected text and replaces it with a formatted date text
     * Respects time component detection and settings
     */
    parseDateAsText(editor: Editor, view: MarkdownView): void {
        let textToProcess = editor.getSelection();
        let from: number | null = null;
        let to: number | null = null;
        
        // If no text is selected, try to get the word at cursor
        if (!textToProcess) {
            const wordAtCursor = this.getWordAtCursor(editor);
            if (wordAtCursor) {
                textToProcess = wordAtCursor.word;
                
                // Try to parse it as a date first
                const potentialDate = DateParser.parseDate(textToProcess);
                if (!potentialDate) {
                    new Notice(`Text at cursor position "${textToProcess}" doesn't appear to be a date`);
                    return;
                }
                
                from = wordAtCursor.from;
                to = wordAtCursor.to;
            } else {
                new Notice('No text selected and no text found at cursor position');
                return;
            }
        }

        const parsedDate = DateParser.parseDate(textToProcess);
        if (!parsedDate) {
            new Notice(`Could not parse "${textToProcess}" as a date`);
            return;
        }

        const dailyNoteSettings = getDailyNoteSettings();
        const momentDate = moment(parsedDate);
        
        // Check if we should render time only (respecting timeOnly setting and if date is today)
        const shouldRenderTimeOnly = DateFormatter.shouldRenderTimeOnly(
            textToProcess, 
            this.settings, 
            momentDate
        );

        // Get appropriate format based on settings and time relevance
        const formattedDate = DateFormatter.getFormattedDateText(
            textToProcess,
            momentDate,
            this.settings,
            ContentFormat.PRIMARY,
            dailyNoteSettings
        );

        if (from !== null && to !== null) {
            // Replace the word at cursor with the formatted date
            const cursor = editor.getCursor();
            editor.replaceRange(formattedDate, { line: cursor.line, ch: from }, { line: cursor.line, ch: to });
        } else {
            // Replace the selection with the formatted date
            editor.replaceSelection(formattedDate);
        }
    }
}
