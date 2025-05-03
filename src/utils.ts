import { App, normalizePath } from 'obsidian';
import { Link, ObsidianSettings } from 'obsidian-dev-utils/obsidian';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { ChronoLanguageSettings } from './settings';

/**
 * Determines the appropriate alias for a daily note link based on settings
 * @param app The Obsidian app instance
 * @param settings Plugin settings
 * @param currentDate The current date string
 * @param dailyNoteFormat The format used for daily notes
 * @param filePath The file path for the daily note
 * @returns The alias to use for the link, or undefined if no alias should be used
 */
export function determineDailyNoteAlias(
    app: App,
    settings: ChronoLanguageSettings, 
    currentDate: string,
    dailyNoteFormat: string,
    filePath: string
): string | undefined {
    const usingWikilinks = ObsidianSettings.shouldUseWikilinks(app);
    
    let alias: string | undefined;
    if (settings.readableFormat && dailyNoteFormat !== settings.readableFormat) {
        // Always use readable format if it differs from the daily note format
        alias = window.moment().format(settings.readableFormat);
    } else if (settings.includeFolderInLinks && settings.HideFolders) {
        // Check if we should hide folders - only hide if using wikilinks or HideFolders is true
        if (usingWikilinks || settings.HideFolders) {
            alias = currentDate;
        }
    } else if (!usingWikilinks && settings.includeFolderInLinks && !settings.HideFolders) {
        // Very cursed case - using markdown links, no human-readable alias, include folder, not hiding folders with alias
        alias = filePath; // Show the folder path in the link alias
    } else {
        // If not including folders, use currentDate as alias
        alias = !settings.includeFolderInLinks ? currentDate : undefined;
    }
    
    return alias;
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
    
    // Use the appropriate path based on the includeFolderInLinks setting
    const targetPath = settings.includeFolderInLinks 
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