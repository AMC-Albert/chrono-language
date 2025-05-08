import * as chrono from 'chrono-node';
import Holidays from 'date-holidays';
import { COMMON_STRINGS, DAYS_OF_THE_WEEK, MONTHS_OF_THE_YEAR, TIME_OF_DAY_PHRASES, HOLIDAY_ALIASES } from '../../constants';

/**
 * Enhanced date parsing that adds additional capabilities to chrono
 * - If text starts with a number, prepends "in " to handle relative dates better
 * - If text ends with a number, appends " days" to handle relative dates better
 * - Supports holiday names across different locales
 *
 * NOTE: This parser is used by multiple features (suggestion-provider, open-daily-note, helpers, etc.).
 * If you refactor or move this file, update all relevant imports.
 */
export class DateParser {
    private static holidaysInstance: any = null;
    private static holidayCache: Map<string, { name: string, dates: Date[] }> = new Map();
    private static currentYear = new Date().getFullYear();
    private static currentLocale = 'US';

    private static capitalizeFirstLetter(text: string): string {
        if (!text) return text;
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    // Define suggestion generators with their pattern matching and output generation logic
    private static suggestionGenerators: Array<{
        pattern: RegExp | ((input: string) => boolean); 
        generate: (input: string, match?: RegExpMatchArray) => string[];
        priority?: number; // Higher priority generators run first
    }> = [
        // Numbers - suggest time units (for "in 3" -> "in 3 days", "in 3 weeks", etc.)
        // Handles "3", "in 3", "in3"
        // Removed $ from end of regex to allow subsequent characters (e.g., "in 3 d" can still trigger "in 3 days")
        {
            pattern: /^(?:in\s*)?(\d+)/i, 
            generate: (fullInput: string, matchDetails?: RegExpMatchArray) => {
                if (!matchDetails) return [];
                const num = matchDetails[1]; // The captured number
                const matchedString = matchDetails[0]; // The part of fullInput that matched (e.g., "in 3", "in3" or "3")

                // Determine prefix based on what was actually matched by the regex
                const prefix = matchedString.toLowerCase().startsWith('in') ? 
                               matchedString.substring(0, matchedString.toLowerCase().indexOf(num)) : // "in" or "in " or "in" (from in3)
                               'in '; // Default if only number was matched
                
                const baseSuggestions = [
                    `${prefix}${num} days`,
                    `${prefix}${num} weeks`,
                    `${prefix}${num} months`,
                    `${prefix}${num} hours`,
                    `${prefix}${num} minutes`,
                    `${prefix}${num} years`
                ];
                return baseSuggestions.map(s => DateParser.capitalizeFirstLetter(s));
            },
            priority: 100
        },
        // "this", "next", "last" patterns
        {
            pattern: /^(this|next|last)\s?/i, // Removed $ to allow subsequent characters
            generate: (fullInput: string, matchDetails?: RegExpMatchArray) => {
                if (!matchDetails || !matchDetails[1]) return []; // Ensure matchDetails and captured group exist

                const prefixKeyword = matchDetails[1].toLowerCase(); // "this", "next", or "last"
                // fullInput is the original trimmed input, e.g., "next m" or "next month"
                // matchDetails[0] is what the regex matched, e.g., "next " or "next"
                const remainder = fullInput.substring(matchDetails[0].length).toLowerCase().trimStart();

                const timeUnits = [ // Units maintain their desired capitalization for the final string
                    COMMON_STRINGS.WEEK, COMMON_STRINGS.MONTH, COMMON_STRINGS.YEAR, 
                    ...DAYS_OF_THE_WEEK,
                    // Intentionally not adding MONTHS_OF_THE_YEAR here as "Next January" is less common than "January" alone
                    // and "January" is handled by the month prefix generator.
                    // If "Next January" type suggestions are desired, MONTHS_OF_THE_YEAR can be added here.
                ];

                let generatedSuggestions: string[];

                if (remainder) {
                    // Filter timeUnits based on the remainder
                    const matchingUnits = timeUnits.filter(unit => 
                        unit.toLowerCase().startsWith(remainder)
                    );
                    generatedSuggestions = matchingUnits.map(unit => `${prefixKeyword} ${unit}`);
                } else {
                    // If no remainder (e.g., input is "next" or "next "), suggest all time units
                    generatedSuggestions = timeUnits.map(unit => `${prefixKeyword} ${unit}`);
                }
                
                return generatedSuggestions.map(s => DateParser.capitalizeFirstLetter(s));
            },
            priority: 90
        },
        // Day of week prefixes
        {
            pattern: (input: string) => {
                const lower = input.trim().toLowerCase();
                return lower.length > 0 && DAYS_OF_THE_WEEK.some(d => d.toLowerCase().startsWith(lower));
            },
            generate: (input: string) => {
                const lower = input.trim().toLowerCase();
                return DAYS_OF_THE_WEEK.filter(d => d.toLowerCase().startsWith(lower));
            },
            priority: 85
        },
        // Weekday with week qualifier (e.g., 'Monday next week')
        {
            pattern: (input: string) => {
                const parts = input.trim().toLowerCase().split(/\s+/);
                return parts.length >= 2
                    && DAYS_OF_THE_WEEK.some(d => d.toLowerCase().startsWith(parts[0]))
                    && ['this','next','last'].some(q => q.startsWith(parts[1]));
            },
            generate: (input: string) => {
                const parts = input.trim().toLowerCase().split(/\s+/);
                const cap = DateParser.capitalizeFirstLetter;
                const suggestions: string[] = [];
                DAYS_OF_THE_WEEK.forEach(day => {
                    if (!day.toLowerCase().startsWith(parts[0])) return;
                    ['this','next','last'].forEach(q => {
                        if (!q.startsWith(parts[1])) return;
                        const phrase = `${day} ${q} week`;
                        if (phrase.toLowerCase().startsWith(input.trim().toLowerCase())) suggestions.push(phrase);
                    });
                });
                return suggestions;
            },
            priority: 82
        },
        // Month prefixes
        {
            pattern: /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
            generate: (input: string) => {
                const lowerInput = input.toLowerCase();
                return MONTHS_OF_THE_YEAR.filter(month => month.toLowerCase().startsWith(lowerInput));
                             // No need to capitalize, as they are already capitalized in the constant array
            },
            priority: 80
        },
        // Common relative dates
        {
            pattern: /^(to|ye|tom)/i, // today, yesterday, tomorrow
            generate: (input: string) => {
                const lowerInput = input.toLowerCase();
                const options = [COMMON_STRINGS.TODAY, COMMON_STRINGS.TOMORROW, COMMON_STRINGS.YESTERDAY];
                return options.filter(opt => opt.startsWith(lowerInput))
                              .map(opt => DateParser.capitalizeFirstLetter(opt));
            },
            priority: 70
        },
        // Partial relative-day + time-of-day combos (e.g., 'tomorrow mo')
        {
            pattern: (input: string) => {
                const parts = input.trim().toLowerCase().split(/\s+/);
                return parts.length === 2 && ['today', 'tomorrow', 'yesterday'].includes(parts[0]) && parts[1].length > 0;
            },
            generate: (input: string) => {
                const parts = input.trim().split(/\s+/);
                const day = parts[0];
                const after = parts[1].toLowerCase();
                const cap = DateParser.capitalizeFirstLetter;
                return TIME_OF_DAY_PHRASES.filter(p => p.toLowerCase().startsWith(after))
                    .map(p => `${cap(day)} ${p.toLowerCase()}`);
            },
            priority: 65
        },
        // Time-of-day phrases (e.g., Noon, Midday, etc.)
        {
            pattern: (input: string) => {
                const lower = input.trim().toLowerCase();
                if (lower.length < 1) return false;
                return TIME_OF_DAY_PHRASES.some(phrase => phrase.toLowerCase().startsWith(lower));
            },
            generate: (input: string) => {
                const lower = input.trim().toLowerCase();
                return TIME_OF_DAY_PHRASES.filter(phrase => phrase.toLowerCase().startsWith(lower));
            },
            priority: 60
        },
        // Weekend suggestions with partial matching
        {
            pattern: (input: string) => {
                const trimmed = input.trim().toLowerCase();
                const parts = trimmed.split(/\s+/);
                if (parts.length === 1) return 'weekend'.startsWith(parts[0]) && parts[0].length > 0;
                if (parts.length === 2 && ['this', 'next'].includes(parts[0]) ) return 'weekend'.startsWith(parts[1]);
                return false;
            },
            generate: (input: string) => {
                const parts = input.trim().toLowerCase().split(/\s+/);
                const cap = DateParser.capitalizeFirstLetter;
                if (parts.length === 2 && ['this', 'next'].includes(parts[0])) {
                    return [`${cap(parts[0])} weekend`];
                }
                return ['This weekend', 'Next weekend'];
            },
            priority: 55
        },
        // Start/end of period suggestions with partial matching
        {
            pattern: (input: string) => {
                const trimmed = input.trim().toLowerCase();
                return trimmed.startsWith('st') || trimmed.startsWith('end') || trimmed.startsWith('start o');
            },
            generate: (input: string) => {
                const trimmed = input.trim().toLowerCase();
                const cap = DateParser.capitalizeFirstLetter;
                const suggestions: string[] = [];
                ['start', 'end'].forEach(boundary => {
                    ['this', 'next'].forEach(selector => {
                        ['week', 'month', 'quarter', 'year'].forEach(unit => {
                            const phrase = `${cap(boundary)} of ${selector} ${unit}`;
                            if (phrase.toLowerCase().startsWith(trimmed)) suggestions.push(phrase);
                        });
                    });
                });
                return suggestions;
            },
            priority: 50
        },
        // Holiday pattern (if partially matching a known holiday)
        {
            pattern: (input: string) => { // Function pattern to check if input might be a holiday
                if (!DateParser.holidaysInstance) DateParser.initHolidays();
                const lower = input.trim().toLowerCase();
                if (lower.length < 2) return false; 
                return Array.from(DateParser.holidayCache.keys())
                    .some(name => name.includes(lower)); // Check if input is part of any holiday name
            },
            generate: (input: string) => {
                if (!DateParser.holidaysInstance) DateParser.initHolidays();
                const lower = input.trim().toLowerCase();
                return Array.from(DateParser.holidayCache.values())
                    .filter(holiday => holiday.name.toLowerCase().includes(lower))
                    .map(holiday => holiday.name) // Return the proper holiday name
                    .slice(0, 5); 
            },
            priority: 40
        }
    ];

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
        this.addHolidayAliases();
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
    private static addHolidayAliases(aliases: Record<string, string> = HOLIDAY_ALIASES): void {
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
        // Always re-init holidays to ensure cache is refreshed,
        // even if the locale string hasn't changed.
        this.initHolidays(locale);
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
     * Determines if the input string contains a time component or time-related phrase.
     * This checks for explicit times (e.g., 3pm, 14:00), time-of-day phrases, or 'now'.
     */
    static inputHasTimeComponent(text: string): boolean {
        if (!text) return false;
        const lower = text.trim().toLowerCase();
        // Exclude 'in X days/weeks/years' (no time component)
        if (/^in \d+\s*(days?|weeks?|years?)$/.test(lower)) return false;
        // Check for 'now'
        if (lower === 'now') return true;
        // Check for time-of-day phrases
        if (TIME_OF_DAY_PHRASES.some(phrase => lower.includes(phrase.toLowerCase()))) return true;
        // Check for explicit time (e.g., 3pm, 14:00, 3:30 am, 23:59)
        if (/\b(\d{1,2})(:|\.|h)?(\d{2})?\s?(am|pm)?\b/.test(lower)) return true;
        return false;
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
     * Get suggestions based on patterns for a given input.
     * Does not include base/initial suggestions or fallback logic from settings.
     * @param input User's current input text (case-sensitive for generation).
     * @returns Array of pattern-generated suggestions.
     */
    static getPatternSuggestions(input: string): string[] {
        const trimmedInputForMatching = input.trim().toLowerCase(); // Use lower for matching patterns
        const suggestions = new Set<string>();

        if (!input.trim()) { // Use original input for this check
            return [];
        }

        const sortedGenerators = [...this.suggestionGenerators]
            .sort((a, b) => (b.priority || 0) - (a.priority || 0));

        for (const generator of sortedGenerators) {
            try {
                let generatedItems: string[] = [];
                if (typeof generator.pattern === 'function') {
                    // Pass lowercased input to function patterns for consistency
                    if (generator.pattern(trimmedInputForMatching)) { 
                        generatedItems = generator.generate(input.trim()); // Pass original trimmed input to generate
                    }
                } else {
                    // Match regex against lowercased input
                    const match = trimmedInputForMatching.match(generator.pattern);
                    if (match) {
                        // Pass original trimmed input and the match details (from lowercased) to generate
                        generatedItems = generator.generate(input.trim(), match); 
                    }
                }
                generatedItems.forEach(s => suggestions.add(s));
            } catch (error) {
                console.error("Error in suggestion generator:", error, generator);
            }
        }
        return Array.from(suggestions);
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