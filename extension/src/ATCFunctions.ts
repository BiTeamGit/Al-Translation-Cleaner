import * as vscode from 'vscode';
import { logger } from "./logging/LogHelper";
import path from "path";
import { createObjectTransUnitId } from "./handlers/ALFileHandler";
import { findTransUnitIdInXliff } from './handlers/XlfFileHandler';

/**
 * Finds all translation keys in the currently active AL file and searches for them in all XLIFF files except generated ones(.g.xlf).
 */
export async function findTranslationsInFile() {
    logger.log("Executing findTranslationsInFile command...");
    const status = vscode.window.setStatusBarMessage("Finding translations in XLIFF files...");

    //check if active editor is available and is an AL file
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        await vscode.window.showErrorMessage("No active editor");
        return;
    }
    if (path.extname(activeEditor.document.uri.fsPath) !== '.al') {
        await vscode.window.showErrorMessage("The currently opened file is not an .al file.");
        return;
    }

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Searching for translations in XLIFF files...",
            cancellable: false
        }, async (progress) => {

            const xliffId = createObjectTransUnitId(activeEditor.document.getText().split(/\r?\n/));
            progress.report({ increment: 1 });

            // Search for the trans-unit in all XLIFF files
            await findTransUnitIdInXliff(xliffId);

            progress.report({ increment: 100 });
        });

        logger.log("findTranslationsInFile command completed.");
    } catch (error) {
        showErrorAndLog("findTranslationsInFile", error as Error);
        return;
    } finally {
        status.dispose();
    }
}

/**
 * Shows an error message to the user and logs the error details.
 * @param action The action that failed.
 * @param error The error object.
 * @param modal Whether the error message should be modal.
 */
export function showErrorAndLog(
    action: string,
    error: Error,
    modal = false
): void {
    const errMsg = `${action} failed with error: ${error.message}`;
    vscode.window.showErrorMessage(errMsg, { modal: modal });
    logger.error(`${error.message}`);
    logger.log(`Stack trace: ${error.stack}`);
}