import { App, normalizePath, Notice, TFile, moment } from 'obsidian';
import { Link, ObsidianSettings, FileSystem } from 'obsidian-dev-utils/obsidian';
import { getDailyNoteSettings, getDailyNote, getAllDailyNotes, createDailyNote, DEFAULT_DAILY_NOTE_FORMAT } from 'obsidian-daily-notes-interface';
import { QuickDatesSettings } from '../settings';
import { DateParser } from '../features/suggestion-provider/date-parser';
import { ERRORS } from '../constants';
import { ContentFormat } from '../types';
import { DEFAULT_SETTINGS } from '../settings';

/**
 * Centralized date formatting utility for consistent date handling across components
 */
export class DateFormatter {
    /**
     * Determine if only time should be rendered based on settings and date
     */
    public static shouldRenderTimeOnly(item: string, settings: QuickDatesSettings, momentDate: moment.Moment): boolean {
        return (
            settings.timeOnly &&
            !!settings.timeFormat && settings.timeFormat.trim() !== "" &&
            DateParser.inputHasTimeComponent(item) &&
            momentDate.isSame(moment(), 'day')
        );
    }

    /**
     * Gets formatted text for a date suggestion based on content format,
     * incorporating time formatting logic (timeOnly, append time).
     */
    public static getFormattedDateText(
        itemText: string, // Original suggestion text for time relevance and SUGGESTION_TEXT format
        momentDate: moment.Moment, // Parsed date
        settings: QuickDatesSettings, // For formats, timeFormat, timeOnly
        contentFormat: ContentFormat,
        dailyNoteSettings: ReturnType<typeof getDailyNoteSettings> // Explicit type for daily note settings
    ): string {
        if (!momentDate || !momentDate.isValid()) {
            return itemText; // Fallback for invalid dates
        }

        if (contentFormat === ContentFormat.SUGGESTION_TEXT) {
            return itemText; // SUGGESTION_TEXT format should return the item text as is.
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
        const isItemTimeRelevant = DateParser.inputHasTimeComponent(itemText);
    
        // Apply time formatting if applicable
        if (settings.timeFormat && settings.timeFormat.trim() !== "" && isItemTimeRelevant) {
            const timeString = momentDate.format(settings.timeFormat);
            const isToday = momentDate.isSame(moment(), 'day');
    
            if (settings.timeOnly && isToday) {
                return timeString; // Override baseText with time only
            } else {
                // Avoid appending time if the base format string already likely includes it (heuristic)
                const baseIncludesTime = /[HhmsSaAZ]/.test(baseFormatString);
                if (!baseIncludesTime) {
                    // Insert custom separator between date and time
                    return `${formattedDate}${settings.timeSeparator}${timeString}`;
                }
            }
        }
    
        return formattedDate; // Return baseText if no time formatting is applied or base included time
    }
}

/**
 * Returns a human readable preview of the parsed date
 * @param dateText Text to parse as a date
 * @param settings Plugin settings
 * @param useAlternateFormat If true, uses the alternate format instead of primary
 * @param forceNoAlias If true, forces no alias in the link (only relevant for links)
 * @param forceDailyNoteFormat If true, returns the daily note format
 * @returns Human readable date preview
 */
export function getDatePreview(
    dateText: string, 
    settings: QuickDatesSettings, 
    useAlternateFormat = false, 
    forceNoAlias = false, 
    forceDailyNoteFormat = false
): string {
    let dailyNoteSettings = getDailyNoteSettings();
    
    if (!dateText) return '';
    
    const parsedDate = DateParser.parseDate(dateText);
    if (!parsedDate) return '';
    
    // Determine which format to use
    let format;
    if (forceDailyNoteFormat) {
        format = dailyNoteSettings.format || DEFAULT_DAILY_NOTE_FORMAT;
    } else if (forceNoAlias && !forceDailyNoteFormat) {
        // Only return empty when forceNoAlias is true AND we're not forcing daily note format
        return '';
    } else if (useAlternateFormat && settings.alternateFormat) {
        format = settings.alternateFormat;
    } else {
        format = settings.primaryFormat || dailyNoteSettings.format || DEFAULT_DAILY_NOTE_FORMAT;
    }
    
    return moment(parsedDate).format(format);
}

/**
 * Returns the daily note format preview of the parsed date
 * @param dateText Text to parse as a date
 * @returns Daily note format date preview
 */
export function getDailyNotePreview(dateText: string): string {
    let dailyNoteSettings = getDailyNoteSettings();

    if (!dateText) return '';
    
    const parsedDate = DateParser.parseDate(dateText);
    if (!parsedDate) return '';
    
    const format = dailyNoteSettings.format || DEFAULT_DAILY_NOTE_FORMAT;
    
    return moment(parsedDate).format(format);
}

/**
 * Determines the appropriate alias for a daily note link based on settings
 * @param app The Obsidian app instance
 * @param settings Plugin settings
 * @param itemText The original suggestion text, e.g., "Next Friday at 3pm"
 * @param forceTextAsAlias If true, uses the original text as alias
 * @param useAlternateFormatForAlias If true, uses the alternate format for alias
 * @param forceNoAlias If true, forces no alias in the link
 * @param momentDate The parsed date object
 * @returns The alias to use for the link, or undefined if no alias should be used
 */
export function determineDailyNoteAlias(
    app: App,
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

    const alias = DateFormatter.getFormattedDateText(
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
            const targetPath = getDailyNotePath(app, settings, momentDate);
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
export function createDailyNoteLink(
    app: App, 
    settings: QuickDatesSettings, 
    sourceFile: TFile, 
    dateText = '', 
    forceTextAsAlias = false,
    useAlternateFormat = false,
    forceNoAlias = false
): string {
    const dailyNoteSettings = getDailyNoteSettings();
    
    // Use Chrono to parse the date from text, or use current date if no text provided
    let parsedDate;
    if (dateText && dateText.trim().length > 0) {
        parsedDate = DateParser.parseDate(dateText);
        // If parsing failed, default to today
        if (!parsedDate) {
            parsedDate = new Date();
        }
    } else {
        parsedDate = new Date();
    }
    
    // Convert to moment date
    const momentDate = moment(parsedDate);
    const dailyNoteFormat = dailyNoteSettings.format || DEFAULT_DAILY_NOTE_FORMAT; 
    
    // Get the path to the daily note
    const targetPath = getDailyNotePath(app, settings, momentDate);

    // Get the appropriate alias for the link
    const alias = determineDailyNoteAlias(
        app,
        settings,
        dateText, // Pass the original suggestion text
        forceTextAsAlias,
        useAlternateFormat,
        forceNoAlias,
        momentDate // Pass the parsed date object
    );
    
    // Generate the link using Link utility
    return Link.generateMarkdownLink({
        app,
        targetPathOrFile: targetPath,
        sourcePathOrFile: sourceFile,
        alias,
        isNonExistingFileAllowed: true,
        isEmbed: false
    });
}

/**
 * Gets the path to a daily note for a specific date
 */
export function getDailyNotePath(
    app: App,
    settings: QuickDatesSettings,
    momentDate: moment.Moment
): string {
    const dailyNoteSettings = getDailyNoteSettings();

    // Format the date according to daily note settings
    const formattedDate = momentDate.format(dailyNoteSettings.format || DEFAULT_DAILY_NOTE_FORMAT);
    
    const usingRelativeLinks = ObsidianSettings.shouldUseRelativeLinks(app);
    
    // If using relative links, ignore includeFolderInLinks and use full path anyway
    const shouldIncludeFullPath = settings.includeFolderInLinks || usingRelativeLinks;
    
    // Create the target path based on settings
    return shouldIncludeFullPath
        ? normalizePath(`${dailyNoteSettings.folder}/${formattedDate}`)
        : formattedDate;
}

/**
 * Gets or creates a daily note for a specific date
 * @param app The Obsidian app instance
 * @param momentDate The date for the daily note
 * @param shouldOpen Whether to open the note after creation/retrieval
 * @param silent If true, no error notice will be displayed if the folder is missing
 * @returns The daily note file or null if it couldn't be found/created
 */
export async function getOrCreateDailyNote(
    app: App,
    momentDate: moment.Moment,
    shouldOpen = false,
    silent = false
): Promise<TFile | null> {
    const dailyNoteSettings = getDailyNoteSettings();

    // Check if the daily note exists
    const allNotes = await getAllDailyNotesSafe(app, true, silent);
    if (!allNotes) return null;
    
    let dailyNote = getDailyNote(momentDate, allNotes);
    
    // Create the note if it doesn't exist
    if (!dailyNote) {
        dailyNote = await createDailyNote(momentDate);
        if (!dailyNote) {
            if (!silent) new Notice(ERRORS.FAILED_CREATE_NOTE);
            return null;
        }
    }
    
    // Get TFile using FileSystem utility
    const obsidianFile = FileSystem.getFileOrNull(app, dailyNote.path);
    if (!obsidianFile) {
        if (!silent) new Notice(ERRORS.FAILED_FIND_NOTE);
        return null;
    }
    
    // Open the note if requested
    if (shouldOpen) {
        await app.workspace.getLeaf().openFile(obsidianFile);
    }
    return obsidianFile;
}

/**
 * Creates the daily notes folder if it doesn't exist
 * @param app The Obsidian app instance
 * @param silent If true, no notices will be displayed
 * @returns Promise resolving to true if the folder exists or was successfully created, false otherwise
 */
export async function createDailyNotesFolderIfNeeded(app: App, silent: boolean = false): Promise<boolean> {
    const dailyNoteSettings = getDailyNoteSettings();
    const folderPath = dailyNoteSettings.folder ?? '';
    
    // Check if folder exists (empty string means root folder, which always exists)
    if (folderPath === '') {
        return true;
    }
    
    try {
        // Use FileSystem.getOrCreateFolder utility
        await FileSystem.getOrCreateFolder(app, folderPath);
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
 * @param app The Obsidian app instance
 * @param createIfNeeded If true, attempts to create the folder if it doesn't exist
 * @param silentIfMissingAndNotCreating If true, no error notice will be displayed if the folder is missing and not creating
 * @returns Record of daily notes or null if the folder is missing
 */
export async function getAllDailyNotesSafe(
    app: App, 
    createIfNeeded: boolean = false,
    silentIfMissingAndNotCreating: boolean = false
): Promise<Record<string, TFile> | null> {
    const dailyNoteSettings = getDailyNoteSettings();
    const folderPath = dailyNoteSettings.folder ?? '';
    
    let folder = FileSystem.getFolderOrNull(app, folderPath);
    
    if ((folderPath === '' && app.vault.getRoot() !== null) || folder !== null) {
        return getAllDailyNotes() as Record<string, TFile>;
    } else if (createIfNeeded) {
        const created = await createDailyNotesFolderIfNeeded(app, true); // silent=true for createDailyNotesFolderIfNeeded
        if (created) {
            new Notice(`Created daily notes folder: ${folderPath}`, 3000); // Notify here
            return getAllDailyNotes() as Record<string, TFile>;
        }
    }
    
    if (!silentIfMissingAndNotCreating) {
        new Notice(ERRORS.DAILY_NOTES_FOLDER_MISSING, 5000);
    }
    return null;
}