import { getDailyNote, getDailyNoteSettings, DEFAULT_DAILY_NOTE_FORMAT } from 'obsidian-daily-notes-interface';
import { DateParser } from './DateParser';
import { DateFormatter, getOrCreateDailyNote, debug, info, warn, error } from '@/utils';
import { CLASSES } from '@/constants';
import { InsertMode, ContentFormat } from '@/types';
import { TFile, moment, Platform } from 'obsidian';
import { SuggestionProvider } from './SuggestionProvider';

// helper to highlight matching text
function highlightMatches(el: HTMLElement, text: string, regex: RegExp): void {
	let lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		if (match.index > lastIndex) {
			el.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
		}
		const bold = document.createElement('b');
		bold.textContent = match[0];
		el.appendChild(bold);
		lastIndex = match.index + match[0].length;
	}
	if (lastIndex < text.length) {
		el.appendChild(document.createTextNode(text.slice(lastIndex)));
	}
}

export function renderSuggestionContent(
	provider: SuggestionProvider,
	item: string,
	el: HTMLElement,
	context?: any
) {
	// Log rendering of suggestion
	debug(provider, `Rendering item: ${item}`);
	
	// Derive the current query from passed context (highest priority)
	const query = context?.context?.query ?? context?.query ?? '';
	// Update provider context for subsequent preview updates
	provider.contextProvider = { context: { query }, query };
	const container = el.createEl('div', {
		cls: [CLASSES.suggestionContainer],
		attr: { 'data-suggestion': item }
	});
	if (DateParser.inputHasTimeComponent(item, provider)) {
		container.addClass(CLASSES.timeRelevantSuggestion);
		debug(provider, `Suggestion has time component: ${item}`);
	}
	// Prepare suggestion text with highlighted query matches
	const trimmedQuery = query.trim();
	const suggestionSpan = document.createElement('span');
	suggestionSpan.className = CLASSES.suggestionText;	if (trimmedQuery) {
		const escaped = trimmedQuery.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
		const regex = new RegExp(escaped, 'gi');
		highlightMatches(suggestionSpan, item, regex);
		debug(provider, `Highlighted query matches for: ${item}`);
	} else {
		suggestionSpan.textContent = item;
	}
	container.appendChild(suggestionSpan);
	provider.currentElements.set(item, container);
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
			
		// Log preview update
		debug(provider, `Updating preview for: ${item}`);

		container.setAttribute('data-updating', 'true');
		// Remove all existing preview elements
		const existingPreviews = container.querySelectorAll('.' + CLASSES.suggestionPreview);
		existingPreviews.forEach(previewNode => previewNode.remove());
		const { insertMode, contentFormat } = provider.keyboardHandler.getEffectiveInsertModeAndFormat();
		const parsedDate = DateParser.parseDate(item, provider);
		const momentDate = parsedDate ? moment(parsedDate) : moment();
		debug(provider, `Parsed date for: ${item} result: ${parsedDate?.toISOString() || 'null'}`);

		// Use cached daily notes from provider instead of scanning vault on every keystroke
		provider.getDailyNotes().then(allNotes => {
			renderPreview(provider, container, item, parsedDate, momentDate, insertMode, contentFormat, allNotes);
			container.removeAttribute('data-updating');
		}).catch((err) => {
			const errorMsg = err instanceof Error ? err.message : String(err);
			error(provider, `Error getting cached daily notes: ${errorMsg}`);
			renderPreview(provider, container, item, parsedDate, momentDate, insertMode, contentFormat, null);
			container.removeAttribute('data-updating');
		});
	} catch (e) {
		const errorMsg = e instanceof Error ? e.message : String(e);
		error(provider, `Error updating preview content: ${errorMsg}`);
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
		const note = getDailyNote(momentDate, allNotes);
		if (note instanceof TFile) {
			dailyNote = note;
		}
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
		dailySettings,
		provider
	);

	// Highlight matching characters in bold
	const context = provider.contextProvider;
	let query = '';
	if (context && context.context && context.context.query) {
		query = context.context.query;
	} else if (context && context.query) {
		query = context.query;
	}

	const trimmedQuery = query.trim();

	// create span and append matches
	const span = document.createElement('span');
	span.className = suggestionPreviewClass.join(' ');
	if (trimmedQuery.length > 0) {
		const escaped = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const regex = new RegExp(escaped, 'gi');
		highlightMatches(span, text, regex);
	} else {
		span.textContent = text;
	}
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
		dailySettings,
		provider
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
			const context = provider.contextProvider.context;
			if (context) {
				provider.cleanupTriggerPhrase(context);
			}
		}
		provider['closeSuggester']();
		const file = await getOrCreateDailyNote(provider.app, momentDate, true);
		if (file) {
			const newPane = Platform.isMacOS ? event.metaKey : event.ctrlKey;
			await provider.app.workspace.openLinkText(file.path, '', newPane);
		}
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