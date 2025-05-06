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
    private static holidayCache: Map<string, { name: string, dates: Date[] }> = new Map();
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
                const name = holiday.name;
                const lowerName = name.toLowerCase();
                const date = new Date(holiday.date);
                if (!this.holidayCache.has(lowerName)) {
                    this.holidayCache.set(lowerName, { name, dates: [date] });
                } else {
                    this.holidayCache.get(lowerName)!.dates.push(date);
                }
                
                // Also add short names and common variations
                const shortName = lowerName.split(' ')[0];
                if (shortName.length > 3) {
                    if (!this.holidayCache.has(shortName)) {
                        this.holidayCache.set(shortName, { name, dates: [date] });
                    } else {
                        this.holidayCache.get(shortName)!.dates.push(date);
                    }
                }
            });
        });

        // Add common holiday aliases that might not be in the library
        const aliases: Record<string, string> = {
            "Xmas": 'christmas',
            "X-mas": 'christmas',
            "July 4th": 'independence day',
            "4th of July": 'independence day',
        };

        Object.entries(aliases).forEach(([alias, official]) => {
            const lowerAlias = alias.toLowerCase();
            if (this.holidayCache.has(official)) {
                const { dates } = this.holidayCache.get(official)!;
                this.holidayCache.set(lowerAlias, { name: alias, dates: [...dates] });
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
            const { dates } = this.holidayCache.get(cleanedText)!;
            return this.getNextUpcomingDate(dates);
        }

        // Try to find partial matches
        for (const [holiday, obj] of this.holidayCache.entries()) {
            if (cleanedText.includes(holiday) || holiday.includes(cleanedText)) {
                return this.getNextUpcomingDate(obj.dates);
            }
        }

        return null;
    }

    /**
     * Get the next upcoming date from a list of dates
     * @param dates Array of dates
     * @returns Next upcoming date or null if none found
     */
    private static getNextUpcomingDate(dates: Date[]): Date | null {
        const now = new Date();
        // Sort dates and return the soonest date that is today or in the future
        const sorted = dates.slice().sort((a, b) => a.getTime() - b.getTime());
        for (const date of sorted) {
            if (date >= now) return date;
        }
        // If all dates are in the past, return the latest one
        return sorted.length > 0 ? sorted[sorted.length - 1] : null;
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
        // First check if it's a recognized holiday (before enhancing text)
        const holidayDate = this.checkForHoliday(text);
        if (holidayDate) {
            return holidayDate;
        }
        // Only enhance text if not a holiday
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
        // First check if it's a recognized holiday (before enhancing text)
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
        // Only enhance text if not a holiday
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
        // Return unique, capitalized holiday names
        const names = new Set<string>();
        for (const { name } of this.holidayCache.values()) {
            names.add(name);
        }
        return Array.from(names);
    }
}