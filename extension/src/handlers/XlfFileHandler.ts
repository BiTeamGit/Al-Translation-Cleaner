import { showErrorAndLog, throwErrorAndLog } from "../logging/LogHelper";
import { ALObjectHeader, findAlSourceInWorkspace } from "./ALFileHandler";
import path from "path";
import vscode, { Uri } from "vscode";

/**
 * Finds the specified translation unit ID in all XLIFF files in the workspace and processes the results.
 * @param alObjectHeader The AL object header containing the object type, name, and ID
 * @param progress The progress callback to report progress updates
 * @returns An array of XLFFile objects that contain the translation unit ID, along with their target language and the total number of translation units found
 */
export async function findTransUnitIdInXliffFiles(alObjectHeader: ALObjectHeader, progress: vscode.Progress<{ message?: string; increment?: number }>): Promise<XLFFile[] | null> {
  const XLFFiles: XLFFile[] = [];
  const xlfFilesUri = await vscode.workspace.findFiles("**/*.xlf", "**/node_modules/**", 100000);

  if (xlfFilesUri.length === 0) {
    showErrorAndLog("findTransUnitIdInXliffFiles", new Error("No XLIFF files found in workspace"), true);
    return null;
  }
  progress.report({ message: `Searching ${xlfFilesUri.length} xml files...` });

  for (const fileUri of xlfFilesUri) {
    const XLFFile: XLFFile = { filePath: fileUri.fsPath, targetLanguage: "", transUnits: [] };
    const document = await vscode.workspace.openTextDocument(fileUri);
    const lines = document.getText().split("\n");

    //Only try to find target language if the file is not a .g.xlf file, since those are the default language
    if (!path.basename(fileUri.fsPath).endsWith(".g.xlf")) {
      XLFFile.targetLanguage = findTargetLanguageInFile(lines);
      if (!XLFFile.targetLanguage) {
        showErrorAndLog("findTransUnitIdInXliffFiles", new Error(`Could not find target language for file ${path.basename(fileUri.fsPath)}`), true);
        return null;
      }
    }

    //Only add the file to the results if it contains the translation unit ID, otherwise remove it from the list
    XLFFile.transUnits = findTranslationUnitInFile(alObjectHeader, lines);
    if (XLFFile.transUnits.length === 0) {
      continue;
    }
    progress.report({ increment: 50 / xlfFilesUri.length });
    XLFFiles.push(XLFFile);
  }
  progress.report({ increment: 50 });
  return XLFFiles;
}

/**
 * Finds all TransUnits in the file that contain the specified translation unit ID.
 * @param alObjectHeader The AL object header containing the object type, name, and ID to search for in the XLIFF file
 * @param lines The lines of the XLIFF file
 * @returns An array of TransUnits that match the specified translation unit ID
 */ //TODO: Get the property name and Control
function findTranslationUnitInFile(alObjectHeader: ALObjectHeader, lines: string[]): TransUnity[] {
  const transUnits: TransUnity[] = [];
  const ObjectUnitId = `${alObjectHeader.objectType} ${alObjectHeader.objectId}`;
  for (const line of lines) {
    if (line.includes(ObjectUnitId)) {
      const parsedId = parseXliffId(line.match(/<trans-unit\s+id="([^"]+)"\s+[^>]*>/i)?.[1] || "");
      const source = lines[lines.indexOf(line) + 1].match(/<source>(.*)<\/source>/);
      const translation = lines[lines.indexOf(line) + 2].match(/<target[^>]*>(.*)<\/target>/)?.[1] || undefined;
      if (!source || !parsedId) {
        showErrorAndLog("findTranslationUnitInFile", new Error(`Could not parse trans-unit in file for object ${ObjectUnitId}`), true);
        return [];
      }
      transUnits.push({ objectType: parsedId.objectType, objectId: parsedId.objectId, objectName: parsedId.objectName, elementPath: parsedId.elementPath, propertyName: parsedId.propertyName, source: source[1], translation: translation, lineNumber: lines.indexOf(line) });
    }
  }
  return transUnits;
}

/**
 * Parses the line containing the trans-unit ID to extract the object type, object ID, object name, element path, and property name (if applicable).
 * @param xliffId The XLIFF ID string to parse
 * @returns An object containing the parsed information, or undefined if parsing fails
 */
function parseXliffId(xliffId: string): { objectType: string; objectId: string; objectName: string; elementPath: string[]; propertyName?: string } | undefined {
  const segments = xliffId.split(" - ");
  if (segments.length < 2) {
    showErrorAndLog("parseXliffId", new Error(`Invalid XLIFF ID format: ${xliffId}`), true);
    return undefined;
  }

  const objectMatch = segments[0].match(/^(\w+)\s+(\d+)$/);
  if (!objectMatch) {
    showErrorAndLog("parseXliffId", new Error(`Could not parse object segment: ${segments[0]}`), true);
    return undefined;
  }

  const objectType = objectMatch[1];
  const objectId = objectMatch[2];

  const elementPath: string[] = [];
  let propertyName: string | undefined;

  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];
    const segmentMatch = segment.match(/^(\w+)\s+(\d+)$/);
    if (segmentMatch) {
      const elementType = segmentMatch[1];
      const elementId = segmentMatch[2];

      if (elementType === "Property") {
        propertyName = mapPropertyIdToName(elementId);
      } else {
        elementPath.push(segment);
      }
    }
  }
  const objectName = `Object_${objectId}`;
  return {
    objectType,
    objectId,
    objectName,
    elementPath,
    propertyName
  };
}

/**
 * Returns the property name for a given property ID, or a default name if the ID is not recognized.
 * @param propertyId The ID of the property.
 * @returns The name of the property.
 */
function mapPropertyIdToName(propertyId: string): string {
  const propertyName = PROPERTY_MAP[propertyId];
  if (propertyName)
    return propertyName;
  showErrorAndLog("mapPropertyIdToName", new Error(`Unknown property ID: ${propertyId}`), true);
  return `Property_${propertyId}`;
}

export interface XLFFile {
  filePath: string;
  targetLanguage: string;
  transUnits: TransUnity[];
}

export interface TransUnity {
  objectType: string;
  objectId: string;
  objectName: string;
  elementPath: string[];
  propertyName?: string;
  source: string;
  translation?: string;
  lineNumber: number;
}

/**
 * Property ID to name mapping for common AL properties
 */
const PROPERTY_MAP: { [key: string]: string } = {
  "2879900210": "Caption",
  "1295455071": "ToolTip",
  "1829528612": "InstructionalText",
  "2053935350": "OptionCaption",
  "3798994825": "PromotedActionCategories",
  "1469443180": "RequestFilterHeading",
  "3526209625": "AdditionalSearchTerms",
  "2179816606": "EntityCaption",
  "1894906039": "EntitySetCaption",
  "2289949283": "ProfileDescription",
  "3234332997": "AboutTitle",
  "3234332998": "AboutText",
  "2879845413": "Label",
  "3519868930": "ReportLabel",
  "3333885854": "NamedType",
};




















export interface XliffFile {
  filePath: string;
  targetLanguage: string;
  transUnits: TransUnit[];
}

export interface TransUnit {
  lineNumber: number;
}

/**
 * Finds the translation unit ID in the given XLIFF document and returns the file information along with the line numbers of the translation units that match the specified AL object header. It also extracts the target language from the XLIFF file if it is not a generated .g.xlf file.
 * @param alObjectHeader The header information of the AL object.
 * @param document The XLIFF document.
 * @returns The XLIFF file information including translation units.
 */
export function searchForTransUnitIdInXliff(alObjectHeader: ALObjectHeader, document: vscode.TextDocument): XliffFile { //TODO: Split this function, it does too many things at once, also the name does not reflect what it does anymore since it also extracts the target language and not only searches for the trans-unit id
  const XLFFile: XliffFile = { filePath: document.uri.fsPath, targetLanguage: "", transUnits: [] };
  const lines = document.getText().split("\n");

  //Only try to find target language if the file is not a .g.xlf file, since those are the default language
  if (!path.basename(document.uri.fsPath).endsWith(".g.xlf")) {
    XLFFile.targetLanguage = findTargetLanguageInFile(lines);
  }

  const ObjectUnitId = `${alObjectHeader.objectType} ${alObjectHeader.objectId}`;
  for (const line of lines) {
    if (line.includes(ObjectUnitId)) {
      const lineNumber = lines.indexOf(line);
      XLFFile.transUnits.push({ lineNumber });
    }
  }

  return XLFFile;
}

/**
 * Finds the target language of the XLIFF file in the first 10 lines.
 * @param lines The lines of the XLIFF file
 * @returns The target language if found, otherwise throws an error
 */
function findTargetLanguageInFile(lines: string[]): string {
  for (let i = 0; i < 10; i++) {
    const line = lines[i];
    if (line.includes("<file")) {
      const targetLangMatch = line.match(/target-language="([^"]+)"/);
      if (targetLangMatch) {
        return targetLangMatch[1];
      }
    }
  }
  throwErrorAndLog("findTargetLanguageInFile", new Error("Could not find target language in the first 10 lines of the file"), true);
}

/**
 * Finds the source location in the AL code for a given translation unit by parsing the trans-unit ID and note to extract the element path and then searching for the corresponding AL source in the workspace.
 * @param lineNumber The line number of the trans-unit element in the XLIFF file.
 * @param document The XLIFF document.
 * @returns The location of the corresponding AL source, or undefined if not found.
 */
export async function findSourceLocationFromTansUnit(lineNumber: number, document: vscode.TextDocument): Promise<vscode.Location> {
  const transUnitData = extractTransUnitData(lineNumber, document);
  if (!transUnitData) {
    throw new Error("Not inside a trans-unit element")
  }

  const elementPath = parseXliffElementPath(transUnitData.id, transUnitData.note);

  if (elementPath.length === 0) {
    throw new Error("Could not parse trans-unit id and note into an element path")
  }

  return await findAlSourceInWorkspace(elementPath);
}

/**
 * Extracts the trans-unit ID and note from the XLIFF document at the specified line number.
 * @param lineNumber The line number of the trans-unit element in the XLIFF file.
 * @param document The XLIFF document.
 * @returns An object containing the trans-unit ID and note, or undefined if not found.
 */
function extractTransUnitData(lineNumber: number, document: vscode.TextDocument): { id: string; note: string } | undefined {//TODO: Save all informantions regarding the TransUnit in the transunit interface
  const maxLinesToCheck = 20;
  let transUnitId: string | undefined;
  let transUnitStartLine = -1;

  for (let i = lineNumber; i >= 0 && lineNumber - i < maxLinesToCheck; i--) {
    const lineText = document.lineAt(i).text;
    const idMatch = lineText.match(/<trans-unit\s+id="([^"]*)"/i);
    if (idMatch) {
      transUnitId = idMatch[1];
      transUnitStartLine = i;
      break;
    }
  }

  if (!transUnitId || transUnitStartLine === -1) {
    return undefined;
  }

  let xliffGeneratorNote: string | undefined;
  for (let i = transUnitStartLine; i < document.lineCount && i - transUnitStartLine <= maxLinesToCheck; i++) {
    const lineText = document.lineAt(i).text;
    if (i > transUnitStartLine && /<\/trans-unit>/i.test(lineText)) {
      break;
    }
    const noteMatch = lineText.match(/<note\s+from="Xliff Generator"[^>]*>(.*?)<\/note>/i);
    if (noteMatch) {
      xliffGeneratorNote = noteMatch[1];
      break;
    }
  }

  if (!xliffGeneratorNote) {
    return undefined;
  }

  return { id: transUnitId, note: xliffGeneratorNote };
}

/**
 * Parses the XLIFF element path from the trans-unit ID and note.
 * @param transUnitId The ID of the trans-unit element.
 * @param xliffGeneratorNote The note from the XLIFF generator.
 * @returns An array of objects representing the element path, each containing a type and name.
 */
function parseXliffElementPath(transUnitId: string, xliffGeneratorNote: string): { type: string; name: string }[] {//TODO: Save all informantions regarding the TransUnit in the transunit interface
  const idParts = transUnitId.split(" ").filter((x) => x !== "-");
  const types = idParts.filter((x) => isNaN(Number(x)));
  if (types.length === 0) {
    return [];
  }

  const result: { type: string; name: string }[] = [];
  let remainingNote = xliffGeneratorNote;

  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    const prefix = type + " ";

    if (!remainingNote.startsWith(prefix)) {
      break;
    }

    remainingNote = remainingNote.substring(prefix.length);
    let name: string;

    if (i < types.length - 1) {
      const nextType = types[i + 1];
      const seperatorIndex = remainingNote.indexOf(` - ${nextType}`);
      if (seperatorIndex === -1) {
        name = remainingNote;
        remainingNote = "";
      } else {
        name = remainingNote.substring(0, seperatorIndex);
        remainingNote = remainingNote.substring(seperatorIndex + 3);
      }
    } else {
      name = remainingNote;
    }
    result.push({ type, name: formatName(name) });
  }
  return result;
}

function formatName(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}