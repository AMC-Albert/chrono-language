import { moment } from 'obsidian';
import { getDailyNoteSettings, DEFAULT_DAILY_NOTE_FORMAT } from 'obsidian-daily-notes-interface';
import { QuickDatesSettings } from '@/settings';
import { DateParser } from '@/features/suggestion-provider/DateParser';
import { ContentFormat } from '@/types';
import { DEFAULT_SETTINGS } from '@/settings';
import { loggerDebug, loggerInfo, loggerWarn, loggerError } from './obsidian-logger';

/**
 * Centralized date formatting utility for consistent date handling across components
 */
export class DateFormatter {
	/**
	 * Determine if only time should be rendered based on settings and date
	 */
	public static shouldRenderTimeOnly(
		item: string, 
		settings: QuickDatesSettings, 
		momentDate: moment.Moment,
		context?: unknown
	): boolean {
		return (
			settings.timeOnly &&
			!!settings.timeFormat && settings.timeFormat.trim() !== "" &&
			DateParser.inputHasTimeComponent(item, context) &&
			momentDate.isSame(moment(), 'day')
		);
	}

	/**
	 * Gets formatted text for a date suggestion based on content format,
	 * incorporating time formatting logic (timeOnly, append time).
	 */
	public static getFormattedDateText(
		itemText: string, // Original suggestion text for time relevance and SUGGESTION_TEXT format
		momentDate: moment.Moment, // Parsed date
		settings: QuickDatesSettings, // For formats, timeFormat, timeOnly
		contentFormat: ContentFormat,
		dailyNoteSettings: ReturnType<typeof getDailyNoteSettings>, // Explicit type for daily note settings
		context?: unknown // Optional context for logging (typically 'this' from calling class)
	): string {
		const logContext = context || 'DateFormatter';
		loggerDebug(logContext, `Processing ${itemText} -> ${contentFormat}`);
		if (!momentDate || !momentDate.isValid()) {
			loggerWarn(logContext, 'Invalid date, falling back to item text', { itemText });
			return itemText; // Fallback for invalid dates
		}

		if (contentFormat === ContentFormat.SUGGESTION_TEXT) {
			return itemText; // SUGGESTION_TEXT format should return the item text as is.
		}
	
		let baseFormatString: string;
		switch (contentFormat) {
			case ContentFormat.DAILY_NOTE:
				baseFormatString = dailyNoteSettings.format || DEFAULT_DAILY_NOTE_FORMAT;
				break;
			case ContentFormat.ALTERNATE:
				baseFormatString = settings.alternateFormat || DEFAULT_SETTINGS.alternateFormat;
				break;
			case ContentFormat.PRIMARY:
			default:
				baseFormatString = settings.primaryFormat || dailyNoteSettings.format || DEFAULT_DAILY_NOTE_FORMAT;
				break;
		}
		
		let formattedDate = momentDate.format(baseFormatString);
		const isItemTimeRelevant = DateParser.inputHasTimeComponent(itemText, context);
	
		// Apply time formatting if applicable
		if (settings.timeFormat && settings.timeFormat.trim() !== "" && isItemTimeRelevant) {
			const timeString = momentDate.format(settings.timeFormat);
			const isToday = momentDate.isSame(moment(), 'day');
	
			if (settings.timeOnly && isToday) {
				loggerDebug(logContext, 'Using time-only format', { timeString });
				return timeString; // Override baseText with time only
			} else {
				// Avoid appending time if the base format string already likely includes it (heuristic)
				const baseIncludesTime = /[HhmsSaAZ]/.test(baseFormatString);
				if (!baseIncludesTime) {
					// Insert custom separator between date and time
					const result = `${formattedDate}${settings.timeSeparator}${timeString}`;
					loggerDebug(logContext, 'Appended time to date', {
						formattedDate,
						timeString,
						result 
					});
					return result;
				}
			}
		}

		loggerDebug(logContext, 'Returning formatted date', formattedDate);
		return formattedDate; // Return baseText if no time formatting is applied or base included time
	}
}

/**
 * Returns a human readable preview of the parsed date
 * @param dateText Text to parse as a date
 * @param settings Plugin settings
 * @param useAlternateFormat If true, uses the alternate format instead of primary
 * @param forceNoAlias If true, forces no alias in the link (only relevant for links)
 * @param forceDailyNoteFormat If true, returns the daily note format
 * @returns Human readable date preview
 */
export function getDatePreview(
	dateText: string, 
	settings: QuickDatesSettings, 
	useAlternateFormat = false, 
	forceNoAlias = false, 
	forceDailyNoteFormat = false
): string {
	let dailyNoteSettings = getDailyNoteSettings();
	
	if (!dateText) return '';
	
	const parsedDate = DateParser.parseDate(dateText);
	if (!parsedDate) return '';
	
	// Determine which format to use
	let format;
	if (forceDailyNoteFormat) {
		format = dailyNoteSettings.format || DEFAULT_DAILY_NOTE_FORMAT;
	} else if (forceNoAlias && !forceDailyNoteFormat) {
		// Only return empty when forceNoAlias is true AND we're not forcing daily note format
		return '';
	} else if (useAlternateFormat && settings.alternateFormat) {
		format = settings.alternateFormat;
	} else {
		format = settings.primaryFormat || dailyNoteSettings.format || DEFAULT_DAILY_NOTE_FORMAT;
	}
		return moment(parsedDate).format(format);
}

