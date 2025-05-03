import { App, normalizePath } from 'obsidian';
import { Link } from 'obsidian-dev-utils/obsidian';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { ChronoLanguageSettings } from './settings';

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
    const filePath = normalizePath(`${dailyNoteSettings.folder}/${currentDate}`);
    
    const alias = settings.readableFormat
        ? window.moment().format(settings.readableFormat)
        : undefined;
    
    const linkOptions: Link.GenerateMarkdownLinkOptions = {
        app: app,
        targetPathOrFile: filePath,
        sourcePathOrFile: sourceFile,
        alias: alias,
        isNonExistingFileAllowed: true,
        isEmbed: false
    };
    
    return Link.generateMarkdownLink(linkOptions);
}