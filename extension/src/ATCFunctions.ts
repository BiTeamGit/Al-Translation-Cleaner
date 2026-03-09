import vscode from "vscode";
import { logger, throwErrorAndLog } from "./logging/LogHelper";
import path from "path";
import { applyTranslationsToAlFile, getALObjectHeader, resolveAlLocationsInFile } from "./handlers/ALFileHandler";
import { mergeTranslations, searchForTransUnitIdInXliff, XliffFile } from './handlers/XlfFileHandler';
import { getSettings } from "./settings/SettingsLoader";

/**
 * Finds all translation keys in the currently active AL file, gathers translations
 * from XLIFF files, and writes them to the AL file based on the translation method setting.
 */
export async function findTranslationsInFile() {
    logger.log("Executing findTranslationsInFile command...");
    const status = vscode.window.setStatusBarMessage("ATC: Find Translations in File...");

    //check if active editor is available and is an AL file
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        logger.log("findTranslationsInFile command completed.");
        return;
    }
    if (path.extname(activeEditor.document.uri.fsPath) !== '.al') {
        throwErrorAndLog("findTranslationsInFile", new Error("Active file is not an AL file"));
    }

    const settings = getSettings();

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Searching for translations in XLIFF files...",
        cancellable: false
    }, async (progress) => {
        const lines = activeEditor.document.getText().split(/\r?\n/);
        const header = getALObjectHeader(lines, activeEditor.document.uri);

        // Gather trans-units from all XLIFF files
        progress.report({ message: "Scanning XLIFF files..." });
        const xliffFiles = await gatherXliffFiles(header);
        if (xliffFiles.length === 0) {
            logger.log("No matching XLIFF trans-units found.");
            return;
        }
        progress.report({ increment: 30 });

        // Merge translations across files
        progress.report({ message: "Merging translations..." });
        const transUnits = mergeTranslations(xliffFiles, settings.languageMapping);
        progress.report({ increment: 20 });

        // Resolve AL source locations directly from the active file
        progress.report({ message: "Resolving AL source locations..." });
        resolveAlLocationsInFile(transUnits, header);
        progress.report({ increment: 20 });

        // Write translations to the AL file
        progress.report({ message: "Writing translations..." });
        const languageOrder = Object.values(settings.languageMapping);
        await applyTranslationsToAlFile(activeEditor.document.uri, transUnits, settings.translationMethod, languageOrder);
        progress.report({ increment: 30 });
    });

    logger.log("findTranslationsInFile command completed.");
    status.dispose();
}

async function gatherXliffFiles(header: ReturnType<typeof getALObjectHeader>): Promise<XliffFile[]> {
    const xlfFilesUri = await vscode.workspace.findFiles("**/*.xlf", "**/node_modules/**", 100000);
    if (xlfFilesUri.length === 0) {
        logger.log("No XLIFF files found in the workspace.");
        return [];
    }

    const xliffFiles: XliffFile[] = [];
    for (const fileUri of xlfFilesUri) {
        const document = await vscode.workspace.openTextDocument(fileUri);
        const xliffFile = searchForTransUnitIdInXliff(header, document);
        if (xliffFile.transUnits.length > 0) {
            xliffFiles.push(xliffFile);
        }
    }
    return xliffFiles;
}