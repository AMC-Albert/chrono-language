import { Editor } from 'obsidian';
import { DateParser } from '../suggestion-provider/date-parser';
import * as chrono from 'chrono-node';

export interface WordAtCursorResult {
    word: string;
    from: number;
    to: number;
}

export class TextSearcher {
    private static readonly MAX_PHRASE_WORDS = 7; // Maximum number of words to consider in a potential date phrase

    /**
     * Gets the potential date expression at or around the cursor position.
     * This method tokenizes the line, identifies the word under (or nearest to) the cursor,
     * and then expands outwards to find the longest sequence of words that forms a
     * valid date/time expression parsable by `DateParser.parseDate`.
     */
    static getWordAtCursor(editor: Editor): WordAtCursorResult | null {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);

        // 1. Tokenize the line into words with their start/end positions
        interface LineWord { text: string; start: number; end: number; }
        const words: LineWord[] = [];
        const regex = /\S+/g; // Matches sequences of non-whitespace characters
        let match;
        while ((match = regex.exec(line)) !== null) {
            words.push({ text: match[0], start: match.index, end: match.index + match[0].length });
        }

        if (words.length === 0) {
            return null; // No words on the line
        }

        // 2. Find the anchor word index.
        // A word is considered under the cursor if cursor.ch is within [word.start, word.end].
        // This includes being at the very start or very end of the word.
        const anchorWordIndex = words.findIndex(w => cursor.ch >= w.start && cursor.ch <= w.end);

        if (anchorWordIndex === -1) {
            // If cursor is not directly on a word (e.g., in whitespace between words,
            // or leading/trailing whitespace), return null as per "place the cursor on one of the words".
            return null;
        }
        const anchorWord = words[anchorWordIndex];

        // 3. Iterate through possible phrase lengths and starting positions relative to the anchor word
        let bestResult: WordAtCursorResult | null = null;

        for (let len = 1; len <= TextSearcher.MAX_PHRASE_WORDS; len++) {
            // 'k' is the 0-indexed position of the anchor word within the current phrase.
            // k ranges from 0 (anchor is the first word) to len-1 (anchor is the last word).
            for (let k = 0; k < len; k++) {
                const phraseStartIndexInWords = anchorWordIndex - k;
                const phraseEndIndexInWords = phraseStartIndexInWords + len - 1;

                // Ensure the calculated phrase indices are within the bounds of the 'words' array
                if (phraseStartIndexInWords < 0 || phraseEndIndexInWords >= words.length) {
                    continue;
                }

                const currentPhraseWords = words.slice(phraseStartIndexInWords, phraseEndIndexInWords + 1);
                
                const phraseText = currentPhraseWords.map(w => w.text).join(" ");
                const phraseFrom = currentPhraseWords[0].start;

                const chronoParseResults = chrono.parse(phraseText);
                let currentPhraseBestMatch: WordAtCursorResult | null = null;

                for (const result of chronoParseResults) {
                    const matchedTextByChrono = result.text;
                    const matchStartIndexInPhrase = result.index;
                
                    const absoluteMatchFrom = phraseFrom + matchStartIndexInPhrase;
                    const absoluteMatchTo = absoluteMatchFrom + matchedTextByChrono.length;
                
                    // Calculate the end of the anchor word's core text (stripping one trailing punctuation char like ',', '.', ':', ';')
                    // This ensures that if the tokenized anchorWord is e.g., "2025,", its core "2025" is used for matching against Chrono's result.
                    const coreAnchorText = anchorWord.text.replace(/[,.:;]$/, "");
                    const coreAnchorEnd = anchorWord.start + coreAnchorText.length;

                    // Check if the anchor word's core text (e.g., "2025" from "2025,") is fully contained within this specific Chrono match span.
                    // This is key to ensuring the Chrono match is relevant to the word at the cursor.
                    if (anchorWord.start >= absoluteMatchFrom && coreAnchorEnd <= absoluteMatchTo) {
                        // The anchor word's core is within this Chrono match.
                        if (!currentPhraseBestMatch || matchedTextByChrono.length > currentPhraseBestMatch.word.length) {
                            currentPhraseBestMatch = { word: matchedTextByChrono, from: absoluteMatchFrom, to: absoluteMatchTo };
                        }
                    }
                }
                
                if (currentPhraseBestMatch) {
                    if (!bestResult || currentPhraseBestMatch.word.length > bestResult.word.length) {
                        bestResult = currentPhraseBestMatch;
                    }
                }
            }
        }
        return bestResult;
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
