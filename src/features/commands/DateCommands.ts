import { Editor, MarkdownView, Notice, moment } from 'obsidian';
import { DateParser } from '../suggestion-provider';
import { DateFormatter, createDailyNoteLink, debug, info, warn, error, registerLoggerClass } from '@/utils';
import { ContentFormat } from '@/types';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { QuickDatesSettings } from '@/settings';
import { TextSearcher } from './TextSearcher';
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
 * Provides comprehensive date manipulation functionality for Quick Dates plugin
 */
export class DateCommands {
	private app: any;
	private settings: QuickDatesSettings;

	constructor(app: any, settings: QuickDatesSettings) {
		this.app = app;
		this.settings = settings;
		registerLoggerClass(this, 'DateCommands');
		
		info(this, 'DateCommands component initialized with configuration', {
			primaryFormat: settings.primaryFormat || 'using daily note format',
			alternateFormat: settings.alternateFormat,
			plainTextByDefault: settings.plainTextByDefault,
			timeOnly: settings.timeOnly,
			timeFormat: settings.timeFormat || 'none configured'
		});
	}

	/**
	 * Updates the plugin settings reference and logs configuration changes
	 */
	updateSettings(settings: QuickDatesSettings): void {
		debug(this, 'Updating date commands settings configuration', {
			oldPrimaryFormat: this.settings.primaryFormat,
			newPrimaryFormat: settings.primaryFormat,
			oldPlainTextByDefault: this.settings.plainTextByDefault,
			newPlainTextByDefault: settings.plainTextByDefault,
			changedTimeFormat: this.settings.timeFormat !== settings.timeFormat
		});
		
		this.settings = settings;
		
		info(this, 'Date commands settings successfully updated', {
			primaryFormat: settings.primaryFormat || 'using daily note format',
			plainTextByDefault: settings.plainTextByDefault,
			timeOnly: settings.timeOnly
		});
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
	 * Parses selected text or word at cursor and replaces it with a date link
	 * Creates Obsidian-style wikilinks pointing to daily notes
	 */
	parseDateAsLink(editor: Editor, view: MarkdownView): void {
		debug(this, 'Processing user request to convert date text to daily note link');
		const parseInfo = this.getInitialTextAndParseInfo(editor, 'converting to link');

		if ('errorNotice' in parseInfo) {
			warn(this, 'Date parsing failed for link conversion', { 
				reason: parseInfo.errorNotice,
				context: parseInfo.textToProcessContext 
			});
			new Notice(parseInfo.errorNotice);
			return;
		}

		const { textToProcess, parsedDate, from, to } = parseInfo;
		debug(this, 'Successfully parsed date text for link conversion', {
			originalText: textToProcess,
			parsedDate: parsedDate.toISOString(),
			selectionBounds: from !== null && to !== null ? { from, to } : 'using selection',
			targetFile: view.file?.path
		});

		if (!view.file) {
			error(this, 'Cannot create daily note link - active file not saved to vault', {
				hasActiveView: !!view,
				fileStatus: 'unsaved'
			});
			new Notice('Cannot create link: file not saved');
			return;
		}

		debug(this, 'Generating daily note link from parsed date');
		const link = createDailyNoteLink(
			this.app,
			this.settings,
			view.file,
			textToProcess
		);

		debug(this, 'Replacing original text with generated daily note link', {
			originalText: textToProcess,
			generatedLink: link,
			linkLength: link.length
		});

		if (from !== null && to !== null) {
			const cursor = editor.getCursor();
			editor.replaceRange(link, { line: cursor.line, ch: from }, { line: cursor.line, ch: to });
			
			debug(this, 'Adjusting cursor position after link replacement');
			if (cursor.ch === from) {
				editor.setCursor({ line: cursor.line, ch: from });
			} else {
				editor.setCursor({ line: cursor.line, ch: from + link.length });
			}
		} else {
			editor.replaceSelection(link);
		}

		info(this, 'Successfully converted date text to daily note link', {
			originalText: textToProcess,
			linkGenerated: link,
			operation: 'date to link conversion'
		});
	}	/**
	 * Parses selected text and replaces it with a formatted date text
	 * Respects time component detection and user format preferences
	 */
	parseDateAsText(editor: Editor, view: MarkdownView): void {
		debug(this, 'Processing user request to convert date text to formatted plain text');
		const parseInfo = this.getInitialTextAndParseInfo(editor, 'converting to plain text');

		if ('errorNotice' in parseInfo) {
			warn(this, 'Date parsing failed for text conversion', { 
				reason: parseInfo.errorNotice,
				context: parseInfo.textToProcessContext 
			});
			new Notice(parseInfo.errorNotice);
			return;
		}

		const { textToProcess, parsedDate, from, to } = parseInfo;
		debug(this, 'Successfully parsed date text for plain text conversion', {
			originalText: textToProcess,
			parsedDate: parsedDate.toISOString(),
			targetFormat: this.settings.primaryFormat || 'daily note format'
		});

		const dailyNoteSettings = getDailyNoteSettings();
		const momentDate = moment(parsedDate);

		debug(this, 'Applying date formatting with user preferences');
		const formattedDate = DateFormatter.getFormattedDateText(
			textToProcess,
			momentDate,
			this.settings,
			ContentFormat.PRIMARY,
			dailyNoteSettings,
			this
		);

		debug(this, 'Replacing original text with formatted date', {
			originalText: textToProcess,
			formattedText: formattedDate,
			formatUsed: this.settings.primaryFormat || 'daily note format'
		});
		if (from !== null && to !== null) {
			const cursor = editor.getCursor();
			editor.replaceRange(formattedDate, { line: cursor.line, ch: from }, { line: cursor.line, ch: to });
			
			debug(this, 'Adjusting cursor position after text replacement');
			if (cursor.ch === from) {
				editor.setCursor({ line: cursor.line, ch: from });
			} else {
				editor.setCursor({ line: cursor.line, ch: from + formattedDate.length });
			}
		} else {
			editor.replaceSelection(formattedDate);
		}

		info(this, 'Successfully converted date text to formatted plain text', {
			originalText: textToProcess,
			formattedResult: formattedDate,
			operation: 'date to text conversion'
		});
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

