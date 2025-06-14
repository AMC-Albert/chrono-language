import { getDailyNote, getDailyNoteSettings, DEFAULT_DAILY_NOTE_FORMAT } from 'obsidian-daily-notes-interface';
import { DateParser } from './DateParser';
import { DateFormatter, loggerDebug, loggerError, registerLoggerClass } from '@/utils';
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
	private dailyNotesService: DailyNotesService;	constructor(dailyNotesService: DailyNotesService) {
		registerLoggerClass(this, 'SuggestionRenderer');
		this.dailyNotesService = dailyNotesService;
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
		// Derive the current query from passed context (highest priority)
		const query = context?.context?.query ?? context?.query ?? '';
		// Update provider context for subsequent preview updates		provider.contextProvider = { context: { query }, query };
		
		const { insertMode, contentFormat } = provider.keyboardHandler.getEffectiveInsertModeAndFormat();
		
		// Optimized rendering: batch DOM operations and use cached values
		const fragment = document.createDocumentFragment();
		const container = document.createElement('div');
		container.className = CLASSES.suggestionContainer;
		container.setAttribute('data-suggestion', item);
		
		// Check for time component once and cache the result
		const hasTimeComponent = DateParser.inputHasTimeComponent(item, provider);
		if (hasTimeComponent) {
			container.classList.add(CLASSES.timeRelevantSuggestion);
			loggerDebug(this, `Suggestion has time component: ${item}`);
		}
		
		// Get cached values upfront to minimize repeated calls
		const parsedDate = provider.getCachedParsedDate(item);
		const momentDate = parsedDate ? moment(parsedDate) : moment();
		
		// Create suggestion text with highlighting (batch operations)
		const suggestionSpan = this.createHighlightedSuggestionSpan(item, query.trim());
		container.appendChild(suggestionSpan);
		
		// Render preview immediately and synchronously using cached values
		this.renderPreview(provider, container, item, parsedDate, momentDate, insertMode, contentFormat, null);
		
		// Add to fragment and then to DOM in one operation
		fragment.appendChild(container);
		el.appendChild(fragment);		// Register container after DOM insertion
		provider.currentElements.set(item, container);
		
		// Check for existing daily notes with improved caching (should be fast now)
		this.updateDailyNotesInfoAsync(provider, item, el);
	}

	/**
	 * Updates daily notes information asynchronously to avoid blocking the initial render
	 */
	private updateDailyNotesInfoAsync(provider: SuggestionProvider, item: string, parentElement: HTMLElement): void {
		// Defer this operation to the next event loop to avoid blocking initial render
		setTimeout(() => {
			provider.getDailyNotes().then(allNotes => {
				const container = parentElement.querySelector('[data-suggestion]') as HTMLElement;
				if (!container || !container.isConnected) return;
				
				const parsedDate = provider.getCachedParsedDate(item);
				if (allNotes && Object.keys(allNotes).length > 0 && parsedDate) {
					const momentDate = moment(parsedDate);
					const dailyNoteExists = getDailyNote(momentDate, allNotes);
					if (dailyNoteExists) {
						// Re-render with daily note info
						const existingPreviews = container.querySelectorAll('.' + CLASSES.suggestionPreview);
						existingPreviews.forEach(previewNode => previewNode.remove());
						
						const { insertMode, contentFormat } = provider.keyboardHandler.getEffectiveInsertModeAndFormat();
						this.renderPreview(provider, container, item, parsedDate, momentDate, insertMode, contentFormat, allNotes);
					}
				}
			}).catch(() => {
				// Ignore errors, already rendered without daily notes
			});		}, 0); // Defer to next event loop
	}

	/**
	 * Check for a specific daily note without scanning all daily notes
	 */
	private checkSpecificDailyNoteAsync(provider: SuggestionProvider, item: string, parentElement: HTMLElement): void {
		// Defer to next event loop to avoid blocking initial render
		setTimeout(() => {
			const container = parentElement.querySelector('[data-suggestion]') as HTMLElement;
			if (!container || !container.isConnected) return;
			
			const parsedDate = provider.getCachedParsedDate(item);
			if (!parsedDate) return;
			
			const momentDate = moment(parsedDate);
			const dailyNoteSettings = getDailyNoteSettings();
			const expectedFilename = momentDate.format(dailyNoteSettings.format || DEFAULT_DAILY_NOTE_FORMAT);
			
			// Check if a file with this name exists in the daily notes folder
			const dailyNotesFolder = dailyNoteSettings.folder || '';
			const expectedPath = dailyNotesFolder ? `${dailyNotesFolder}/${expectedFilename}.md` : `${expectedFilename}.md`;
			
			const existingFile = provider.app.vault.getAbstractFileByPath(expectedPath);
			if (existingFile && existingFile instanceof provider.app.vault.adapter.constructor.prototype.constructor) {
				// Daily note exists - update styling to indicate this
				const existingPreviews = container.querySelectorAll('.' + CLASSES.suggestionPreview);
				existingPreviews.forEach(preview => {
					preview.removeClass(CLASSES.unresolvedLink);
					preview.removeClass(CLASSES.unresolvedText);
				});
			}
		}, 100); // Small delay to avoid blocking initial render
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
			existingPreviews.forEach(previewNode => previewNode.remove());			const { insertMode, contentFormat } = provider.keyboardHandler.getEffectiveInsertModeAndFormat();
			const parsedDate = provider.getCachedParsedDate(item);
			const momentDate = parsedDate ? moment(parsedDate) : moment();
			loggerDebug(this, `Parsed date for: ${item} result: ${parsedDate?.toISOString() || 'null'}`);			// Render preview immediately without daily notes info for faster response
			this.renderPreview(provider, container, item, parsedDate, momentDate, insertMode, contentFormat, null);
			container.removeAttribute('data-updating');
			
			// Check daily notes with improved caching (should be fast now)
			provider.getDailyNotes().then(allNotes => {
				// Only re-render if we have daily notes that might show existence indicators
				if (allNotes && Object.keys(allNotes).length > 0 && parsedDate) {
					const dailyNoteSettings = getDailyNoteSettings();
					const dailyNoteExists = getDailyNote(momentDate, allNotes);
					
					// Only re-render if a daily note actually exists (affects visual indicators)
					if (dailyNoteExists) {
						// Clear existing preview and re-render with daily note info
						const existingPreviews = container.querySelectorAll('.' + CLASSES.suggestionPreview);
						existingPreviews.forEach(previewNode => previewNode.remove());
						
						container.setAttribute('data-updating', 'true');
						this.renderPreview(provider, container, item, parsedDate, momentDate, insertMode, contentFormat, allNotes);
						container.removeAttribute('data-updating');
					}
				}
            }).catch((err) => {
				const errorMsg = err instanceof Error ? err.message : String(err);
				loggerError(this, `Error getting cached daily notes: ${errorMsg}`);
				// Already rendered without daily notes, so no need to do anything
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
	 */	private appendReadableDatePreview(
		provider: SuggestionProvider,
		container: HTMLElement,
		item: string, 
		momentDate: moment.Moment,
		contentFormat: ContentFormat, 
		suggestionPreviewClass: string[]
	): void {
		const dailySettings = getDailyNoteSettings();
		const { insertMode } = provider.keyboardHandler.getEffectiveInsertModeAndFormat();
		const text = provider.getFormattedDateText(
			item,
			momentDate,
			provider.plugin.settings,
			contentFormat,
			dailySettings,
			insertMode // Pass the insert mode
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
	): void {		container.createEl('span', { text: '↳ ' });
		const dailySettings = getDailyNoteSettings();
		const { insertMode } = provider.keyboardHandler.getEffectiveInsertModeAndFormat();
		const readableText = provider.getFormattedDateText(
			item,
			momentDate,
			provider.plugin.settings,
			contentFormat,
			dailySettings,
			insertMode // Use cached version instead of direct DateFormatter call
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
