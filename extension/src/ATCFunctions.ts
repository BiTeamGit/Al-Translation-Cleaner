import vscode from "vscode";
import { logger, throwErrorAndLog } from "./logging/LogHelper";
import path from "path";
import { getALObjectHeader } from "./handlers/ALFileHandler";
import { findSourceLocationFromTansUnit, findTransUnitIdInXliffFiles, searchForTransUnitIdInXliff } from './handlers/XlfFileHandler';

/**
 * Finds all translation keys in the currently active AL file and searches for them in all XLIFF files except generated ones(.g.xlf).
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

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Searching for translations in XLIFF files...",
        cancellable: false
    }, async (progress) => {
        const header = getALObjectHeader(activeEditor.document.getText().split(/\r?\n/));

        // Get all XLIFF files in the workspace
        const xlfFilesUri = await vscode.workspace.findFiles("**/*.xlf", "**/node_modules/**", 100000);
        if (xlfFilesUri.length === 0) {
            logger.log("No XLIFF files found in the workspace.");
            logger.log("findTranslationsInFile command completed.");
            return;
        }

        // Get translation units from all XLIFF files and find source locations
        progress.report({ message: `Searching ${xlfFilesUri.length} xlf files...` });
        for (const fileUri of xlfFilesUri) {
            const XliffDocument = await vscode.workspace.openTextDocument(fileUri);

            const XliffFile = await searchForTransUnitIdInXliff(header, XliffDocument);
            for (const transUnit of XliffFile.transUnits) {
                const location = await findSourceLocationFromTansUnit(transUnit.lineNumber, XliffDocument);
                logger.log(`Found translation for ${header.objectType} ${header.objectId} in file ${path.basename(fileUri.fsPath)} at line ${location.range.start.line + 1}`);
            }
            progress.report({ increment: 50 / xlfFilesUri.length })
        }
    });

    logger.log("findTranslationsInFile command completed.");

    status.dispose();

}