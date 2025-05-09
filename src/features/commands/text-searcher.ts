import { Editor } from 'obsidian';
import { DateParser } from '../suggestion-provider/parser';

export interface WordAtCursorResult {
    word: string;
    from: number;
    to: number;
}

export class TextSearcher {
    /**
     * Gets the potential date expression at or around cursor position
     * Enhanced: If a month is detected, checks the next word for a number to form e.g. "May 9"
     */
    static getWordAtCursor(editor: Editor): WordAtCursorResult | null {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);

        let wordStart = cursor.ch;
        let wordEnd = cursor.ch;
        // Exclude spaces to isolate single word under cursor; spaces handled in month expansion
        const dateCharsRegex = /[\w\/\-\.,:]/;
        while (wordStart > 0 && dateCharsRegex.test(line.charAt(wordStart - 1))) {
            wordStart--;
        }
        while (wordEnd < line.length && dateCharsRegex.test(line.charAt(wordEnd))) {
            wordEnd++;
        }
        let word = line.substring(wordStart, wordEnd);
        // Remove leading/trailing spaces only for the word, not for indices
        const wordTrimmed = word.trim();
        if (wordTrimmed) {
            const leadingSpaces = word.match(/^\s+/) || [""];
            const trailingSpacesMatch = word.match(/\s+$/);
            let from = wordStart + leadingSpaces[0].length;
            let to = wordEnd;
            if (trailingSpacesMatch) {
                to -= trailingSpacesMatch[0].length;
            }
            // Enhanced: try to expand if word is a month, but only if cursor is within the expanded range
            const expanded = this.expandIfMonth(line, from, to);
            if (expanded && DateParser.parseDate(expanded.word)) {
                if (cursor.ch >= expanded.from && cursor.ch <= expanded.to) {
                    return expanded;
                }
            }
            // Only return if the word under the cursor is a date and the cursor is within the range
            if (DateParser.parseDate(line.substring(from, to))) {
                if (cursor.ch >= from && cursor.ch <= to) {
                    return { word: line.substring(from, to), from, to };
                }
            }
            // If not a date, do NOT scan the line for a date expression
            return null;
        }
        // If there is no word under the cursor, do NOT scan the line for a date expression
        return null;
    }

    /**
     * Scan backwards from cursor to find a potential date expression
     */
    static scanBackwardsForDateExpression(editor: Editor, cursor: { line: number, ch: number }): WordAtCursorResult | null {
        const line = editor.getLine(cursor.line);
        // Do NOT trim beforeCursor, so indices remain correct
        const beforeCursor = line.substring(0, cursor.ch);
        if (!beforeCursor.trim()) return null;
        const words = beforeCursor.split(/\s+/);
        let potentialDate = words[words.length - 1];
        let startIdx = beforeCursor.lastIndexOf(potentialDate);
        // Try up to 5 words for phrases like "next Friday at 3pm"
        for (let wordCount = 2; wordCount <= 5; wordCount++) {
            if (words.length >= wordCount) {
                const phrase = words.slice(-wordCount).join(" ");
                const phraseIdx = beforeCursor.lastIndexOf(phrase);
                if (phraseIdx !== -1 && DateParser.parseDate(phrase)) {
                    potentialDate = phrase;
                    startIdx = phraseIdx;
                    break;
                }
            }
        }
        // Enhanced: try to expand if last word is a month
        const expanded = this.expandIfMonth(line, startIdx, startIdx + potentialDate.length);
        if (expanded) {
            // Only return if the cursor is exactly at the end of the detected date
            if (cursor.ch === expanded.to) {
                return expanded;
            }
            return null;
        }
        if (startIdx >= 0) {
            const from = startIdx;
            const to = startIdx + potentialDate.length;
            // Only return if the cursor is exactly at the end of the detected date
            if (cursor.ch === to) {
                return { word: potentialDate, from, to };
            }
            return null;
        }
        return null;
    }

    /**
     * If the word is a month, check if the next word is a number and forms a valid date
     */
    static expandIfMonth(line: string, from: number, to: number): WordAtCursorResult | null {
        const months = [
            'january','february','march','april','may','june','july','august','september','october','november','december',
            'jan','feb','mar','apr','may','jun','jul','aug','sep','sept','oct','nov','dec'
        ];
        const word = line.substring(from, to).trim();
        const lower = word.toLowerCase();
        if (months.includes(lower)) {
            // Look for next word after the month
            const after = line.substring(to).match(/^\s*(\d{1,2})/);
            if (after) {
                const candidate = word + ' ' + after[1];
                if (DateParser.parseDate(candidate)) {
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
