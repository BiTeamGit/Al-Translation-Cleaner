import vscode from "vscode";
import { logger, throwErrorAndLog } from "./logging/LogHelper";
import path from "path";
import { applyTranslationsToAlFile, buildAlFileIndex, findAlFileByObject, getALObjectHeader, insertMissingPropertiesInAlFile, resolveAlLocationsInFile } from "./handlers/ALFileHandler";
import { getUniqueObjectsFromXlf, mergeTranslations, parseXlfGroupedByObject, searchForTransUnitIdInXliff, XliffFile } from './handlers/XlfFileHandler';
import { getSettings } from "./settings/SettingsLoader";

/**
 * Finds all translation keys in the currently active AL file, gathers translations
 * from XLIFF files, and writes them to the AL file based on the translation method setting.
 */
export async function findTranslationsInALFile() {
    logger.log("Executing findTranslationsInALFile command...");
    const status = vscode.window.setStatusBarMessage("ATC: Find Translations in File...");

    //check if active editor is available and is an AL file
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        logger.log("findTranslationsInALFile command completed.");
        return;
    }
    if (path.extname(activeEditor.document.uri.fsPath) !== '.al') {
        throwErrorAndLog("findTranslationsInALFile", new Error("Active file is not an AL file"));
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

        // Insert any missing properties, then re-resolve so they get an alLocation
        if (settings.addMissingProperties) {
            const inserted = await insertMissingPropertiesInAlFile(activeEditor.document.uri, transUnits);
            if (inserted > 0) {
                const newLines = activeEditor.document.getText().split(/\r?\n/);
                header.lines = newLines;
                resolveAlLocationsInFile(transUnits, header);
            }
        }
        progress.report({ increment: 20 });

        // Write translations to the AL file
        progress.report({ message: "Writing translations..." });
        const languageOrder = Object.values(settings.languageMapping);
        await applyTranslationsToAlFile(activeEditor.document.uri, transUnits, settings.translationMethod, languageOrder);
        progress.report({ increment: 30 });
    });

    logger.log("findTranslationsInALFile command completed.");
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

/**
 * Finds all AL objects referenced in the currently active XLF file and applies
 * only the translations from that single XLF file to the corresponding AL files.
 */
export async function findTranslationsInXliffFile() {
    logger.log("Executing findTranslationsInXliffFile command...");
    const status = vscode.window.setStatusBarMessage("ATC: Find Translations in XLF File...");

    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        logger.log("findTranslationsInXliffFile command completed.");
        return;
    }
    if (path.extname(activeEditor.document.uri.fsPath) !== '.xlf') {
        throwErrorAndLog("findTranslationsInXliffFile", new Error("Active file is not an XLF file"));
    }

    const settings = getSettings();

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Processing XLF file translations...",
        cancellable: false
    }, async (progress) => {
        // Parse the XLF file once, grouping trans-units by AL object
        progress.report({ message: "Parsing XLF file..." });
        const groupedXlf = parseXlfGroupedByObject(activeEditor.document);
        if (groupedXlf.transUnitsByObject.size === 0) {
            logger.log("No AL objects found in XLF file.");
            return;
        }
        progress.report({ increment: 10 });

        // Build an index of all AL files in the workspace once
        progress.report({ message: "Indexing AL files..." });
        const alIndex = await buildAlFileIndex();
        progress.report({ increment: 20 });

        const objectKeys = Array.from(groupedXlf.transUnitsByObject.keys());
        const progressPerObject = 70 / objectKeys.length;
        const languageOrder = Object.values(settings.languageMapping);

        for (let i = 0; i < objectKeys.length; i++) {
            const objectKey = objectKeys[i];
            const transUnitsForObject = groupedXlf.transUnitsByObject.get(objectKey)!;
            const [objectType, objectName] = objectKey.split("|");
            progress.report({ message: `Processing ${objectType} "${objectName}" (${i + 1}/${objectKeys.length})...` });

            // Look up the AL file from the pre-built index
            const header = alIndex.get(objectKey);
            if (!header) {
                logger.log(`Could not find AL file for ${objectType} "${objectName}"`);
                continue;
            }

            // Build an XliffFile from the pre-parsed trans-units
            const xliffFile: XliffFile = {
                filePath: groupedXlf.filePath,
                targetLanguage: groupedXlf.targetLanguage,
                transUnits: transUnitsForObject,
            };

            const transUnits = mergeTranslations([xliffFile], settings.languageMapping);

            // Resolve AL source locations in the file
            resolveAlLocationsInFile(transUnits, header);

            // Insert any missing properties, then re-resolve so they get an alLocation
            if (settings.addMissingProperties) {
                const inserted = await insertMissingPropertiesInAlFile(header.fileUri, transUnits);
                if (inserted > 0) {
                    const doc = await vscode.workspace.openTextDocument(header.fileUri);
                    header.lines = doc.getText().split(/\r?\n/);
                    resolveAlLocationsInFile(transUnits, header);
                }
            }

            // Apply translations
            await applyTranslationsToAlFile(header.fileUri, transUnits, settings.translationMethod, languageOrder);

            progress.report({ increment: progressPerObject });
        }
    });

    logger.log("findTranslationsInXliffFile command completed.");
    status.dispose();
}