import { moment } from 'obsidian';
import { EnhancedDateParser } from './parser';
import { ContentFormat } from '../definitions/types';
import { ChronoLanguageSettings, DEFAULT_SETTINGS } from '../settings';
import { getDailyNoteSettings, DEFAULT_DAILY_NOTE_FORMAT } from 'obsidian-daily-notes-interface';

/**
 * Centralized date formatting utility for consistent date handling across components
 */
export class DateFormatter {
    /**
     * Determine if only time should be rendered based on settings and date
     */
    public static shouldRenderTimeOnly(item: string, settings: ChronoLanguageSettings, momentDate: moment.Moment): boolean {
        return (
            settings.timeOnly &&
            !!settings.timeFormat && settings.timeFormat.trim() !== "" &&
            EnhancedDateParser.inputHasTimeComponent(item) &&
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
        settings: ChronoLanguageSettings, // For formats, timeFormat, timeOnly
        contentFormat: ContentFormat,
        dailyNoteSettings: ReturnType<typeof getDailyNoteSettings> // Explicit type for daily note settings
    ): string {
        if (!momentDate || !momentDate.isValid()) {
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
        const isItemTimeRelevant = EnhancedDateParser.inputHasTimeComponent(itemText);
    
        // Apply time formatting if applicable
        if (settings.timeFormat && settings.timeFormat.trim() !== "" && isItemTimeRelevant) {
            const timeString = momentDate.format(settings.timeFormat);
            const isToday = momentDate.isSame(moment(), 'day');
    
            if (settings.timeOnly && isToday) {
                return timeString; // Override baseText with time only
            } else {
                // Avoid appending time if the base format string already likely includes it (heuristic)
                const baseIncludesTime = /[HhmsSaAZ]/.test(baseFormatString);
                if (!baseIncludesTime) {
                    // Insert custom separator between date and time
                    return `${formattedDate}${settings.timeSeparator}${timeString}`;
                }
            }
        }
    
        return formattedDate; // Return baseText if no time formatting is applied or base included time
    }
}