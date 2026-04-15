import vscode from "vscode";
import { logger, throwErrorAndLog } from "./logging/LogHelper";
import path from "path";
import { applyTranslationsToAlFile, buildAlFileIndex, findAlFileByObject, getALObjectHeader, insertMissingPropertiesInAlFile, NotFoundTransUnit, resolveAlLocationsInFile } from "./handlers/ALFileHandler";
import { getUniqueObjectsFromXlf, mergeTranslations, parseXlfGroupedByObject, parseXlfGroupedByObjectId, searchForTransUnitIdInXliff, XliffFile, GroupedXlfByIdResult } from './handlers/XlfFileHandler';
import { getSettings } from "./settings/SettingsLoader";

/**
 * Finds all translation keys in the currently active AL file, gathers translations
 * from XLIFF files, and writes them to the AL file based on the translation method setting.
 */
export async function writeTranslationsToCommentsInALFile() {
    logger.log("Executing writeTranslationsToCommentsInALFile command...");
    const status = vscode.window.setStatusBarMessage("ATC: Find Translations in File...");

    //check if active editor is available and is an AL file
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        logger.log("writeTranslationsToCommentsInALFile command completed.");
        return;
    }
    if (path.extname(activeEditor.document.uri.fsPath) !== '.al') {
        throwErrorAndLog("writeTranslationsToCommentsInALFile", new Error("Active file is not an AL file"));
    }

    const settings = getSettings();

    let notFoundItems: NotFoundTransUnit[] = [];
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
        notFoundItems = resolveAlLocationsInFile(transUnits, header);

        progress.report({ increment: 20 });

        // Write translations to the AL file
        progress.report({ message: "Writing translations..." });
        const languageOrder = Object.values(settings.languageMapping);
        await applyTranslationsToAlFile(activeEditor.document.uri, transUnits, settings.translationMethod, languageOrder);
        progress.report({ increment: 30 });
    });

    await handleNotFoundTransUnits(notFoundItems, settings.whenTranslationNotFound);

    logger.log("writeTranslationsToCommentsInALFile command completed.");
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
export async function writeTranslationsFromXliffToALFile() {
    logger.log("Executing writeTranslationsFromXliffToALFile command...");
    const status = vscode.window.setStatusBarMessage("ATC: Write Translations in current Xliff File to AL File Comments...");

    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        logger.log("writeTranslationsFromXliffToALFile command completed.");
        return;
    }
    if (path.extname(activeEditor.document.uri.fsPath) !== '.xlf') {
        throwErrorAndLog("writeTranslationsFromXliffToALFile", new Error("Active file is not an XLF file"));
    }

    const settings = getSettings();

    const allNotFound: NotFoundTransUnit[] = [];
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
            allNotFound.push(...resolveAlLocationsInFile(transUnits, header));

            // Apply translations
            await applyTranslationsToAlFile(header.fileUri, transUnits, settings.translationMethod, languageOrder);

            progress.report({ increment: progressPerObject });
        }
    });

    await handleNotFoundTransUnits(allNotFound, settings.whenTranslationNotFound);

    logger.log("writeTranslationsFromXliffToALFile command completed.");
    status.dispose();
}
/**
 * Finds all XLF files in the workspace and applies translations from each
 * to the corresponding AL files.
 * Uses the same ID-based trans-unit matching as writeTranslationsToCommentsInALFile
 * to ensure consistent results.
 */
export async function writeTranslationsFromAllXliffToALFiles() {
    logger.log("Executing writeTranslationsFromAllXliffToALFiles command...");
    const status = vscode.window.setStatusBarMessage("ATC: Write Translations from All Xliff Files to AL File Comments...");

    const settings = getSettings();

    const allNotFound: NotFoundTransUnit[] = [];
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Processing all XLF files...",
        cancellable: false
    }, async (progress) => {
        // Find all XLF files
        progress.report({ message: "Finding XLF files..." });
        const xlfFilesUri = await vscode.workspace.findFiles("**/*.xlf", "**/node_modules/**", 100000);
        if (xlfFilesUri.length === 0) {
            logger.log("No XLIFF files found in the workspace.");
            vscode.window.showInformationMessage("No XLIFF files found in the workspace.");
            return;
        }
        progress.report({ increment: 5 });

        // Build an index of all AL files in the workspace once
        progress.report({ message: "Indexing AL files..." });
        const alIndex = await buildAlFileIndex();
        progress.report({ increment: 10 });

        // Parse each XLF file once, grouping trans-units by object ID
        progress.report({ message: "Parsing XLF files..." });
        const parsedXlfs: GroupedXlfByIdResult[] = [];
        for (const xlfUri of xlfFilesUri) {
            const doc = await vscode.workspace.openTextDocument(xlfUri);
            parsedXlfs.push(parseXlfGroupedByObjectId(doc));
        }
        progress.report({ increment: 10 });

        const alHeaders = Array.from(alIndex.values());
        if (alHeaders.length === 0) {
            vscode.window.showInformationMessage("No AL files found in the workspace.");
            return;
        }

        const languageOrder = Object.values(settings.languageMapping);
        const progressPerObject = 75 / alHeaders.length;
        let processedObjects = 0;
        let objectsWithTranslations = 0;

        // For each AL file, look up matching trans-units from pre-parsed XLF maps
        for (const header of alHeaders) {
            processedObjects++;
            progress.report({
                message: `Processing ${header.objectType} "${header.objectName}" (${processedObjects}/${alHeaders.length})...`
            });

            const objectIdKey = `${header.objectType} ${header.objectId}`;

            // Collect matching trans-units from each parsed XLF file
            const xliffFiles: XliffFile[] = [];
            for (const parsed of parsedXlfs) {
                const transUnits = parsed.transUnitsByObjectId.get(objectIdKey);
                if (transUnits && transUnits.length > 0) {
                    xliffFiles.push({
                        filePath: parsed.filePath,
                        targetLanguage: parsed.targetLanguage,
                        transUnits,
                    });
                }
            }

            if (xliffFiles.length === 0) {
                progress.report({ increment: progressPerObject });
                continue;
            }

            // Merge translations from all XLF files for this object
            const transUnits = mergeTranslations(xliffFiles, settings.languageMapping);

            // Resolve AL source locations in the file
            allNotFound.push(...resolveAlLocationsInFile(transUnits, header));

            // Apply translations
            await applyTranslationsToAlFile(header.fileUri, transUnits, settings.translationMethod, languageOrder);

            objectsWithTranslations++;
            progress.report({ increment: progressPerObject });
        }

        vscode.window.showInformationMessage(`Successfully processed ${objectsWithTranslations} AL object(s) with translations from ${parsedXlfs.length} XLIFF file(s).`);
    });

    await handleNotFoundTransUnits(allNotFound, settings.whenTranslationNotFound);

    logger.log("writeTranslationsFromAllXliffToALFiles command completed.");
    status.dispose();
}

async function handleNotFoundTransUnits(notFoundItems: NotFoundTransUnit[], whenNotFound: "log" | "ask" | "delete"): Promise<void> {
    if (notFoundItems.length === 0) {
        return;
    }

    if (whenNotFound === "log") {
        for (const item of notFoundItems) {
            const tu = item.transUnit;
            logger.log(`Text: "${tu.source}", XLF: ${tu.xlfFilePath ?? "unknown"}:${tu.lineNumber + 1} , AL: ${item.alFileUri.fsPath}`);
        }
        return;
    }

    if (whenNotFound === "ask") {
        const deletions = new Map<string, { originalLine: number; linesDeleted: number }[]>();
        for (const item of notFoundItems) {
            const tu = item.transUnit;
            const fileDeletions = tu.xlfFilePath ? (deletions.get(tu.xlfFilePath) ?? []) : [];
            const adjustment = fileDeletions
                .filter(d => d.originalLine < tu.lineNumber)
                .reduce((sum, d) => sum + d.linesDeleted, 0);
            const adjustedLine = tu.lineNumber - adjustment;
            const message = `Translation not found: "${tu.source}"`;

            let resolved = false;
            while (!resolved) {
                const result = await vscode.window.showWarningMessage(
                    message,
                    "Open XLF",
                    "Search in AL",
                    "Delete",
                    "Skip"
                );

                if (result === "Open XLF") {
                    if (tu.xlfFilePath) {
                        const doc = await vscode.workspace.openTextDocument(tu.xlfFilePath);
                        await vscode.window.showTextDocument(doc, {
                            selection: new vscode.Range(adjustedLine, 0, adjustedLine, 0)
                        });
                    }
                } else if (result === "Search in AL") {
                    const doc = await vscode.workspace.openTextDocument(item.alFileUri);
                    await vscode.window.showTextDocument(doc);
                    await vscode.commands.executeCommand("editor.actions.findWithArgs", {
                        searchString: tu.source
                    });
                } else if (result === "Delete") {
                    if (tu.xlfFilePath) {
                        const linesDeleted = await deleteTransUnitFromXlf(tu.xlfFilePath, adjustedLine);
                        if (!deletions.has(tu.xlfFilePath)) {
                            deletions.set(tu.xlfFilePath, []);
                        }
                        deletions.get(tu.xlfFilePath)!.push({ originalLine: tu.lineNumber, linesDeleted });
                    }
                    resolved = true;
                } else {
                    // Skip or dismissed
                    logger.log(`Text: "${tu.source}", XLF: ${tu.xlfFilePath ?? "unknown"}:${tu.lineNumber + 1} , AL: ${item.alFileUri.fsPath}`);
                    resolved = true;
                }
            }
        }
    }

    if (whenNotFound === "delete") {
        const confirmed = await vscode.window.showWarningMessage(
            `!WARNING! ATC will delete ${notFoundItems.length} translation unit(s) from your XLF file(s) that could not be matched to AL source. Please make sure you have a backup before proceeding. This action cannot be undone.`,
            { modal: true },
            "Delete All"
        );
        if (confirmed !== "Delete All") {
            logger.log("User cancelled bulk deletion of not-found trans-units.");
            return;
        }

        // Group by file and sort descending by line number so deletions don't shift later lines
        const byFile = new Map<string, NotFoundTransUnit[]>();
        for (const item of notFoundItems) {
            const filePath = item.transUnit.xlfFilePath;
            if (!filePath) {
                continue;
            }
            if (!byFile.has(filePath)) {
                byFile.set(filePath, []);
            }
            byFile.get(filePath)!.push(item);
        }

        for (const [filePath, items] of byFile) {
            items.sort((a, b) => b.transUnit.lineNumber - a.transUnit.lineNumber);
            for (const item of items) {
                await deleteTransUnitFromXlf(filePath, item.transUnit.lineNumber);
            }
        }
    }
}

async function deleteTransUnitFromXlf(xlfFilePath: string, transUnitLine: number): Promise<number> {
    const doc = await vscode.workspace.openTextDocument(xlfFilePath);
    const text = doc.getText();
    const lines = text.split("\n");

    // Find the start of the <trans-unit> block (should be at transUnitLine)
    let startLine = transUnitLine;
    while (startLine > 0 && !/<trans-unit\b/i.test(lines[startLine])) {
        startLine--;
    }

    // Find the closing </trans-unit>
    let endLine = startLine;
    while (endLine < lines.length && !/<\/trans-unit>/i.test(lines[endLine])) {
        endLine++;
    }

    if (endLine >= lines.length) {
        logger.log(`Could not find closing </trans-unit> tag in ${xlfFilePath} starting from line ${transUnitLine + 1}`);
        return 0;
    }

    const linesDeleted = endLine - startLine + 1;
    const edit = new vscode.WorkspaceEdit();
    // Delete from start of the trans-unit line to the end of the closing tag line (including newline)
    const deleteEnd = endLine + 1 < lines.length
        ? new vscode.Position(endLine + 1, 0)
        : new vscode.Position(endLine, lines[endLine].length);
    edit.delete(doc.uri, new vscode.Range(new vscode.Position(startLine, 0), deleteEnd));
    await vscode.workspace.applyEdit(edit);
    await doc.save();
    return linesDeleted;
}
