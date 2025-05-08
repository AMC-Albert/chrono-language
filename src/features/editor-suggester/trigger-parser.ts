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
    // ...existing logic from onTrigger up to the return statement...
    const originalLine = editor.getLine(cursor.line);
    const prefixBeforeCursor = originalLine.slice(0, cursor.ch);
    const lastTriggerIndexInPrefix = prefixBeforeCursor.lastIndexOf(triggerPhrase);
    if (lastTriggerIndexInPrefix === -1) return null;
    const posImmediatelyAfterTrigger = lastTriggerIndexInPrefix + triggerPhrase.length;
    if (!triggerHappy) {
        if (lastTriggerIndexInPrefix > 0) {
            const beforeChar = originalLine[lastTriggerIndexInPrefix - 1];
            if (!/\s/.test(beforeChar)) return null;
        }
        if (posImmediatelyAfterTrigger < originalLine.length) {
            const afterChar = originalLine[posImmediatelyAfterTrigger];
            if (!/\s/.test(afterChar)) return null;
        }
    }
    if (cursor.ch < posImmediatelyAfterTrigger) return null;
    if (!isOpen && (cursor.ch > posImmediatelyAfterTrigger || originalLine.slice(cursor.ch).trim() !== '')) return null;
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
    if (lastReplacedTriggerStart && lastInsertionEnd) {
        if (cursor.line === lastInsertionEnd.line && cursor.ch === lastInsertionEnd.ch &&
            lastTriggerIndexInPrefix <= lastReplacedTriggerStart.ch) {
            return null;
        }
    }
    const rawTextAfterTriggerForSpaceyCheck = originalLine.slice(posImmediatelyAfterTrigger, finalEndPosForContext.ch);
    if (!isOpen && rawTextAfterTriggerForSpaceyCheck.startsWith(' ') && rawTextAfterTriggerForSpaceyCheck.trim() === '') {
        return null;
    }
    return {
        start: { line: cursor.line, ch: lastTriggerIndexInPrefix },
        end: finalEndPosForContext,
        query: queryForSuggestions,
        shouldInsertSpaceOnOpen,
        firstSpaceBlocked
    };
}
