import { App, normalizePath } from 'obsidian';
import { Link, ObsidianSettings } from 'obsidian-dev-utils/obsidian';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { ChronoLanguageSettings } from './settings';
import * as chrono from 'chrono-node';

/**
 * Determines the appropriate alias for a daily note link based on settings
 * @param app The Obsidian app instance
 * @param settings Plugin settings
 * @param dateString The date string in the daily note format
 * @param dailyNoteFormat The format used for daily notes
 * @param filePath The file path for the daily note
 * @returns The alias to use for the link, or undefined if no alias should be used
 */
export function determineDailyNoteAlias(
    app: App,
    settings: ChronoLanguageSettings, 
    dateString: string,
    dailyNoteFormat: string,
    filePath: string
): string | undefined {
    const usingWikilinks = ObsidianSettings.shouldUseWikilinks(app);
    
    // Case 1: Use readable format if specified and different from daily note format
    if (settings.readableFormat && dailyNoteFormat !== settings.readableFormat) {
        return window.moment().format(settings.readableFormat);
    }
    
    // Case 2: Not including folders in links -> just use the date
    if (!settings.includeFolderInLinks) {
        return dateString;
    }
    
    // Case 3: Including folders but want to hide them -> use date as alias
    if (settings.HideFolders) {
        return dateString;
    }
    
    // Case 4: Using markdown links and showing folders -> use full path as alias
    if (!usingWikilinks && settings.includeFolderInLinks) {
        return filePath;
    }
    
    // Default case: No alias needed (undefined)
    return undefined;
}

/**
 * Creates a markdown link to the daily note
 * @param app The Obsidian app instance
 * @param settings Plugin settings
 * @param sourceFile The source file where the link will be placed
 * @param dateText Optional text to parse as a date (defaults to today)
 * @returns The generated markdown link
 */
export function createDailyNoteLink(app: App, settings: ChronoLanguageSettings, sourceFile: any, dateText?: string): string {
    const dailyNoteSettings = getDailyNoteSettings();
    
    // Use Chrono to parse the date from text, or use current date if no text provided
    let parsedDate;
    if (dateText && dateText.trim().length > 0) {
        parsedDate = chrono.parseDate(dateText);
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
    
    const usingRelativeLinks = ObsidianSettings.shouldUseRelativeLinks(app);
    
    // If using relative links, ignore includeFolderInLinks and use full path anyway
    const shouldIncludeFullPath = settings.includeFolderInLinks || usingRelativeLinks;
    
    // Create the target path based on settings
    const targetPath = shouldIncludeFullPath
        ? normalizePath(`${dailyNoteSettings.folder}/${formattedDate}`)
        : formattedDate;
    
    // Get the appropriate alias for the link
    const alias = determineDailyNoteAlias(
        app,
        settings,
        formattedDate,
        dailyNoteSettings.format || "YYYY-MM-DD",
        targetPath
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