// Utility for parsing trigger phrase context in the editor
import { Editor, EditorPosition } from 'obsidian';

export interface TriggerParseResult {
    start: EditorPosition;
    end: EditorPosition;
    query: string;
    shouldInsertSpaceOnOpen: boolean;
    firstSpaceBlocked: boolean;
}

export function parseTriggerContext(
    cursor: EditorPosition,
    editor: Editor,
    triggerPhrase: string,
    triggerHappy: boolean,
    lastReplacedTriggerStart: { line: number, ch: number } | null,
    lastInsertionEnd: { line: number, ch: number } | null,
    isOpen: boolean
): TriggerParseResult | null {
    const originalLine = editor.getLine(cursor.line);
    const prefixBeforeCursor = originalLine.slice(0, cursor.ch);
    const lastTriggerIndexInPrefix = prefixBeforeCursor.lastIndexOf(triggerPhrase);

    if (lastTriggerIndexInPrefix === -1) return null;

    const posImmediatelyAfterTrigger = lastTriggerIndexInPrefix + triggerPhrase.length;

    if (!triggerHappy) {
        // When triggerHappy is false, the trigger phrase must be standalone.
        // Check character BEFORE trigger phrase:
        if (lastTriggerIndexInPrefix > 0) {
            const charBefore = originalLine[lastTriggerIndexInPrefix - 1];
            if (!/\s/.test(charBefore)) {
                return null; // Preceded by non-whitespace, so don't trigger.
            }
        }

        // Check character AFTER trigger phrase:
        if (posImmediatelyAfterTrigger < originalLine.length) {
            const charAfter = originalLine[posImmediatelyAfterTrigger];
            if (!/\s/.test(charAfter)) {
                return null; // Followed by non-whitespace, so don't trigger.
            }
        }
    }

    if (cursor.ch < posImmediatelyAfterTrigger) return null;

    // Anti-retrigger logic
    if (lastReplacedTriggerStart && lastInsertionEnd) {
        if (cursor.line === lastInsertionEnd.line && cursor.ch === lastInsertionEnd.ch &&
            lastTriggerIndexInPrefix <= lastReplacedTriggerStart.ch) {
            return null;
        }
    }

    let queryForSuggestions: string;
    let finalEndPosForContext: EditorPosition = cursor;
    let shouldInsertSpaceOnOpen = false;
    let firstSpaceBlocked = false;

    if (cursor.ch === posImmediatelyAfterTrigger &&
        (originalLine.length === posImmediatelyAfterTrigger || originalLine[posImmediatelyAfterTrigger] !== ' ')) {
        shouldInsertSpaceOnOpen = true;
        finalEndPosForContext = { line: cursor.line, ch: posImmediatelyAfterTrigger };
        queryForSuggestions = '';
        firstSpaceBlocked = false;
    } else {
        shouldInsertSpaceOnOpen = false;
        const textAfterTrigger = originalLine.slice(posImmediatelyAfterTrigger, cursor.ch);
        if (textAfterTrigger.startsWith(' ')) {
            queryForSuggestions = textAfterTrigger.slice(1);
        } else {
            queryForSuggestions = textAfterTrigger;
        }
        if (queryForSuggestions.trim() !== '') {
            firstSpaceBlocked = false;
        }
    }

    return {
        start: { line: cursor.line, ch: lastTriggerIndexInPrefix },
        end: finalEndPosForContext,
        query: queryForSuggestions,
        shouldInsertSpaceOnOpen,
        firstSpaceBlocked
    };
}
