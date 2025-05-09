import { Editor } from 'obsidian';
import { DateParser } from '../suggestion-provider/parser';
// Use chrono to ensure full-phrase matching
import * as chrono from 'chrono-node';
import { MONTHS_OF_THE_YEAR } from '../../constants';

export interface WordAtCursorResult {
    word: string;
    from: number;
    to: number;
}

export class TextSearcher {
    /**
     * Gets the potential date expression at or around cursor position
     * Token-based, step-by-step phrase expansion: starting from the token under the cursor, try 1-to-5 word phrases and return on the first parseable date.
     */
    static getWordAtCursor(editor: Editor): WordAtCursorResult | null {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const ch = cursor.ch;
        // Split line into non-space tokens with start/end indices
        const tokens: Array<{text: string, start: number, end: number}> = [];
        const regex = /\S+/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(line)) !== null) {
            tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length });
        }
        // Find token under cursor
        const tokenIndex = tokens.findIndex(t => ch >= t.start && ch <= t.end);
        if (tokenIndex < 0) return null;
        // Try all windows containing the token, longest first
        const maxWords = 5;
        for (let len = maxWords; len >= 1; len--) {
            // offset from tokenIndex to start of window: from -(len-1) up to 0
            for (let offset = -(len - 1); offset <= 0; offset++) {
                const startIdx = tokenIndex + offset;
                const endIdx = startIdx + len;
                if (startIdx < 0 || endIdx > tokens.length) continue;
                const sliceTokens = tokens.slice(startIdx, endIdx);
                const phrase = sliceTokens.map(t => t.text).join(" ");
                const from = sliceTokens[0].start;
                const to = sliceTokens[sliceTokens.length - 1].end;
                // Ensure phrase is bounded by whitespace or line boundaries
                const beforeChar = from > 0 ? line[from - 1] : ' ';
                const afterChar = to < line.length ? line[to] : ' ';
                if (/\S/.test(beforeChar) || /\S/.test(afterChar)) continue;
                // Only trigger when cursor is on/after the actual date phrase
                if (ch < from || ch > to) continue;
                // Allow pure 4-digit year as valid date
                if (/^\d{4}$/.test(phrase)) {
                    return { word: phrase, from, to };
                }
                // Skip pure numeric windows to avoid unrelated number combos
                if (/^[\d\s]+$/.test(phrase)) continue;
                // Manual detection for "Month Day Year" (e.g., "Mar 30 2026")
                const mdYearMatch = phrase.match(/^(\w+)\s+(\d{1,2})\s+(\d{4})$/);
                if (mdYearMatch) {
                    const m = mdYearMatch[1].toLowerCase();
                    const day = parseInt(mdYearMatch[2], 10);
                    const monthIndex = MONTHS_OF_THE_YEAR.findIndex(mon => mon.toLowerCase() === m || mon.substring(0,3).toLowerCase() === m);
                    if (monthIndex >= 0 && day >= 1 && day <= 31) {
                        return { word: phrase, from, to };
                    }
                }
                // Only match if chrono parses the entire phrase
                const results = chrono.parse(phrase);
                if (results.length > 0 && results[0].text.trim().toLowerCase() === phrase.trim().toLowerCase()) {
                    return { word: phrase, from, to };
                }
            }
        }
        return null;
    }

    /**
     * Scan backwards from cursor to find a potential date expression
     */
    static scanBackwardsForDateExpression(editor: Editor, cursor: { line: number, ch: number }): WordAtCursorResult | null {
        const line = editor.getLine(cursor.line);
        const ch = cursor.ch;
        // Split line into non-space tokens with start/end indices
        const tokens: Array<{text: string, start: number, end: number}> = [];
        const regex = /\S+/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(line)) !== null) {
            tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length });
        }
        // Find token at or before cursor
        let tokenIndex = tokens.findIndex(t => ch >= t.start && ch <= t.end);
        if (tokenIndex < 0) {
            // If cursor is not within a token, find the preceding token
            for (let i = tokens.length - 1; i >= 0; i--) {
                if (tokens[i].end < ch) {
                    tokenIndex = i;
                    break;
                }
            }
        }
        if (tokenIndex < 0) return null;
        const maxWords = 5;
        // Try all windows containing the token, longest first
        for (let len = maxWords; len >= 1; len--) {
            for (let offset = -(len - 1); offset <= 0; offset++) {
                const startIdx = tokenIndex + offset;
                const endIdx = startIdx + len;
                if (startIdx < 0 || endIdx > tokens.length) continue;
                const sliceTokens = tokens.slice(startIdx, endIdx);
                const phrase = sliceTokens.map(t => t.text).join(" ");
                const from = sliceTokens[0].start;
                const to = sliceTokens[sliceTokens.length - 1].end;
                // Allow pure 4-digit year as valid date
                if (/^\d{4}$/.test(phrase)) {
                    return { word: phrase, from, to };
                }
                // Ensure cursor is over or immediately after phrase
                if (ch < from || ch > to) continue;
                // Manual fallback for "Month Day Year" formats
                const mdYearMatch = phrase.match(/^(\w+)\s+(\d{1,2})\s+(\d{4})$/);
                if (mdYearMatch) {
                    const m = mdYearMatch[1].toLowerCase();
                    const day = parseInt(mdYearMatch[2], 10);
                    const monthIndex = MONTHS_OF_THE_YEAR.findIndex(mon => mon.toLowerCase() === m || mon.substring(0,3).toLowerCase() === m);
                    if (monthIndex >= 0 && day >= 1 && day <= 31) {
                        return { word: phrase, from, to };
                    }
                }
                // Check strict full-phrase match with chrono
                const chronoBack = chrono.parse(phrase);
                if (chronoBack.length > 0 && chronoBack[0].text.trim().toLowerCase() === phrase.trim().toLowerCase()) {
                    const expanded = this.expandIfMonth(line, from, to);
                    if (expanded && ch >= expanded.from && ch <= expanded.to) return expanded;
                    return { word: phrase, from, to };
                }
            }
        }
        return null;
    }

    /**
     * If the word is a month, check if the next word is a number and forms a valid date
     */
    static expandIfMonth(line: string, from: number, to: number): WordAtCursorResult | null {
        // Derive month names and 3-letter abbreviations from constants
        const months = MONTHS_OF_THE_YEAR.flatMap(m => [
            m.toLowerCase(),
            m.substring(0,3).toLowerCase()
        ]);
        const word = line.substring(from, to).trim();
        const lower = word.toLowerCase();
        if (months.includes(lower)) {
            // Look for next word after the month
            const after = line.substring(to).match(/^\s*(\d{1,2})/);
            if (after) {
                const candidate = word + ' ' + after[1];
                if (DateParser.parseDateRaw(candidate)) {
                    // Expand the range to include the number
                    const newTo = to + after[0].length;
                    return { word: candidate, from, to: newTo };
                }
            }
            // If not valid, just return the month
            return { word, from, to };
        }
        return null;
    }
}
