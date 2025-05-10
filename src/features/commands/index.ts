import { App, Editor, MarkdownView, Notice, moment, TFile } from 'obsidian';
import { DateParser } from '../suggestion-provider/date-parser';
import { DateFormatter, createDailyNoteLink } from '../../utils/helpers';
import { ContentFormat } from '../../types';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { ChronoLanguageSettings } from '../../settings';
import { TextSearcher } from './text-searcher';

// Define helper types for the parse info result
interface DateCommandParseSuccess {
    textToProcess: string;
    parsedDate: Date;
    from: number | null;
    to: number | null;
}

interface DateCommandParseError {
    errorNotice: string;
    textToProcessContext?: string; // Optional: for providing context in the error message
}

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

    private getInitialTextAndParseInfo(editor: Editor, commandContext: string): DateCommandParseSuccess | DateCommandParseError {
        let textToProcess = editor.getSelection();
        let from: number | null = null;
        let to: number | null = null;

        if (!textToProcess) { // No selection, try word at cursor
            const wordAtCursor = this.getWordAtCursor(editor);
            if (wordAtCursor) {
                textToProcess = wordAtCursor.word;
                const parsedDate = DateParser.parseDate(textToProcess);
                if (!parsedDate) {
                    return { errorNotice: `Text at cursor ("${textToProcess}") doesn't seem to be a date for ${commandContext}.`, textToProcessContext: textToProcess };
                }
                from = wordAtCursor.from;
                to = wordAtCursor.to;
                return { textToProcess, parsedDate, from, to }; // Success for wordAtCursor
            } else { // No word at cursor, no selection
                return { errorNotice: `No text selected and no date-like text found at cursor for ${commandContext}.` };
            }
        } else { // Text was selected
            const parsedDate = DateParser.parseDate(textToProcess);
            if (!parsedDate) {
                return { errorNotice: `Could not parse "${textToProcess}" as a date for ${commandContext}.`, textToProcessContext: textToProcess };
            }
            // 'from' and 'to' remain null for selection, editor.replaceSelection() handles it.
            return { textToProcess, parsedDate, from: null, to: null }; // Success for selection
        }
    }

    /**
     * Parses selected text and replaces it with a date link
     */
    parseDateAsLink(editor: Editor, view: MarkdownView): void {
        const parseInfo = this.getInitialTextAndParseInfo(editor, 'converting to link');

        if ('errorNotice' in parseInfo) { // Type guard for DateCommandParseError
            new Notice(parseInfo.errorNotice);
            return;
        }
        // If here, parseInfo is DateCommandParseSuccess
        const { textToProcess, parsedDate, from, to } = parseInfo;

        if (!view.file) {
            new Notice('Cannot create link: file not saved');
            return;
        }

        const link = createDailyNoteLink(
            this.app,
            this.settings,
            view.file,
            textToProcess // textToProcess is string here
        );

        if (from !== null && to !== null) { // from and to are number | null here
            const cursor = editor.getCursor();
            // Inside this block, from and to are narrowed to number
            editor.replaceRange(link, { line: cursor.line, ch: from }, { line: cursor.line, ch: to });
        } else {
            editor.replaceSelection(link);
        }
    }    
    /**
     * Parses selected text and replaces it with a formatted date text
     * Respects time component detection and settings
     */
    parseDateAsText(editor: Editor, view: MarkdownView): void {
        const parseInfo = this.getInitialTextAndParseInfo(editor, 'converting to plain text');

        if ('errorNotice' in parseInfo) {
            new Notice(parseInfo.errorNotice);
            return;
        }
        const { textToProcess, parsedDate, from, to } = parseInfo;

        const dailyNoteSettings = getDailyNoteSettings();
        const momentDate = moment(parsedDate); // parsedDate is Date here

        const formattedDate = DateFormatter.getFormattedDateText(
            textToProcess, // textToProcess is string here
            momentDate,
            this.settings,
            ContentFormat.PRIMARY,
            dailyNoteSettings
        );

        if (from !== null && to !== null) {
            const cursor = editor.getCursor();
            editor.replaceRange(formattedDate, { line: cursor.line, ch: from }, { line: cursor.line, ch: to });
        } else {
            editor.replaceSelection(formattedDate);
        }
    }

    // New methods for processing all dates in the document

    private async parseAllDatesInDocumentInternal(editor: Editor, view: MarkdownView, asLink: boolean, forceTextAsAliasForLink: boolean = false): Promise<void> {
        const originalCursor = editor.getCursor();
        const lastLine = editor.lastLine();
        const allChanges: { from: {line: number, ch: number}, to: {line: number, ch: number}, text: string }[] = [];
        let replacementsMade = 0;

        for (let lineNum = 0; lineNum <= lastLine; lineNum++) {
            const currentLineContent = editor.getLine(lineNum);
            let searchCh = 0;

            while (searchCh < currentLineContent.length) {
                let effectiveCh = searchCh;
                while (effectiveCh < currentLineContent.length && /\s/.test(currentLineContent[effectiveCh])) {
                    effectiveCh++;
                }

                if (effectiveCh >= currentLineContent.length) {
                    break;
                }

                editor.setCursor({ line: lineNum, ch: effectiveCh });
                const wordAtCursorResult = TextSearcher.getWordAtCursor(editor);

                if (wordAtCursorResult) {
                    const textToProcess = wordAtCursorResult.word;
                    const fromCh = wordAtCursorResult.from;
                    const toCh = wordAtCursorResult.to;

                    if (fromCh < searchCh) {
                        let nextSearchChAfterEffective = effectiveCh + 1;
                        const wordAfterEffectiveCh = currentLineContent.substring(effectiveCh).match(/^\S+/);
                        if (wordAfterEffectiveCh) {
                            nextSearchChAfterEffective = effectiveCh + wordAfterEffectiveCh[0].length;
                        }
                        searchCh = Math.max(searchCh + 1, nextSearchChAfterEffective);
                        continue;
                    }

                    const parsedDate = DateParser.parseDate(textToProcess);

                    if (parsedDate) {
                        let replacementText: string;
                        if (asLink) {
                            if (!view.file) {
                                new Notice('Cannot create link: Current view is not a markdown editor.');
                                searchCh = toCh;
                                continue;
                            }
                            replacementText = createDailyNoteLink(
                                this.app,
                                this.settings,
                                view.file,
                                textToProcess,
                                forceTextAsAliasForLink
                            );
                        } else {
                            const momentDate = moment(parsedDate);
                            const dailyNoteSettings = getDailyNoteSettings();
                            replacementText = DateFormatter.getFormattedDateText(
                                textToProcess,
                                momentDate,
                                this.settings,
                                ContentFormat.PRIMARY,
                                dailyNoteSettings
                            );
                        }

                        allChanges.push({
                            from: { line: lineNum, ch: fromCh },
                            to: { line: lineNum, ch: toCh },
                            text: replacementText
                        });
                        replacementsMade++;
                        searchCh = toCh;
                    } else {
                        searchCh = toCh;
                    }
                } else {
                    let nextSearchCh = effectiveCh + 1;
                    const wordMatch = currentLineContent.substring(effectiveCh).match(/^\S+/);
                    if (wordMatch) {
                        nextSearchCh = effectiveCh + wordMatch[0].length;
                    }
                    searchCh = Math.max(searchCh + 1, nextSearchCh);
                }
            }
        }

        if (allChanges.length > 0) {
            editor.transaction({ changes: allChanges });
            new Notice(`Replaced ${replacementsMade} date/time phrase(s) in the document.`);
        } else {
            new Notice('No date/time phrases found to replace in the document.');
        }
        editor.setCursor(originalCursor);
    }

    /**
     * Scans the entire document for date/time phrases and replaces them with daily note links.
     */
    public async parseAllDatesAsLinks(editor: Editor, view: MarkdownView): Promise<void> {
        if (!view.file) {
            new Notice('Cannot process note: Current view is not a markdown editor.');
            return;
        }
        await this.parseAllDatesInDocumentInternal(editor, view, true, false);
    }

    /**
     * Scans the entire document for date/time phrases and replaces them with formatted plain text dates.
     */
    public async parseAllDatesAsText(editor: Editor, view: MarkdownView): Promise<void> {
        await this.parseAllDatesInDocumentInternal(editor, view, false);
    }

    /**
     * Parses selected text and replaces it with a date link, keeping original text as alias.
     */
    parseDateAsLinkKeepOriginalTextAlias(editor: Editor, view: MarkdownView): void {
        const parseInfo = this.getInitialTextAndParseInfo(editor, 'converting to link (keeping original alias)');

        if ('errorNotice' in parseInfo) {
            new Notice(parseInfo.errorNotice);
            return;
        }
        const { textToProcess, parsedDate, from, to } = parseInfo;

        if (!view.file) {
            new Notice('Cannot create link: file not saved');
            return;
        }

        const link = createDailyNoteLink(
            this.app,
            this.settings,
            view.file,
            textToProcess, // textToProcess is string here
            true // forceTextAsAlias = true
        );

        if (from !== null && to !== null) {
            const cursor = editor.getCursor();
            editor.replaceRange(link, { line: cursor.line, ch: from }, { line: cursor.line, ch: to });
        } else {
            editor.replaceSelection(link);
        }
    }

    /**
     * Scans the entire document for date/time phrases and replaces them with daily note links,
     * keeping original text as alias.
     */
    public async parseAllDatesAsLinksKeepOriginalTextAlias(editor: Editor, view: MarkdownView): Promise<void> {
        if (!view.file) {
            new Notice('Cannot process note: Current view is not a markdown editor.');
            return;
        }
        await this.parseAllDatesInDocumentInternal(editor, view, true, true);
    }
}
