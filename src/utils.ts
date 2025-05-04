import { App, normalizePath } from 'obsidian';
import { Link, ObsidianSettings } from 'obsidian-dev-utils/obsidian';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { ChronoLanguageSettings } from './settings';
import { EnhancedDateParser } from './parser';

/**
 * Returns a human readable preview of the parsed date
 * @param dateText Text to parse as a date
 * @param settings Plugin settings
 * @param useAlternateFormat If true, uses the alternate format instead of primary
 * @returns Human readable date preview
 */
export function getDatePreview(dateText: string, settings: ChronoLanguageSettings, useAlternateFormat: boolean = false): string {
    const dailyNoteSettings = getDailyNoteSettings();
    
    if (!dateText) return '';
    
    const parsedDate = EnhancedDateParser.parseDate(dateText);
    if (!parsedDate) return '';
    
    // Determine which format to use
    let format;
    if (useAlternateFormat && settings.alternateFormat) {
        format = settings.alternateFormat;
    } else {
        format = settings.primaryFormat || dailyNoteSettings.format || "YYYY-MM-DD";
    }
    
    return window.moment(parsedDate).format(format);
}

/**
 * Returns the daily note format preview of the parsed date
 * @param dateText Text to parse as a date
 * @returns Daily note format date preview
 */
export function getDailyNotePreview(dateText: string): string {
    const dailyNoteSettings = getDailyNoteSettings();
    
    if (!dateText) return '';
    
    const parsedDate = EnhancedDateParser.parseDate(dateText);
    if (!parsedDate) return '';
    
    // Always use the daily note format
    const format = dailyNoteSettings.format || "YYYY-MM-DD";
    return window.moment(parsedDate).format(format);
}

/**
 * Determines the appropriate alias for a daily note link based on settings
 * @param app The Obsidian app instance
 * @param settings Plugin settings
 * @param dateString The date string in the daily note format
 * @param dailyNoteFormat The format used for daily notes
 * @param filePath The file path for the daily note
 * @param forceTextAsAlias If true, uses the original text as alias regardless of settings
 * @param originalText The original text to use as alias when forceTextAsAlias is true
 * @returns The alias to use for the link, or undefined if no alias should be used
 */
export function determineDailyNoteAlias(
    app: App,
    settings: ChronoLanguageSettings, 
    dateString: string,
    dailyNoteFormat: string,
    filePath: string,
    forceTextAsAlias: boolean = false,
    originalText?: string
): string | undefined {
    // Case 1: Force original text as alias
    if (forceTextAsAlias && originalText) {
        return originalText;
    }
        
    // Case 2: Use readable format if specified and different from daily note format
    if (settings.primaryFormat && dailyNoteFormat !== settings.primaryFormat) {
        // Parse the dateString back to a moment object using the dailyNoteFormat
        const momentDate = window.moment(dateString, dailyNoteFormat);
        return momentDate.format(settings.primaryFormat);
    }
    
    // Case 3: Not including folders in links -> just use the date
    if (!settings.includeFolderInLinks) {
        return dateString;
    }
    
    // Case 4: Including folders but want to hide them -> use date as alias
    if (settings.HideFolders) {
        return dateString;
    }
    
    // Case 5: Using markdown links and showing folders -> use full path as alias
    if (!ObsidianSettings.shouldUseWikilinks(app) && settings.includeFolderInLinks) {
        return filePath;
    }
    
    // Default case: No alias needed (undefined)
    return undefined;
}

/**
 * Gets the path to a daily note for a specific date
 * @param app The Obsidian app instance
 * @param settings Plugin settings
 * @param momentDate Moment.js date object
 * @returns The path to the daily note
 */
export function getDailyNotePath(
    app: App,
    settings: ChronoLanguageSettings,
    momentDate: moment.Moment
): string {
    const dailyNoteSettings = getDailyNoteSettings();
    
    // Format the date according to daily note settings
    const formattedDate = momentDate.format(dailyNoteSettings.format || "YYYY-MM-DD");
    
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
 * @param app The Obsidian app instance
 * @param settings Plugin settings
 * @param sourceFile The source file where the link will be placed
 * @param dateText Optional text to parse as a date (defaults to today)
 * @param forceTextAsAlias If true, uses the dateText as alias regardless of settings
 * @returns The generated markdown link
 */
export function createDailyNoteLink(
    app: App, 
    settings: ChronoLanguageSettings, 
    sourceFile: any, 
    dateText?: string, 
    forceTextAsAlias: boolean = false
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
    
    // Format the parsed date according to daily note settings
    const momentDate = window.moment(parsedDate);
    const formattedDate = momentDate.format(dailyNoteSettings.format || "YYYY-MM-DD");
    
    // Get the path to the daily note
    const targetPath = getDailyNotePath(app, settings, momentDate);
    
    // Get the appropriate alias for the link
    const alias = determineDailyNoteAlias(
        app,
        settings,
        formattedDate,
        dailyNoteSettings.format || "YYYY-MM-DD",
        targetPath,
        forceTextAsAlias,
        dateText
    );
    
    const linkOptions: Link.GenerateMarkdownLinkOptions = {
        app: app,
        targetPathOrFile: targetPath,
        sourcePathOrFile: sourceFile,
        alias: alias,
        isNonExistingFileAllowed: true,
        isEmbed: false
    };
    
    return Link.generateMarkdownLink(linkOptions);
}