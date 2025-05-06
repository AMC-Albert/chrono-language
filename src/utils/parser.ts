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
        
        // Process holidays for current and next year in one loop
        this.processHolidaysForYears([currentYear, currentYear + 1]);
        
        // Add common holiday aliases
        this.addHolidayAliases({
            "Xmas": 'christmas',
            "X-mas": 'christmas',
            "July 4th": 'independence day',
            "4th of July": 'independence day',
        });
    }
    
    /**
     * Process holidays for multiple years
     */
    private static processHolidaysForYears(years: number[]): void {
        years.forEach(year => {
            const holidays = this.holidaysInstance.getHolidays(year);
            holidays.forEach(this.addHolidayToCache.bind(this));
        });
    }
    
    /**
     * Add a holiday to the cache
     */
    private static addHolidayToCache(holiday: any): void {
        const name = holiday.name;
        const lowerName = name.toLowerCase();
        const date = new Date(holiday.date);
        
        if (!this.holidayCache.has(lowerName)) {
            this.holidayCache.set(lowerName, { name, dates: [date] });
        } else {
            this.holidayCache.get(lowerName)!.dates.push(date);
        }
        
        // Also add short names as aliases
        const shortName = lowerName.split(' ')[0];
        if (shortName.length > 3) {
            if (!this.holidayCache.has(shortName)) {
                this.holidayCache.set(shortName, { name, dates: [date] });
            } else {
                this.holidayCache.get(shortName)!.dates.push(date);
            }
        }
    }
    
    /**
     * Add aliases for holidays
     */
    private static addHolidayAliases(aliases: Record<string, string>): void {
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
     */
    private static checkForHoliday(text: string): Date | null {
        if (!this.holidaysInstance) {
            this.initHolidays();
        }

        const cleanedText = text.toLowerCase().trim();
        
        // Direct match in cache
        if (this.holidayCache.has(cleanedText)) {
            return this.getNextUpcomingDate(this.holidayCache.get(cleanedText)!.dates);
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
     */
    private static getNextUpcomingDate(dates: Date[]): Date | null {
        const now = new Date();
        const sorted = dates.slice().sort((a, b) => a.getTime() - b.getTime());
        
        // Find the first date in the future
        const futureDate = sorted.find(date => date >= now);
        
        // Return future date or the latest past date if no future dates exist
        return futureDate || (sorted.length > 0 ? sorted[sorted.length - 1] : null);
    }

    /**
     * Modifies input text to enhance date parsing capabilities
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
        if (/\d$/.test(trimmedText) && 
           (/^in \d+$/.test(modifiedText) || /^\d+$/.test(trimmedText))) {
            modifiedText = `${modifiedText} days`;
        }
        
        return modifiedText;
    }

    /**
     * Common parsing logic used by both parseDate and parse methods
     */
    private static handleParsing(text: string): { 
        holidayDate: Date | null, 
        modifiedText: string 
    } {
        if (!text) return { holidayDate: null, modifiedText: "" };
        
        // Check for holiday first
        const holidayDate = this.checkForHoliday(text);
        
        // Only enhance text if not a holiday
        const modifiedText = holidayDate ? text : this.enhanceText(text);
        
        return { holidayDate, modifiedText };
    }

    /**
     * Parse a date string with enhanced capabilities
     */
    static parseDate(text: string): Date | null {
        const { holidayDate, modifiedText } = this.handleParsing(text);
        return holidayDate || chrono.parseDate(modifiedText);
    }

    /**
     * Parse all possible dates from the text
     */
    static parse(text: string): chrono.ParsedResult[] {
        const { holidayDate, modifiedText } = this.handleParsing(text);
        
        if (holidayDate) {
            // Create a chrono-like result for the holiday
            return [{
                start: {
                    date: () => holidayDate
                },
                end: null,
                index: 0,
                text: text,
                ref: new Date()
            } as chrono.ParsedResult];
        }
        
        return chrono.parse(modifiedText);
    }

    /**
     * Get a list of all available holidays for the current locale and year
     */
    static getHolidayNames(): string[] {
        if (!this.holidaysInstance) {
            this.initHolidays();
        }
        // Return unique, capitalized holiday names
        return Array.from(new Set(
            Array.from(this.holidayCache.values()).map(v => v.name)
        ));
    }
}