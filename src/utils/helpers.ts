import { App, normalizePath, Notice, TFile, TFolder, moment } from 'obsidian';
import { Link, ObsidianSettings, FileSystem } from 'obsidian-dev-utils/obsidian';
import { getDailyNoteSettings, getDailyNote, getAllDailyNotes, createDailyNote, DEFAULT_DAILY_NOTE_FORMAT } from 'obsidian-daily-notes-interface';
import { ChronoLanguageSettings } from '../settings';
import { EnhancedDateParser } from './parser';
import { ERRORS } from '../definitions/constants';

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
    settings: ChronoLanguageSettings, 
    useAlternateFormat = false, 
    forceNoAlias = false, 
    forceDailyNoteFormat = false
): string {
    let dailyNoteSettings = getDailyNoteSettings();
    
    if (!dateText) return '';
    
    const parsedDate = EnhancedDateParser.parseDate(dateText);
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
    
    const parsedDate = EnhancedDateParser.parseDate(dateText);
    if (!parsedDate) return '';
    
    const format = dailyNoteSettings.format || DEFAULT_DAILY_NOTE_FORMAT;
    
    return moment(parsedDate).format(format);
}

/**
 * Determines the appropriate alias for a daily note link based on settings
 * @param settings Plugin settings
 * @param momentDate Moment.js date object
 * @param dailyNoteFormat The format used for daily notes
 * @param filePath The file path for the daily note
 * @param forceTextAsAlias If true, uses the original text as alias
 * @param originalText The original text to use as alias when forceTextAsAlias is true
 * @param useAlternateFormat If true, uses the alternate format for alias
 * @param forceNoAlias If true, forces no alias in the link
 * @returns The alias to use for the link, or undefined if no alias should be used
 */
export function determineDailyNoteAlias(
    app: App,
    settings: ChronoLanguageSettings, 
    momentDate: moment.Moment,
    dailyNoteFormat: string,
    filePath: string,
    forceTextAsAlias = false,
    originalText?: string,
    useAlternateFormat = false,
    forceNoAlias = false
): string | undefined {
    // If forcing no alias, return undefined
    if (forceNoAlias) {
        return undefined;
    }

    // Case 1: Force original text as alias
    if (forceTextAsAlias && originalText) {
        return originalText;
    }
        
    // Case 2: Use alternate format if specified and useAlternateFormat is true
    if (useAlternateFormat && settings.alternateFormat) {
        return momentDate.format(settings.alternateFormat);
    }

    // Case 3: Use readable format if specified and different from daily note format
    if (settings.primaryFormat && dailyNoteFormat !== settings.primaryFormat) {
        return momentDate.format(settings.primaryFormat);
    }
    
    // Case 4: Not including folders in links -> just use the date
    if (!settings.includeFolderInLinks) {
        return momentDate.format(dailyNoteFormat);
    }
    
    // Case 5: Including folders but want to hide them -> use date as alias
    if (settings.HideFolders) {
        return momentDate.format(dailyNoteFormat);
    }
    
    // Case 6: Using markdown links and showing folders -> use full path as alias
    if (!ObsidianSettings.shouldUseWikilinks(app) && settings.includeFolderInLinks) {
        return filePath;
    }
    
    // Default case: No alias needed
    return undefined;
}

/**
 * Gets the path to a daily note for a specific date
 */
export function getDailyNotePath(
    app: App,
    settings: ChronoLanguageSettings,
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
 * Creates a markdown link to the daily note
 */
export function createDailyNoteLink(
    app: App, 
    settings: ChronoLanguageSettings, 
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
        parsedDate = EnhancedDateParser.parseDate(dateText);
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
        momentDate,
        dailyNoteFormat,
        targetPath,
        forceTextAsAlias,
        dateText,
        useAlternateFormat,
        forceNoAlias
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
    const allNotes = await getAllDailyNotesSafe(app, silent, true);
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
 * @param silent If true, no error notice will be displayed if the folder is missing
 * @param createIfNeeded If true, attempts to create the folder if it doesn't exist
 * @returns Record of daily notes or null if the folder is missing
 */
export async function getAllDailyNotesSafe(
    app: App, 
    silent: boolean = false,
    createIfNeeded: boolean = false
): Promise<Record<string, TFile> | null> {
    const dailyNoteSettings = getDailyNoteSettings();
    // Allow empty string (root folder), but must be a valid AbstractFile (TFolder or root)
    const folderPath = dailyNoteSettings.folder ?? '';
    
    // Use FileSystem.getFolderOrNull utility
    const folder = FileSystem.getFolderOrNull(app, folderPath);
    
    // Accept root (empty string) or TFolder
    if (
        (folderPath === '' && app.vault.getRoot() !== null) ||
        folder !== null
    ) {
        // Add type assertion to resolve incompatible TFile types
        return getAllDailyNotes() as Record<string, TFile>;
    } else if (createIfNeeded) {
        // Try to create the folder
        const created = await createDailyNotesFolderIfNeeded(app, silent);
        if (created) {
            // Add type assertion to resolve incompatible TFile types
            return getAllDailyNotes() as Record<string, TFile>;
        }
    }
    
    // Folder doesn't exist and either we didn't try to create it or creation failed
    if (!silent) {
        new Notice(ERRORS.DAILY_NOTES_FOLDER_MISSING, 5000);
    }
    return null;
}