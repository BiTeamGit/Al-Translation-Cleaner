import * as vscode from "vscode";
import * as path from "path";
import { logger } from "../logging/LogHelper";

/**
 * Finds the specified translation unit ID in all XLIFF files in the workspace and processes the results.
 * @param transUnitId 
 * @returns 
 */
export async function findTransUnitIdInXliff(transUnitId: string) {
  const xlfFiles = await vscode.workspace.findFiles("**/*.xlf", "**/node_modules/**", 100000);

  if (xlfFiles.length === 0) {
    logger.log("No XLIFF files found in workspace.");
    return;
  }

  for (const fileUri of xlfFiles) {
    if (path.basename(fileUri.fsPath).endsWith(".g.xlf")) {
      continue; // Skip generated XLIFF files
    }

    try {
      const document = await vscode.workspace.openTextDocument(fileUri);
      const content = document.getText();
      processTranslation(fileUri.fsPath, transUnitId);//TODO: Implement actual processing logic instead of just logging
    } catch (error) {
      logger.error(`Error searching file ${fileUri.fsPath}: ${error}`);
    }
  }
}

//REMOVE: Placeholder function to demonstrate processing a translation unit found in an XLIFF file. Replace with actual logic as needed.
/**
 * Placeholder function to process a translation found in an XLIFF file.
 * @param xlfFilePath - The path to the XLIFF file
 * @param transUnitId - The translation unit ID found in the file
 */
export function processTranslation(xlfFilePath: string, transUnitId: string): void {
  logger.log(`XLF File: ${xlfFilePath}`);
  logger.log(`TransUnitId: ${transUnitId}`);
}