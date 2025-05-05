import { App, normalizePath, Notice, TFile } from 'obsidian';
import { Link, ObsidianSettings } from 'obsidian-dev-utils/obsidian';
import { getDailyNoteSettings, getDailyNote, getAllDailyNotes, createDailyNote } from 'obsidian-daily-notes-interface';
import { ChronoLanguageSettings } from '../settings';
import { EnhancedDateParser } from './parser';
import { DATE_FORMAT, ERRORS } from '../plugin-data/constants';

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
    const dailyNoteSettings = getDailyNoteSettings();
    
    if (!dateText) return '';
    
    const parsedDate = EnhancedDateParser.parseDate(dateText);
    if (!parsedDate) return '';
    
    // Determine which format to use
    let format;
    if (forceDailyNoteFormat) {
        format = dailyNoteSettings.format || DATE_FORMAT.DEFAULT;
    } else if (forceNoAlias && !forceDailyNoteFormat) {
        // Only return empty when forceNoAlias is true AND we're not forcing daily note format
        return '';
    } else if (useAlternateFormat && settings.alternateFormat) {
        format = settings.alternateFormat;
    } else {
        format = settings.primaryFormat || dailyNoteSettings.format || DATE_FORMAT.DEFAULT;
    }
    
    return window.moment(parsedDate).format(format);
}

/**
 * Returns the daily note format preview of the parsed date
 * @param dateText Text to parse as a date
 * @returns Daily note format date preview
 */
export function getDailyNotePreview(dateText: string): string {
    if (!dateText) return '';
    
    const parsedDate = EnhancedDateParser.parseDate(dateText);
    if (!parsedDate) return '';
    
    const dailyNoteSettings = getDailyNoteSettings();
    const format = dailyNoteSettings.format || DATE_FORMAT.DEFAULT;
    
    return window.moment(parsedDate).format(format);
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
    const formattedDate = momentDate.format(dailyNoteSettings.format || DATE_FORMAT.DEFAULT);
    
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
    const momentDate = window.moment(parsedDate);
    const dailyNoteFormat = dailyNoteSettings.format || DATE_FORMAT.DEFAULT; 
    
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
    
    // Generate the link
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
 */
export async function getOrCreateDailyNote(
    app: App,
    momentDate: moment.Moment,
    shouldOpen = false
): Promise<TFile | null> {
    try {
        // Check if the daily note exists
        let dailyNote = getDailyNote(momentDate, getAllDailyNotes());
        
        // Create the note if it doesn't exist
        if (!dailyNote) {
            dailyNote = await createDailyNote(momentDate);
            if (!dailyNote) {
                new Notice(ERRORS.FAILED_CREATE_NOTE);
                return null;
            }
        }
        
        // Convert to Obsidian TFile
        const obsidianFile = app.vault.getAbstractFileByPath(dailyNote.path);
        if (!(obsidianFile instanceof TFile)) {
            new Notice(ERRORS.FAILED_FIND_NOTE);
            return null;
        }
        
        // Open the note if requested
        if (shouldOpen) {
            await app.workspace.getLeaf().openFile(obsidianFile);
        }
        
        return obsidianFile;
    } catch (error) {
        console.error("Error handling daily note:", error);
        new Notice(ERRORS.FAILED_HANDLE_NOTE);
        return null;
    }
}