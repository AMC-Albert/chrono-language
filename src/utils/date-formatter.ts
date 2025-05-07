import { moment } from 'obsidian';
import { EnhancedDateParser } from './parser';
import { ContentFormat } from '../definitions/types';
import { getDatePreview, getDailyNotePreview } from './helpers';

/**
 * Centralized date formatting utility for consistent date handling across components
 */
export class DateFormatter {
    /**
     * Determine if only time should be rendered based on settings and date
     */
    public static shouldRenderTimeOnly(item: string, settings: any, momentDate: moment.Moment): boolean {
        return(
            settings.timeOnly &&
            settings.timeFormat && settings.timeFormat.trim() !== "" &&
            this.isTimeRelevantSuggestion(item) &&
            momentDate.isSame(moment(), 'day')
        );
    }

    /**
     * Determines if a suggestion contains specific time components
     */
    public static isTimeRelevantSuggestion(item: string): boolean {
        // Skip holidays
        const isHoliday = EnhancedDateParser.getHolidayNames().some(
            h => h.toLowerCase() === item.trim().toLowerCase()
        );
        if (isHoliday) return false;
        
        // Check if the date has specific time components
        const parsedDate = EnhancedDateParser.parseDate(item);
        if (!parsedDate) return false;
        
        const now = new Date();
        return (
            parsedDate.getHours() !== now.getHours() ||
            parsedDate.getMinutes() !== now.getMinutes() ||
            parsedDate.getSeconds() !== now.getSeconds()
        );
    }

    /**
     * Gets formatted text for a date suggestion based on content format
     */
    public static getFormattedDateText(
        item: string, 
        dailyNotePreview: string, 
        contentFormat: ContentFormat,
        settings: any,
        includeTime: boolean = true
    ): string {
        let result: string;
        
        switch (contentFormat) {
            case ContentFormat.SUGGESTION_TEXT:
                result = item;
                break;
            case ContentFormat.DAILY_NOTE:
                result = dailyNotePreview;
                break;
            case ContentFormat.ALTERNATE:
                result = getDatePreview(item, settings, true, false);
                break;
            default:
                result = getDatePreview(item, settings, false, false);
                break;
        }
        
        // Add time to time-relevant suggestions if timeFormat is set
        if (includeTime) {
            const timeFormat = settings.timeFormat;
            if (timeFormat && timeFormat.trim() !== "" && this.isTimeRelevantSuggestion(item)) {
                const parsedDate = EnhancedDateParser.parseDate(item);
                if (parsedDate) {
                    const formattedTime = moment(parsedDate).format(timeFormat);
                    result += ` ${formattedTime}`;
                }
            }
        }
        
        return result;
    }
}