import { getDailyNote, getDailyNoteSettings, DEFAULT_DAILY_NOTE_FORMAT } from 'obsidian-daily-notes-interface';
import { DateParser } from './DateParser';
import { DateFormatter, loggerDebug, loggerInfo, loggerWarn, loggerError, registerLoggerClass } from '@/utils';
import { DailyNotesService } from '@/services';
import { CLASSES } from '@/constants';
import { InsertMode, ContentFormat } from '@/types';
import { TFile, moment, Platform } from 'obsidian';
import { SuggestionProvider } from './SuggestionProvider';

/**
 * Handles rendering and preview updates for date suggestions.
 * Provides a clean interface for suggestion visualization with highlighting and previews.
 */
export class SuggestionRenderer {
	private dailyNotesService: DailyNotesService;

	constructor(dailyNotesService: DailyNotesService) {
		this.dailyNotesService = dailyNotesService;
		registerLoggerClass(this, 'SuggestionRenderer');
	}

	/**
	 * Renders the main suggestion content with highlighting and initial preview.
	 * 
	 * @param provider The suggestion provider instance
	 * @param item The suggestion text to render
	 * @param el The HTML element to render into
	 * @param context Optional context containing query information
	 */
	public renderSuggestionContent(
		provider: SuggestionProvider,
		item: string,
		el: HTMLElement,
		context?: any	): void {
		// Log rendering of suggestion
		loggerDebug(this, `Rendering item: ${item}`);
		
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
			loggerDebug(this, `Suggestion has time component: ${item}`);
		}
		
		// Prepare suggestion text with highlighted query matches
		const suggestionSpan = this.createHighlightedSuggestionSpan(item, query.trim());
		container.appendChild(suggestionSpan);
		
		provider.currentElements.set(item, container);
		provider.updatePreviewContent(item, container);
	}

	/**
	 * Updates the preview content for a suggestion item.
	 * 
	 * @param provider The suggestion provider instance
	 * @param item The suggestion text
	 * @param container The container element to update
	 */
	public updatePreviewContent(
		provider: SuggestionProvider,
		item: string,
		container: HTMLElement
	): void {
		try {
			if (!provider.isSuggesterOpen || !container.isConnected ||
                container.hasAttribute('data-updating')) return;
				
			// Log preview update
			loggerDebug(this, `Updating preview for: ${item}`);

			container.setAttribute('data-updating', 'true');
			// Remove all existing preview elements
			const existingPreviews = container.querySelectorAll('.' + CLASSES.suggestionPreview);
			existingPreviews.forEach(previewNode => previewNode.remove());
			
			const { insertMode, contentFormat } = provider.keyboardHandler.getEffectiveInsertModeAndFormat();
			const parsedDate = DateParser.parseDate(item, provider);
			const momentDate = parsedDate ? moment(parsedDate) : moment();
			loggerDebug(this, `Parsed date for: ${item} result: ${parsedDate?.toISOString() || 'null'}`);

			// Use cached daily notes from provider instead of scanning vault on every keystroke
			provider.getDailyNotes().then(allNotes => {
				this.renderPreview(provider, container, item, parsedDate, momentDate, insertMode, contentFormat, allNotes);
				container.removeAttribute('data-updating');
            }).catch((err) => {
				const errorMsg = err instanceof Error ? err.message : String(err);
				loggerError(this, `Error getting cached daily notes: ${errorMsg}`);
				this.renderPreview(provider, container, item, parsedDate, momentDate, insertMode, contentFormat, null);
				container.removeAttribute('data-updating');
			});
		} catch (e) {
			const errorMsg = e instanceof Error ? e.message : String(e);
			loggerError(this, `Error updating preview content: ${errorMsg}`);
			container?.removeAttribute?.('data-updating');
		}
	}
    
	/**
	 * Creates a highlighted suggestion span with query matches emphasized.
	 * 
	 * @param item The suggestion text
	 * @param query The search query to highlight
	 * @returns The created HTML span element
	 */
	private createHighlightedSuggestionSpan(item: string, query: string): HTMLSpanElement {
		const suggestionSpan = document.createElement('span');
		suggestionSpan.className = CLASSES.suggestionText;
		
		if (query) {
			const escaped = query.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
			const regex = new RegExp(escaped, 'gi');
			this.highlightMatches(suggestionSpan, item, regex);
			loggerDebug(this, `Highlighted query matches for: ${item}`);
		} else {
			suggestionSpan.textContent = item;
		}
		
		return suggestionSpan;
	}

	/**
	 * Highlights matching text within an element using bold formatting.
	 * 
	 * @param el The element to add highlighted content to
	 * @param text The text to process
	 * @param regex The regex pattern to match and highlight
	 */
	private highlightMatches(el: HTMLElement, text: string, regex: RegExp): void {
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

	/**
	 * Renders the preview content for a suggestion.
	 * 
	 * @param provider The suggestion provider instance
	 * @param container The container element
	 * @param item The suggestion text
	 * @param rawParsedDate The parsed date or null
	 * @param momentDate The moment.js date object
	 * @param insertMode The current insert mode
	 * @param contentFormat The current content format
	 * @param allNotes The daily notes collection or null
	 */
	private renderPreview(
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
		const dailyNoteFilenameCandidate = momentDate.isValid() ? 
			momentDate.format(dailyNoteSettings.format || DEFAULT_DAILY_NOTE_FORMAT) : item;
		
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
			this.appendReadableDatePreview(
				provider,
				previewContainer,
				item,
				momentDate,
				contentFormat,
				dailyNote && allNotes ? [] : [CLASSES.unresolvedText]
			);
		} else {
			this.createLinkPreview(
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

	/**
	 * Appends a readable date preview to the container.
	 * 
	 * @param provider The suggestion provider instance
	 * @param container The container element
	 * @param item The suggestion text
	 * @param momentDate The moment.js date object
	 * @param contentFormat The content format
	 * @param suggestionPreviewClass CSS classes for styling
	 */
	private appendReadableDatePreview(
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
			this.highlightMatches(span, text, regex);
		} else {
			span.textContent = text;
		}
		container.appendChild(span);
	}

	/**
	 * Creates a link preview with interactive functionality.
	 * 
	 * @param provider The suggestion provider instance
	 * @param container The container element
	 * @param linkText The link text to display
	 * @param dailyNoteClass CSS classes for the daily note link
	 * @param momentDate The moment.js date object
	 * @param item The suggestion text
	 * @param contentFormat The content format
	 * @param suggestionPreviewClass CSS classes for the preview text
	 */
	private createLinkPreview(
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
			const file = await this.dailyNotesService.getOrCreateDailyNote(momentDate, true);
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
}
