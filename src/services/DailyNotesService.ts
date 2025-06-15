import { App, normalizePath, Notice, TFile, TFolder, moment } from 'obsidian';
import { Link, ObsidianSettings, FileSystem } from 'obsidian-dev-utils/obsidian';
import { getDailyNoteSettings, getDailyNote, getAllDailyNotes, createDailyNote, DEFAULT_DAILY_NOTE_FORMAT } from 'obsidian-daily-notes-interface';
import { QuickDatesSettings } from '@/settings';
import { DateParser } from '@/features/suggestion-provider/DateParser';
import { ERRORS } from '@/constants';
import { ContentFormat } from '@/types';
import { DEFAULT_SETTINGS } from '@/settings';
import { loggerDebug, loggerInfo, loggerWarn, loggerError, registerLoggerClass } from '@/utils/obsidian-logger';
import type { ServiceInterface } from './types';

/**
 * Service responsible for daily note operations and management
 */
export class DailyNotesService implements ServiceInterface {
	public readonly name = 'DailyNotesService';
	private app: App;
	constructor(app: App) {
		this.app = app;
		registerLoggerClass(this, 'DailyNotesService');
		loggerDebug(this, 'Daily notes service initialized');
	}

	async initialize(): Promise<void> {
		loggerDebug(this, 'Daily notes service initialization completed');
	}

	async dispose(): Promise<void> {
		loggerDebug(this, 'Daily notes service disposed');
	}

	/**
	 * Gets formatted text for a date suggestion based on content format
	 * This is a simplified version for daily notes service use
	 */
	private getFormattedDateText(
		itemText: string,
		momentDate: moment.Moment,
		settings: QuickDatesSettings,
		contentFormat: ContentFormat,
		dailyNoteSettings: ReturnType<typeof getDailyNoteSettings>
	): string {
		if (!momentDate || !momentDate.isValid()) {
			return itemText; // Fallback for invalid dates
		}

		if (contentFormat === ContentFormat.SUGGESTION_TEXT) {
			return itemText;
		}
	
		let baseFormatString: string;
		switch (contentFormat) {
			case ContentFormat.DAILY_NOTE:
				baseFormatString = dailyNoteSettings.format || DEFAULT_DAILY_NOTE_FORMAT;
				break;
			case ContentFormat.ALTERNATE:
				baseFormatString = settings.alternateFormat || DEFAULT_SETTINGS.alternateFormat;
				break;
			case ContentFormat.PRIMARY:
			default:
				baseFormatString = settings.primaryFormat || dailyNoteSettings.format || DEFAULT_DAILY_NOTE_FORMAT;
				break;
		}
		
		let formattedDate = momentDate.format(baseFormatString);
		
		// Add timestamp logic (same as DateFormatter.getFormattedDateText)
		const isItemTimeRelevant = DateParser.inputHasTimeComponent(itemText);
		if (settings.timeFormat && settings.timeFormat.trim() !== "" && isItemTimeRelevant) {
			const timeString = momentDate.format(settings.timeFormat);
			const separator = settings.timeSeparator || " ";
			formattedDate = formattedDate + separator + timeString;
			
			loggerDebug(this, 'getFormattedDateText', 'Appended time to alias', {
				formattedDate: momentDate.format(baseFormatString),
				timeString,
				result: formattedDate
			});
		}
		
		return formattedDate;
	}

	/**
	 * Returns the daily note format preview of the parsed date
	 * @param dateText Text to parse as a date
	 * @returns Daily note format date preview
	 */	getDailyNotePreview(dateText: string): string {
		const dailyNoteSettings = getDailyNoteSettings();

		if (!dateText) return '';
		
		const parsedDate = DateParser.parseDate(dateText);
		if (!parsedDate) return '';
		
		const format = dailyNoteSettings.format || DEFAULT_DAILY_NOTE_FORMAT;
		
		return moment(parsedDate).format(format);
	}

	/**
	 * Determines the appropriate alias for a daily note link based on settings
	 * @param settings Plugin settings
	 * @param itemText The original suggestion text, e.g., "Next Friday at 3pm"
	 * @param forceTextAsAlias If true, uses the original text as alias
	 * @param useAlternateFormatForAlias If true, uses the alternate format for alias
	 * @param forceNoAlias If true, forces no alias in the link
	 * @param momentDate The parsed date object
	 * @returns The alias to use for the link, or undefined if no alias should be used
	 */
	determineDailyNoteAlias(
		settings: QuickDatesSettings,
		itemText: string, // The original suggestion text, e.g., "Next Friday at 3pm"
		forceTextAsAlias: boolean,
		useAlternateFormatForAlias: boolean,
		forceNoAlias: boolean,
		momentDate: moment.Moment // The parsed date object
	): string | undefined {
		if (forceNoAlias) return undefined;
		if (forceTextAsAlias) return itemText;

		const dailySettings = getDailyNoteSettings();
		const aliasContentFormat = useAlternateFormatForAlias ? ContentFormat.ALTERNATE : ContentFormat.PRIMARY;
		const alias = this.getFormattedDateText(
			itemText,
			momentDate,
			settings,
			aliasContentFormat,
			dailySettings
		);

		const dailyNoteName = momentDate.format(dailySettings.format || DEFAULT_DAILY_NOTE_FORMAT);
		if (alias === dailyNoteName) {
			// HideFolders fallback: if HideFolders is true, and no alias would be used, use filename as alias if the link includes a folder
			if (settings.HideFolders) {
				// Get the path that would be used for the link
				const targetPath = this.getDailyNotePath(settings, momentDate);
				// If the path includes a folder (has a slash), use the filename as alias
				if (targetPath.includes("/")) {
					const filename = targetPath.substring(targetPath.lastIndexOf("/") + 1);
					// Only use as alias if filename is different from the full path (i.e., path includes folder)
					if (filename !== targetPath) {
						return filename;
					}
				}
			}
			return undefined; // No alias if it's identical to the note name and no HideFolders fallback
		}
		return alias || undefined; // Ensure undefined if empty string (though unlikely with new formatter)
	}

	/**
	 * Creates a markdown link to the daily note
	 */
	createDailyNoteLink(
		settings: QuickDatesSettings, 
		sourceFile: TFile, 
		dateText = '', 
		forceTextAsAlias = false,
		useAlternateFormat = false,
		forceNoAlias = false
	): string {    
		loggerDebug(this, 'CreateDailyNoteLink', {
			dateText,
			forceTextAsAlias,
			useAlternateFormat,
			forceNoAlias,
			sourceFile: sourceFile.path
		});
				// Use DateParser to parse the date from text, or use current date if no text provided
		let momentDate;
		if (dateText && dateText.trim().length > 0) {
			const parsedDate = DateParser.parseDate(dateText);
			// If parsing failed, default to today
			if (!parsedDate) {
				loggerWarn(this, 'CreateDailyNoteLink', 'Failed to parse date, using today', { dateText });
				momentDate = moment();
			} else {
				momentDate = moment(parsedDate);
			}
		} else {
			momentDate = moment();
		}

		// Get the path to the daily note
		const targetPath = this.getDailyNotePath(settings, momentDate);

		// Get the appropriate alias for the link
		const alias = this.determineDailyNoteAlias(
			settings,
			dateText, // Pass the original suggestion text
			forceTextAsAlias,
			useAlternateFormat,
			forceNoAlias,
			momentDate // Pass the parsed date object
		);
		
		loggerDebug(this, 'createDailyNoteLink', 'Creating daily note link', {
			targetPath,
			alias,
			parsedDate: momentDate.toISOString()
		});
		
		// Generate the link using Link utility
		const link = Link.generateMarkdownLink({
			app: this.app,
			targetPathOrFile: targetPath,
			sourcePathOrFile: sourceFile,
			alias,
			isNonExistingFileAllowed: true,
			isEmbed: false
		});

		loggerInfo(this, 'createDailyNoteLink', 'Created daily note link', { dateText, link });
		return link;
	}

	/**
	 * Gets the path to a daily note for a specific date
	 */
	getDailyNotePath(
		settings: QuickDatesSettings,
		momentDate: moment.Moment
	): string {
		const dailyNoteSettings = getDailyNoteSettings();

		// Format the date according to daily note settings
		const formattedDate = momentDate.format(dailyNoteSettings.format || DEFAULT_DAILY_NOTE_FORMAT);
		
		const usingRelativeLinks = ObsidianSettings.shouldUseRelativeLinks(this.app);
		
		// If using relative links, ignore includeFolderInLinks and use full path anyway
		const shouldIncludeFullPath = settings.includeFolderInLinks || usingRelativeLinks;
		
		// Create the target path based on settings
		return shouldIncludeFullPath
			? normalizePath(`${dailyNoteSettings.folder}/${formattedDate}`)
			: formattedDate;
	}

	/**
	 * Gets or creates a daily note for a specific date
	 * @param momentDate The date for the daily note
	 * @param shouldOpen Whether to open the note after creation/retrieval
	 * @param silent If true, no error notice will be displayed if the folder is missing
	 * @returns The daily note file or null if it couldn't be found/created
	 */
	async getOrCreateDailyNote(
		momentDate: moment.Moment,
		shouldOpen = false,
		silent = false
	): Promise<TFile | null> {
		loggerDebug(this, 'getOrCreateDailyNote', {
			date: momentDate.toISOString(),
			shouldOpen,
			silent
		});
		
		const dailyNoteSettings = getDailyNoteSettings();

		// Check if the daily note exists
		const allNotes = await this.getAllDailyNotesSafe(true, silent);
		if (!allNotes) {
			loggerWarn(this, 'getOrCreateDailyNote', 'failed to get daily notes', {});
			return null;
		}
		
		let dailyNote = getDailyNote(momentDate, allNotes);
		
		// Create the note if it doesn't exist
		if (!dailyNote) {
			loggerInfo(this, 'getOrCreateDailyNote', 'daily note does not exist, creating', {
				date: momentDate.toISOString()
			});
			
			dailyNote = await createDailyNote(momentDate);
			if (!dailyNote) {
				loggerError(this, 'getOrCreateDailyNote', 'failed to create daily note', {
					date: momentDate.toISOString()
				});
				if (!silent) new Notice(ERRORS.FAILED_CREATE_NOTE);
				return null;
			}

			loggerInfo(this, 'getOrCreateDailyNote', 'created daily note', {
				date: momentDate.toISOString(),
				path: dailyNote.path 
			});
		} else {
			loggerDebug(this, 'getOrCreateDailyNote', 'daily note already exists', { 
				date: momentDate.toISOString(),
				path: dailyNote.path 
			});
		}
		
		// Get TFile using FileSystem utility
		const obsidianFile = FileSystem.getFileOrNull(this.app, dailyNote.path);
		if (!obsidianFile) {
			loggerError(this, 'getOrCreateDailyNote', 'failed to find created note file', { path: dailyNote.path });
			if (!silent) new Notice(ERRORS.FAILED_FIND_NOTE);
			return null;
		}
		
		// Open the note if requested
		if (shouldOpen) {
			loggerDebug(this, 'getOrCreateDailyNote', 'opening daily note', { path: obsidianFile.path });
			await this.app.workspace.getLeaf().openFile(obsidianFile);
		}
		
		return obsidianFile;
	}

	/**
	 * Creates the daily notes folder if it doesn't exist
	 * @param silent If true, no notices will be displayed
	 * @returns Promise resolving to true if the folder exists or was successfully created, false otherwise
	 */
	async createDailyNotesFolderIfNeeded(silent: boolean = false): Promise<boolean> {
		const dailyNoteSettings = getDailyNoteSettings();
		const folderPath = dailyNoteSettings.folder ?? '';
		
		// Check if folder exists (empty string means root folder, which always exists)
		if (folderPath === '') return true;
		
		try {
			await FileSystem.getOrCreateFolder(this.app, folderPath);
			return true;
		} catch (error) {
			if (!silent) {
				new Notice(`${ERRORS.FAILED_CREATE_FOLDER}: ${error}`, 5000);
			}
			return false;
		}
	}

	/**
	 * Wrapper to safely get all daily notes only if the folder exists
	 * @param createIfNeeded If true, attempts to create the folder if it doesn't exist
	 * @param silentIfMissingAndNotCreating If true, no error notice will be displayed if the folder is missing and not creating
	 * @returns Record of daily notes or null if the folder is missing
	 */
	async getAllDailyNotesSafe(
		createIfNeeded: boolean = false,
		silentIfMissingAndNotCreating: boolean = false
	): Promise<Record<string, TFile> | null> {
		const dailyNoteSettings = getDailyNoteSettings();
		const folderPath = dailyNoteSettings.folder ?? '';
		
		let folder = FileSystem.getFolderOrNull(this.app, folderPath);
		const vaultRoot = this.app.vault.getRoot();
		
		if ((folderPath === '' && vaultRoot instanceof TFolder) || folder instanceof TFolder) {
			// Only include valid TFile instances
			const all = getAllDailyNotes();
			const validNotes: Record<string, TFile> = {};
			for (const [key, file] of Object.entries(all)) {
				if (file instanceof TFile) {
					validNotes[key] = file;
				}
			}
			return validNotes;
		} else if (createIfNeeded) {
			const created = await this.createDailyNotesFolderIfNeeded(true);
			if (created) {
				new Notice(`Created daily notes folder: ${folderPath}`, 3000);
				const all = getAllDailyNotes();
				const validNotes: Record<string, TFile> = {};
				for (const [key, file] of Object.entries(all)) {
					if (file instanceof TFile) {
						validNotes[key] = file;
					}
				}
				return validNotes;
			}
		}
		
		if (!silentIfMissingAndNotCreating) new Notice(ERRORS.DAILY_NOTES_FOLDER_MISSING, 5000);
		return null;
	}
}
