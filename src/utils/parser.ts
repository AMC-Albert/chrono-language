import * as chrono from 'chrono-node';
import Holidays from 'date-holidays';

/**
 * Enhanced date parsing that adds additional capabilities to chrono
 * - If text starts with a number, prepends "in " to handle relative dates better
 * - If text ends with a number, appends " days" to handle relative dates better
 * - Supports holiday names across different locales
 */
export class EnhancedDateParser {
    private static holidaysInstance: any = null;
    private static holidayCache: Map<string, Date> = new Map();
    private static currentYear = new Date().getFullYear();
    private static currentLocale = 'US';

    /**
     * Initialize holidays with specific locale
     * @param locale Locale code (e.g., 'US', 'GB', 'DE')
     */
    static initHolidays(locale: string = 'US'): void {
        try {
            this.holidaysInstance = new Holidays(locale);
            this.currentLocale = locale;
            this.refreshHolidayCache();
        } catch (error) {
            console.error('Failed to initialize holidays for locale:', locale, error);
            // Fallback to US if specified locale fails
            if (locale !== 'US') {
                this.holidaysInstance = new Holidays('US');
                this.currentLocale = 'US';
                this.refreshHolidayCache();
            }
        }
    }

    /**
     * Refresh the holiday cache for the current and next year
     */
    private static refreshHolidayCache(): void {
        if (!this.holidaysInstance) {
            this.initHolidays();
        }

        this.holidayCache.clear();
        const currentYear = this.currentYear;
        
        // Get holidays for current year and next year
        [currentYear, currentYear + 1].forEach(year => {
            const holidays = this.holidaysInstance.getHolidays(year);
            holidays.forEach((holiday: any) => {
                const name = holiday.name.toLowerCase();
                const date = new Date(holiday.date);
                this.holidayCache.set(name, date);
                
                // Also add short names and common variations
                const shortName = name.split(' ')[0].toLowerCase();
                if (shortName.length > 3 && !this.holidayCache.has(shortName)) {
                    this.holidayCache.set(shortName, date);
                }
            });
        });

        // Add common holiday aliases that might not be in the library
        const aliases: Record<string, string> = {
            'xmas': 'christmas',
            'x-mas': 'christmas',
            'new years': 'new year\'s day',
            'new years day': 'new year\'s day',
            'new years eve': 'new year\'s eve',
            'july 4th': 'independence day',
            '4th of july': 'independence day',
            'valentine': 'valentine\'s day',
        };

        Object.entries(aliases).forEach(([alias, official]) => {
            if (this.holidayCache.has(official)) {
                this.holidayCache.set(alias, this.holidayCache.get(official)!);
            }
        });
    }

    /**
     * Set or update the locale for holiday detection
     * @param locale Locale code (e.g., 'US', 'GB', 'DE')
     */
    static setLocale(locale: string): void {
        if (this.currentLocale !== locale) {
            this.initHolidays(locale);
        }
    }

    /**
     * Check if text contains a holiday reference and return the date if found
     * @param text Text to check for holiday references
     * @returns Date of the holiday if found, null otherwise
     */
    private static checkForHoliday(text: string): Date | null {
        if (!this.holidaysInstance) {
            this.initHolidays();
        }

        // Clean and normalize the input
        const cleanedText = text.toLowerCase().trim();
        
        // Direct match in cache
        if (this.holidayCache.has(cleanedText)) {
            return this.holidayCache.get(cleanedText)!;
        }

        // Try to find partial matches
        for (const [holiday, date] of this.holidayCache.entries()) {
            if (cleanedText.includes(holiday) || holiday.includes(cleanedText)) {
                return date;
            }
        }

        return null;
    }

    /**
     * Modifies input text to enhance date parsing capabilities
     * @param text Text to modify
     * @returns Modified text for better date parsing
     */
    private static enhanceText(text: string): string {
        if (!text) return text;
        
        const trimmedText = text.trim();
        let modifiedText = trimmedText;
        
        // If text starts with a number, prepend "in " for better relative date parsing
        if (/^\d/.test(trimmedText)) {
            modifiedText = `in ${trimmedText}`;
        }
        
        // If text ends with a number, append " days" for better relative date parsing
        if (/\d$/.test(trimmedText)) {
            // Check if it's just "in X" or "X"
            if (/^in \d+$/.test(modifiedText) || /^\d+$/.test(trimmedText)) {
                modifiedText = `${modifiedText} days`;
            }
        }
        
        return modifiedText;
    }

    /**
     * Parse a date string with enhanced capabilities
     * @param text Text to parse
     * @returns Parsed date or null if parsing failed
     */
    static parseDate(text: string): Date | null {
        if (!text) return null;
        
        // First check if it's a recognized holiday
        const holidayDate = this.checkForHoliday(text);
        if (holidayDate) {
            return holidayDate;
        }
        
        // Fall back to regular parsing
        const modifiedText = this.enhanceText(text);
        return chrono.parseDate(modifiedText);
    }

    /**
     * Parse all possible dates from the text
     * @param text Text to parse
     * @returns Array of parsed results
     */
    static parse(text: string): chrono.ParsedResult[] {
        if (!text) return [];
        
        // If it's a recognized holiday, create a custom result
        const holidayDate = this.checkForHoliday(text);
        if (holidayDate) {
            // Create a chrono-like result for the holiday
            const result: any = {
                start: {
                    date: () => holidayDate
                },
                end: null,
                index: 0,
                text: text,
                ref: new Date()
            };
            return [result];
        }
        
        // Fall back to regular parsing
        const modifiedText = this.enhanceText(text);
        return chrono.parse(modifiedText);
    }

    /**
     * Get a list of all available holidays for the current locale and year
     * @returns Array of holiday names
     */
    static getHolidayNames(): string[] {
        if (!this.holidaysInstance) {
            this.initHolidays();
        }
        
        return Array.from(this.holidayCache.keys());
    }
}