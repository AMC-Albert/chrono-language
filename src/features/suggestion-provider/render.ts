import { getDailyNote, getDailyNoteSettings, DEFAULT_DAILY_NOTE_FORMAT } from 'obsidian-daily-notes-interface';
import { DateParser } from './date-parser';
import { DateFormatter } from '../../utils/helpers';
import { CLASSES } from '../../constants';
import { getOrCreateDailyNote } from '../../utils/helpers';
import { InsertMode, ContentFormat } from '../../types';
import { TFile, moment } from 'obsidian';
import { SuggestionProvider } from './index';

export function renderSuggestionContent(
    provider: SuggestionProvider,
    item: string,
    el: HTMLElement,
    context?: any
) {
    const container = el.createEl('div', { 
        cls: [CLASSES.suggestionContainer],
        attr: { 'data-suggestion': item }
    });
    if (DateParser.inputHasTimeComponent(item)) {
        container.addClass(CLASSES.timeRelevantSuggestion);
    }
    // Highlight matching characters in the suggestion text
    let suggestionText = item;
    const contextProvider = provider.contextProvider;
    let query = '';
    if (contextProvider && contextProvider.context && contextProvider.context.query) {
        query = contextProvider.context.query;
    } else if (contextProvider && contextProvider.query) {
        query = contextProvider.query;
    }

    const trimmedQuery = query.trim(); // Trim the query

    if (trimmedQuery.length > 0) { // Check the length of the trimmed query
        // Escape regex special chars in trimmed query
        const escaped = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'gi');
        suggestionText = item.replace(regex, match => `<b>${match}</b>`);
    }
    const suggestionSpan = document.createElement('span');
    suggestionSpan.className = CLASSES.suggestionText;
    suggestionSpan.innerHTML = suggestionText;
    container.appendChild(suggestionSpan);
    provider.currentElements.set(item, container);
    if (context) provider.contextProvider = context;
    provider.updatePreviewContent(item, container);
}

export function updatePreviewContent(
    provider: SuggestionProvider,
    item: string,
    container: HTMLElement
) {
    try {
        if (!provider.isSuggesterOpen || !container.isConnected || 
            container.hasAttribute('data-updating')) return;
        container.setAttribute('data-updating', 'true');
        // Remove all existing preview elements
        const existingPreviews = container.querySelectorAll('.' + CLASSES.suggestionPreview);
        existingPreviews.forEach(previewNode => previewNode.remove());

        const { insertMode, contentFormat } = provider.keyboardHandler.getEffectiveInsertModeAndFormat();
        const parsedDate = DateParser.parseDate(item);
        const momentDate = parsedDate ? moment(parsedDate) : moment();
        getAllDailyNotesSafe(provider.app, true).then(allNotes => {
            renderPreview(provider, container, item, parsedDate, momentDate, insertMode, contentFormat, allNotes);
            container.removeAttribute('data-updating');
        }).catch((error) => {
            console.error("Error in getAllDailyNotesSafe chain:", error);
            renderPreview(provider, container, item, parsedDate, momentDate, insertMode, contentFormat, null);
            container.removeAttribute('data-updating');
        });
    } catch (e) {
        console.error('Error updating preview content:', e);
        container?.removeAttribute?.('data-updating');
    }
}

function renderPreview(
    provider: SuggestionProvider,
    container: HTMLElement, 
    item: string,
    rawParsedDate: Date | null,
    momentDate: moment.Moment,
    insertMode: InsertMode,
    contentFormat: ContentFormat,
    allNotes: Record<string, TFile> | null
): void {
    let dailyNote: TFile | null = null;
    const dailyNoteSettings = getDailyNoteSettings();
    const dailyNoteFilenameCandidate = momentDate.isValid() ? momentDate.format(dailyNoteSettings.format || DEFAULT_DAILY_NOTE_FORMAT) : item;
    if (momentDate.isValid() && allNotes && rawParsedDate) {
        dailyNote = getDailyNote(momentDate, allNotes) as TFile;
    }
    const previewContainer = container.createEl('span', { cls: [CLASSES.suggestionPreview] });
    if (!rawParsedDate) {
        previewContainer.createEl('span', {text: '⨉ ', cls: [CLASSES.errorIcon]})
        previewContainer.createEl('span', { text: 'Unable to parse date', cls: [CLASSES.errorText] });
        return;
    }
    if (insertMode === InsertMode.PLAINTEXT) {
        previewContainer.createEl('span', { text: '↳ ' });
        appendReadableDatePreview(
            provider,
            previewContainer,
            item,
            momentDate,
            contentFormat,
            dailyNote && allNotes ? [] : [CLASSES.unresolvedText]
        );
    } else {
        createLinkPreview(
            provider,
            previewContainer,
            dailyNoteFilenameCandidate,
            dailyNote && allNotes ? [] : [CLASSES.unresolvedLink],
            momentDate,
            item,
            contentFormat,
            dailyNote && allNotes ? [] : [CLASSES.unresolvedText]
        );
    }
    if (!previewContainer.hasChildNodes()) previewContainer.remove();
}

function appendReadableDatePreview(
    provider: SuggestionProvider,
    container: HTMLElement,
    item: string, 
    momentDate: moment.Moment,
    contentFormat: ContentFormat, 
    suggestionPreviewClass: string[]
): void {
    const dailySettings = getDailyNoteSettings();
    let text = DateFormatter.getFormattedDateText(
        item,
        momentDate,
        provider.plugin.settings,
        contentFormat,
        dailySettings
    );
    // Highlight matching characters in bold
    const context = provider.contextProvider;
    let query = '';
    if (context && context.context && context.context.query) {
        query = context.context.query;
    } else if (context && context.query) {
        query = context.query;
    }

    const trimmedQuery = query.trim(); // Trim the query

    if (trimmedQuery.length > 0) { // Check the length of the trimmed query
        // Escape regex special chars in trimmed query
        const escaped = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Create a regex to match all occurrences, case-insensitive
        const regex = new RegExp(escaped, 'gi');
        text = text.replace(regex, match => `<b>${match}</b>`);
    }
    if (contentFormat !== ContentFormat.SUGGESTION_TEXT &&
        container.parentElement?.classList.contains(CLASSES.timeRelevantSuggestion)) {
        container.createEl('span', { text: '◴ ', cls: ['chrono-clock-icon'] });
    }
    // Use innerHTML to allow bold tags
    const span = document.createElement('span');
    span.className = suggestionPreviewClass.join(' ');
    span.innerHTML = text;
    container.appendChild(span);
}

function createLinkPreview(
    provider: SuggestionProvider,
    container: HTMLElement,
    linkText: string,
    dailyNoteClass: string[],
    momentDate: moment.Moment,
    item: string,
    contentFormat: ContentFormat,
    suggestionPreviewClass: string[]
): void {
    container.createEl('span', { text: '↳ ' });
    const dailySettings = getDailyNoteSettings();
    const readableText = DateFormatter.getFormattedDateText(
        item,
        momentDate,
        provider.plugin.settings,
        contentFormat,
        dailySettings
    );
    const linkEl = container.createEl('a', {
        text: linkText,
        cls: dailyNoteClass, 
        attr: { 
            'data-href': '#', 
            target: '_self', 
            rel: 'noopener nofollow' 
        }
    });
    linkEl.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (provider.contextProvider) {
            provider.cleanupTriggerPhrase((provider.contextProvider as any).context);
        }
        provider['closeSuggester']();
        const file = await getOrCreateDailyNote(provider.app, momentDate, true);
        if (file) await provider.app.workspace.getLeaf(event.ctrlKey).openFile(file);
    });
    if (linkText !== readableText) {
        container.createEl('span', { text: ' ⭢ ' });
        let textForDisplay = readableText;
        if (contentFormat !== ContentFormat.SUGGESTION_TEXT &&
            container.parentElement?.classList.contains(CLASSES.timeRelevantSuggestion)) {
            textForDisplay = '◴ ' + readableText;
        }
        container.createEl('span', { 
            text: textForDisplay,
            cls: suggestionPreviewClass 
        });
    }
}

// Helper to get all daily notes safely
async function getAllDailyNotesSafe(app: any, createIfNeeded: boolean) {
    const { getAllDailyNotesSafe } = await import('../../utils/helpers');
    return getAllDailyNotesSafe(app, createIfNeeded);
}
