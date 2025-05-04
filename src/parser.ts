import * as chrono from 'chrono-node';

/**
 * Enhanced date parsing that adds additional capabilities to chrono
 * - If text starts with a number, prepends "in " to handle relative dates better
 * - If text ends with a number, appends " days" to handle relative dates better
 */
export class EnhancedDateParser {
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
        const modifiedText = this.enhanceText(text);
        return chrono.parse(modifiedText);
    }
}