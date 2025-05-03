import { App, normalizePath } from 'obsidian';
import { Link, ObsidianSettings } from 'obsidian-dev-utils/obsidian';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { ChronoLanguageSettings } from './settings';

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
 * @returns The generated markdown link
 */
export function createDailyNoteLink(app: App, settings: ChronoLanguageSettings, sourceFile: any): string {
    const dailyNoteSettings = getDailyNoteSettings();
    const currentDate = window.moment().format(dailyNoteSettings.format || "YYYY-MM-DD");
    const usingRelativeLinks = ObsidianSettings.shouldUseRelativeLinks(app);
    
    // includeFolderInLinks -> full path
    // usingRelativeLinks -> full path, otherwise output relative paths point to the root of the vault, which is just confusing
    const targetPath = settings.includeFolderInLinks || usingRelativeLinks
        ? normalizePath(`${dailyNoteSettings.folder}/${currentDate}`)
        : currentDate;
    
    // For display in the actual link, we may use just the date without folder
    const displayPath = settings.includeFolderInLinks ? targetPath : currentDate;
    
    // Get the appropriate alias for the link
    const alias = determineDailyNoteAlias(
        app,
        settings,
        currentDate,
        dailyNoteSettings.format || "YYYY-MM-DD",
        displayPath
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