import { Editor, MarkdownView, Notice, moment } from 'obsidian';
import { DateParser } from '../suggestion-provider/date-parser';
import { DateFormatter, createDailyNoteLink } from '../../utils/helpers';
import { ContentFormat } from '../../types';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { QuickDatesSettings } from '../../settings';
import { TextSearcher } from './text-searcher';
import { debug, info, warn, error, registerLoggerClass } from '../../utils/obsidian-logger';
import * as chrono from 'chrono-node';

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

// Add helper to strip Markdown syntax
function stripMarkdown(text: string): string {
	// Remove bold, italics, underline, strikethrough, and inline code markers
	const result = text.replace(/(\*{1,2}|_{1,2}|~{2}|`)/g, '');
	return result.trim();
}

// Add helper to strip formatting and preserve index map
function stripFormattingWithMap(line: string): { text: string; map: number[] } {
	const map: number[] = [];
	let text = '';
	for (let i = 0; i < line.length; i++) {
		if (!/[*_~`]/.test(line[i])) {
			map.push(i);
			text += line[i];
		}
	}
	return { text, map };
}

/**
 * Commands for parsing and formatting dates from selected text
 */
export class DateCommands {
	private app: any;
	private settings: QuickDatesSettings;    constructor(app: any, settings: QuickDatesSettings) {
		this.app = app;
		this.settings = settings;
		registerLoggerClass(this, 'DateCommands');
		debug(this, 'Initialized with settings:', {
			primaryFormat: settings.primaryFormat,
			alternateFormat: settings.alternateFormat,
			plainTextByDefault: settings.plainTextByDefault
		});
	}

	/**
	 * Updates the plugin settings reference
	 */
	updateSettings(settings: QuickDatesSettings): void {
		debug(this, 'updateSettings', {
			primaryFormat: settings.primaryFormat,
			alternateFormat: settings.alternateFormat,
			plainTextByDefault: settings.plainTextByDefault
		});
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
				// Strip markdown from the word under cursor
				textToProcess = stripMarkdown(wordAtCursor.word);
				const parsedDate = DateParser.parseDate(textToProcess, this);
				if (!parsedDate) {
					return { errorNotice: `Text at cursor ("${textToProcess}") doesn't seem to be a date for ${commandContext}.`, textToProcessContext: textToProcess };
				}
				from = wordAtCursor.from;
				to = wordAtCursor.to;
				return { textToProcess, parsedDate, from, to }; // Success for wordAtCursor
			} else { // No word at cursor, no selection
				return { errorNotice: `No text selected and no date-like text found at cursor for ${commandContext}.` };
			}
		} else {
			// Strip markdown from the selected text
			textToProcess = stripMarkdown(textToProcess);
			const parsedDate = DateParser.parseDate(textToProcess, this);
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
		debug(this, 'parseDateAsLink', 'parseDateAsLink called');
		const parseInfo = this.getInitialTextAndParseInfo(editor, 'converting to link');

		if ('errorNotice' in parseInfo) { // Type guard for DateCommandParseError
			warn(this, 'parseDateAsLink', `Parse failed for date link conversion: ${parseInfo.errorNotice}`);
			new Notice(parseInfo.errorNotice);
			return;
		}
		// If here, parseInfo is DateCommandParseSuccess
		const { textToProcess, parsedDate, from, to } = parseInfo;
		debug(this, 'parseDateAsLink', 'Successfully parsed date for link conversion:', {
			textToProcess,
			parsedDate: parsedDate.toISOString(),
			from,
			to
		});

		if (!view.file) {
			error(this, 'parseDateAsLink', 'Cannot create link - file not saved');
			new Notice('Cannot create link: file not saved');
			return;
		}

		const link = createDailyNoteLink(
			this.app,
			this.settings,
			view.file,
			textToProcess // textToProcess is string here
		);
		debug(this, 'parseDateAsLink', 'Created daily note link:', link);

		if (from !== null && to !== null) { // from and to are number | null here
			const cursor = editor.getCursor(); // Original cursor position
			// Inside this block, from and to are narrowed to number
			editor.replaceRange(link, { line: cursor.line, ch: from }, { line: cursor.line, ch: to });
			info(this, 'parseDateAsLink', 'Successfully replaced text with date link');
			if (cursor.ch === from) { // If original cursor was at the start of the replaced text
				editor.setCursor({ line: cursor.line, ch: from }); // Set to start of new text
			} else {
				editor.setCursor({ line: cursor.line, ch: from + link.length }); // Set to end of new text
			}
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
		const { textToProcess, parsedDate, from, to } = parseInfo;        const dailyNoteSettings = getDailyNoteSettings();
		const momentDate = moment(parsedDate); // parsedDate is Date here

		const formattedDate = DateFormatter.getFormattedDateText(
			textToProcess, // textToProcess is string here
			momentDate,
			this.settings,
			ContentFormat.PRIMARY,
			dailyNoteSettings,
			this
		);

		if (from !== null && to !== null) {
			const cursor = editor.getCursor(); // Original cursor position
			editor.replaceRange(formattedDate, { line: cursor.line, ch: from }, { line: cursor.line, ch: to });
			if (cursor.ch === from) { // If original cursor was at the start of the replaced text
				editor.setCursor({ line: cursor.line, ch: from }); // Set to start of new text
			} else {
				editor.setCursor({ line: cursor.line, ch: from + formattedDate.length }); // Set to end of new text
			}
		} else {
			editor.replaceSelection(formattedDate);
		}
	}

	// New methods for processing all dates in the note

	private async parseAllDatesInNoteInternal(editor: Editor, view: MarkdownView, asLink: boolean, forceTextAsAliasForLink: boolean = false): Promise<void> {
		const originalCursor = editor.getCursor();
		const lastLine = editor.lastLine();
		const changes: { from: { line: number, ch: number }, to: { line: number, ch: number }, text: string }[] = [];
		let count = 0;

		for (let lineNum = 0; lineNum <= lastLine; lineNum++) {
			const rawLine = editor.getLine(lineNum);
			const { text: stripped, map } = stripFormattingWithMap(rawLine);
			const results = chrono.parse(stripped);
			for (const r of results) {
				const phrase = r.text;
				const startIx = r.index;
				const endIx = startIx + phrase.length;
				const fromCh = map[startIx];
				const toCh = map[endIx - 1] + 1;
				let replacement: string;
				if (asLink) {
					if (!view.file) continue;
					replacement = createDailyNoteLink(this.app, this.settings, view.file, phrase, forceTextAsAliasForLink);
				} else {
					const m = moment(r.start.date());
					replacement = DateFormatter.getFormattedDateText(phrase, m, this.settings, ContentFormat.PRIMARY, getDailyNoteSettings(), this);
				}
				changes.push({ from: { line: lineNum, ch: fromCh }, to: { line: lineNum, ch: toCh }, text: replacement });
				count++;
			}
		}

		if (changes.length > 0) {
			editor.transaction({ changes });
			new Notice(`Replaced ${count} date/time phrase(s) in the note.`);
		} else {
			new Notice('No date/time phrases found to replace in the note.');
		}
		editor.setCursor(originalCursor);
	}
	
	/**
	 * Scans the entire note for date/time phrases and replaces them with daily note links.
	 */
	public async parseAllDatesAsLinks(editor: Editor, view: MarkdownView): Promise<void> {
		debug(this, 'parseAllDatesAsLinks', 'parseAllDatesAsLinks called');
		if (!view.file) {
			error(this, 'parseAllDatesAsLinks', 'Cannot process note - current view is not a markdown editor');
			new Notice('Cannot process note: Current view is not a markdown editor.');
			return;
		}
		info(this, 'parseAllDatesAsLinks', 'Starting to parse all dates as links in note');
		await this.parseAllDatesInNoteInternal(editor, view, true, false);
	}

	/**
	 * Scans the entire note for date/time phrases and replaces them with formatted plain text dates.
	 */
	public async parseAllDatesAsText(editor: Editor, view: MarkdownView): Promise<void> {        debug(this, 'parseAllDatesAsText', 'parseAllDatesAsText called');
		info(this, 'parseAllDatesAsText', 'Starting to parse all dates as text in note');
		await this.parseAllDatesInNoteInternal(editor, view, false);
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
			const cursor = editor.getCursor(); // Original cursor position
			editor.replaceRange(link, { line: cursor.line, ch: from }, { line: cursor.line, ch: to });
			if (cursor.ch === from) { // If original cursor was at the start of the replaced text
				editor.setCursor({ line: cursor.line, ch: from }); // Set to start of new text
			} else {
				editor.setCursor({ line: cursor.line, ch: from + link.length }); // Set to end of new text
			}
		} else {
			editor.replaceSelection(link);
		}
	}

	/**
	 * Scans the entire note for date/time phrases and replaces them with daily note links,
	 * keeping original text as alias.
	 */
	public async parseAllDatesAsLinksKeepOriginalTextAlias(editor: Editor, view: MarkdownView): Promise<void> {
		if (!view.file) {
			new Notice('Cannot process note: Current view is not a markdown editor.');
			return;
		}
		await this.parseAllDatesInNoteInternal(editor, view, true, true);
	}
}

