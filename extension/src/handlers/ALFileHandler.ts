import vscode from "vscode";
import { logger, throwErrorAndLog } from "../logging/LogHelper";
import { TransUnit } from "./XlfFileHandler";

export interface ALObjectHeader {
  objectType: string;
  objectName: string;
  objectId: number;
  fileUri: vscode.Uri;
  lines: string[];
}

/**
 * Gets the header information of an AL object from the given file.
 * @param lines The lines of the AL file.
 * @returns An object containing the object type, name, and ID.
 */
export function getALObjectHeader(lines: string[], fileUri: vscode.Uri): ALObjectHeader {
  const headerPattern = /^\s*(table|page|report|codeunit|query|xmlport|enum|enumextension|pageextension|tableextension|reportextension|controladdin|profile)\s+(\d+\s+)?("?[^"]+"?)/i;
  let objectType: string | undefined;
  let objectName: string | undefined;
  let objectId: number | undefined;

  for (const line of lines) {
    const match = headerPattern.exec(line);
    if (match) {
      objectType = objectTypeMap.get(match[1].toLowerCase());
      if (!objectType) {
        continue;
      }

      let name = match[3].trim();
      if (name.startsWith('"') && name.endsWith('"')) {
        name = name.substring(1, name.length - 1).replace(/""/g, '"');
      }
      objectName = name;
      break;
    }
  }

  if (!objectType || !objectName) {
    throwErrorAndLog("getALObjectHeader", new Error("Could not determine AL object type and name from the file."));
  }

  objectId = getXliffId(objectName);
  return { objectType, objectName, objectId, fileUri, lines };
}


/**
 * Generates the XLIFF ID for the given AL object name.
 * @param name The name of the AL object.
 * @returns The XLIFF ID as a number.
 */
function getXliffId(name: string): number {
  let processedName = name;
  if (processedName.startsWith('"') && processedName.endsWith('"')) {
    if (!processedName.substring(1, processedName.length - 1).includes('"')) {
      processedName = processedName.substring(1, processedName.length - 1);
    }
  }

  // Compute the FNV-1a hash for the AL object name
  const data = Buffer.from(processedName, "utf16le");
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    hash = hash ^ data[i];
    hash += (hash << 24) + (hash << 8) + (hash << 7) + (hash << 4) + (hash << 1);
  }
  hash = hash & 0xffffffff;
  const id = hash + 2147483647;

  return id;
}

const objectTypeMap = new Map<string, string>([
  ["table", "Table"],
  ["page", "Page"],
  ["report", "Report"],
  ["codeunit", "Codeunit"],
  ["query", "Query"],
  ["xmlport", "XmlPort"],
  ["enum", "Enum"],
  ["enumextension", "EnumExtension"],
  ["pageextension", "PageExtension"],
  ["tableextension", "TableExtension"],
  ["reportextension", "ReportExtension"],
  ["controladdin", "ControlAddIn"],
  ["profile", "Profile"],
]);






export async function findAlSourceInWorkspace(elementPath: { type: string; name: string }[]): Promise<vscode.Location> {
  if (elementPath.length === 0) {
    throwErrorAndLog("findAlSourceInWorkspace", new Error("Element path cannot be empty"));
  }

  const objectType = elementPath[0].type.toLowerCase();
  const objectName = elementPath[0].name;
  const escapedName = objectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const objectPattern = new RegExp(`^\\s*${objectType}\\s+\\d+\\s+(?:"${escapedName}"|${escapedName})(?:\\s|$)`, "im");

  const alFiles = await vscode.workspace.findFiles("**/*.al");

  for (const fileUri of alFiles) {
    let fileContext: string;
    try {
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      fileContext = Buffer.from(bytes).toString("utf8");
    } catch (error) {
      continue;
    }

    if (!objectPattern.test(fileContext)) {
      continue;
    }

    const lines = fileContext.split(/\r?\n/);
    const subPath = elementPath.slice(1);

    let targetLine: number | undefined;
    if (subPath.length > 0) {
      targetLine = findTargetLineInAlFile(lines, subPath);
    }

    if (targetLine === undefined) {
      for (let i = 0; i < lines.length; i++) {
        if (objectPattern.test(lines[i])) {
          targetLine = i;
          break;
        }
      }
    }

    if (targetLine !== undefined && targetLine < lines.length) {
      const lineText = lines[targetLine];
      const indent = lineText.length - lineText.trimStart().length;
      return new vscode.Location(fileUri, new vscode.Range(targetLine, indent, targetLine, lineText.length));
    }
  }

  throwErrorAndLog("findAlSourceInWorkspace", new Error("Could not find AL source in workspace"));
}

function findTargetLineInAlFile(lines: string[], subPath: { type: string; name: string }[]): number | undefined {
  if (subPath.length === 0) {
    return undefined;
  }

  let startLine = 0;
  let endLine = lines.length;

  for (let depth = 0; depth < subPath.length; depth++) {
    const containerLine = findAlElementLine(lines, subPath[depth], startLine, endLine);
    if (containerLine === undefined) {
      break;
    }

    startLine = containerLine;
    endLine = findAlScopeEnd(lines, containerLine);
  }

  const lastElement = subPath[subPath.length - 1];
  const result = findAlElementLine(lines, lastElement, startLine, endLine);
  if (result !== undefined) {
    return result;
  }

  // Don't fall back to a container line when searching for a property that doesn't exist in the scope
  if (lastElement.type.toLowerCase() === "property") {
    return undefined;
  }

  if (subPath.length > 1) {
    return findAlElementLine(lines, subPath[0], 0, lines.length);
  }

  return undefined;
}

function findAlElementLine(
  lines: string[],
  element: { type: string; name: string },
  startLine: number,
  endLine: number
): number | undefined {
  const type = element.type.toLowerCase();
  const escapedName = element.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  for (let i = startLine; i < endLine && i < lines.length; i++) {
    const trimmed = lines[i].trim();

    switch (type) {
      case "field":
        if (
          new RegExp(
            `^field\\s*\\(\\s*\\d+\\s*;\\s*"?${escapedName}"?\\s*;`,
            "i"
          ).test(trimmed)
        ) {
          return i;
        }
        break;

      case "control":
        if (
          new RegExp(
            `^(?:field|group|part|repeater|area|cuegroup|grid|fixed|usercontrol|label)\\s*\\(\\s*"?${escapedName}"?\\s*[;)]`,
            "i"
          ).test(trimmed)
        ) {
          return i;
        }
        break;

      case "action": {
        // Match action/area/group/separator with the name (XLIFF uses "Action" type for all)
        if (
          new RegExp(
            `^(?:action|area|group|separator)\\s*\\(\\s*"?${escapedName}"?\\s*\\)`,
            "i"
          ).test(trimmed)
        ) {
          return i;
        }
        // Also handle XLIFF note names that include the keyword, e.g. "area(Processing)"
        const actionContainerMatch = element.name.match(/^(area|group|separator)\((.+)\)$/i);
        if (actionContainerMatch) {
          const keyword = actionContainerMatch[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const innerName = actionContainerMatch[2].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          if (
            new RegExp(
              `^${keyword}\\s*\\(\\s*"?${innerName}"?\\s*\\)`,
              "i"
            ).test(trimmed)
          ) {
            return i;
          }
        }
        break;
      }

      case "enumvalue":
      case "value":
        if (
          new RegExp(
            `^value\\s*\\(\\s*\\d+\\s*;\\s*"?${escapedName}"?\\s*\\)`,
            "i"
          ).test(trimmed)
        ) {
          return i;
        }
        break;

      case "column":
      case "dataitem":
        if (
          new RegExp(
            `^${type}\\s*\\(\\s*"?${escapedName}"?\\s*[;)]`,
            "i"
          ).test(trimmed)
        ) {
          return i;
        }
        break;

      case "method":
        if (
          new RegExp(
            `(?:procedure|trigger)\\s+"?${escapedName}"?\\s*\\(`,
            "i"
          ).test(trimmed)
        ) {
          return i;
        }
        break;

      case "property":
        if (new RegExp(`^${escapedName}\\s*=`, "i").test(trimmed)) {
          return i;
        }
        break;

      case "namedtype":
        if (new RegExp(`^"?${escapedName}"?\\s*:`, "i").test(trimmed)) {
          return i;
        }
        break;

      case "reportlabel":
        if (new RegExp(`^"?${escapedName}"?\\s*=`, "i").test(trimmed)) {
          return i;
        }
        break;

      default:
        if (new RegExp(`\\b${escapedName}\\b`, "i").test(trimmed)) {
          return i;
        }
        break;
    }
  }

  return undefined;
}

function findAlScopeEnd(lines: string[], startLine: number): number {
  // Procedures and triggers use begin/end instead of braces
  const startTrimmed = lines[startLine].trim().toLowerCase();
  if (/^(?:(?:local\s+|internal\s+)?procedure|trigger)\b/.test(startTrimmed)) {
    return findBeginEndScopeEnd(lines, startLine);
  }

  let braceCount = 0;
  let foundOpenBrace = false;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === "{") {
        braceCount++;
        foundOpenBrace = true;
      } else if (ch === "}") {
        braceCount--;
        if (foundOpenBrace && braceCount <= 0) {
          return i + 1;
        }
      }
    }
  }

  if (!foundOpenBrace) {
    const startIndent = lines[startLine].search(/\S/);
    for (let i = startLine + 1; i < lines.length; i++) {
      if (lines[i].trim() === "") {
        continue;
      }
      const indent = lines[i].search(/\S/);
      if (indent <= startIndent) {
        return i;
      }
    }
  }

  return lines.length;
}

/**
 * Finds the scope end for a procedure or trigger by tracking begin/end nesting.
 */
function findBeginEndScopeEnd(lines: string[], startLine: number): number {
  let depth = 0;

  for (let i = startLine + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim().toLowerCase();
    if (trimmed === "") {
      continue;
    }

    const beginMatches = trimmed.match(/\bbegin\b/g);
    const endMatches = trimmed.match(/\bend\s*;/g);

    if (beginMatches) {
      depth += beginMatches.length;
    }
    if (endMatches) {
      depth -= endMatches.length;
      if (depth <= 0) {
        return i + 1;
      }
    }
  }

  return lines.length;
}

/**
 * Applies translations from the merged trans-units to the AL file.
 * Sorts edits bottom-up so line numbers remain stable.
 *
 * Translation methods:
 * - "replace": Replace source text with .g.xlf value and replace all translations in Comment.
 * - "ask": Add missing translations silently, ask user before replacing differing translations.
 * - "add": Only add missing translations, never modify existing values.
 */
/**
 * Resolves AL source locations for each trans-unit using the already-loaded file lines,
 * avoiding a full workspace scan.
 */
export function resolveAlLocationsInFile(transUnits: TransUnit[], header: ALObjectHeader): void {
  for (const tu of transUnits) {
    if (tu.elementPath.length === 0) {
      continue;
    }
    const subPath = tu.elementPath.slice(1);

    // Ensure we navigate to the actual property line, not just the container
    if (tu.propertyName && tu.propertyName !== "Label" && !subPath.some(e => e.type === "Property")) {
      subPath.push({ type: "Property", name: tu.propertyName });
    }

    let targetLine: number | undefined;
    if (subPath.length > 0) {
      targetLine = findTargetLineInAlFile(header.lines, subPath);
    }
    if (targetLine !== undefined && targetLine < header.lines.length) {
      const lineText = header.lines[targetLine];

      // Skip properties on usercontrol declarations (they don't have translatable properties)
      if (/^\s*usercontrol\s*\(/i.test(lineText) && tu.propertyName) {
        continue;
      }

      const indent = lineText.length - lineText.trimStart().length;
      tu.alLocation = new vscode.Location(
        header.fileUri,
        new vscode.Range(targetLine, indent, targetLine, lineText.length)
      );
    } else {
      logger.log(`Could not find AL source for: ${tu.elementPath.map(e => `${e.type} ${e.name}`).join(" - ")}`);
    }
  }
}

export async function applyTranslationsToAlFile(
  fileUri: vscode.Uri,
  transUnits: TransUnit[],
  translationMethod: string,
  languageOrder: string[]
): Promise<void> {
  const toApply = transUnits.filter(tu => tu.alLocation && tu.translations.size > 0);
  if (toApply.length === 0) {
    logger.log("No translations to apply.");
    return;
  }

  const document = await vscode.workspace.openTextDocument(fileUri);

  // Sort descending by line number so earlier edits don't shift later ones
  toApply.sort((a, b) => b.alLocation!.range.start.line - a.alLocation!.range.start.line);

  const workspaceEdit = new vscode.WorkspaceEdit();
  let editCount = 0;
  let anyEditsApplied = false;

  for (const tu of toApply) {
    const line = tu.alLocation!.range.start.line;
    if (line >= document.lineCount) {
      continue;
    }

    const lineText = document.lineAt(line).text;
    let newLineText: string | undefined;

    switch (translationMethod) {
      case "replace":
        newLineText = buildTranslatedPropertyLine(lineText, tu, "replace", true, languageOrder);
        break;

      case "ask": {
        const addOnlyLine = buildTranslatedPropertyLine(lineText, tu, "add", false, languageOrder);
        const replaceTransLine = buildTranslatedPropertyLine(lineText, tu, "replace", false, languageOrder);

        const hasModifications = replaceTransLine !== undefined
          && replaceTransLine !== lineText
          && replaceTransLine !== addOnlyLine;

        if (hasModifications) {
          const choice = await vscode.window.showInformationMessage(
            `Translations differ on line ${line + 1}. Replace existing translations?\nCurrent: ${lineText.trim()}\nProposed: ${replaceTransLine!.trim()}`,
            "Replace", "Add missing only", "Skip", "Cancel all"
          );
          if (choice === "Cancel all") { return; }
          if (choice === "Replace") {
            newLineText = replaceTransLine;
          } else if (choice === "Add missing only") {
            newLineText = addOnlyLine;
          }
          // "Skip" or dismissed → newLineText stays undefined
        } else {
          // Only additions (or nothing), apply silently
          newLineText = addOnlyLine;
        }

        if (newLineText !== undefined && newLineText !== lineText) {
          const askEdit = new vscode.WorkspaceEdit();
          askEdit.replace(document.uri, document.lineAt(line).range, newLineText);
          await vscode.workspace.applyEdit(askEdit);
          anyEditsApplied = true;
          logger.log(`Updated line ${line + 1}: ${tu.propertyName} with ${tu.translations.size} translation(s)`);
        }
        continue;
      }

      case "add":
      default:
        newLineText = buildTranslatedPropertyLine(lineText, tu, "add", false, languageOrder);
        break;
    }

    if (newLineText === undefined || newLineText === lineText) {
      continue;
    }

    workspaceEdit.replace(document.uri, document.lineAt(line).range, newLineText);
    editCount++;
    logger.log(`Updated line ${line + 1}: ${tu.propertyName} with ${tu.translations.size} translation(s)`);
  }

  if (editCount > 0) {
    await vscode.workspace.applyEdit(workspaceEdit);
    anyEditsApplied = true;
  }

  if (anyEditsApplied) {
    await document.save();
  }
}

/**
 * Builds a new line with translations applied.
 * @param commentMethod "replace" replaces existing translations; "add" only adds missing ones.
 * @param replaceSource If true, replaces the property value text with the .g.xlf source.
 */
function buildTranslatedPropertyLine(
  lineText: string,
  transUnit: TransUnit,
  commentMethod: string,
  replaceSource: boolean,
  languageOrder: string[]
): string | undefined {
  if (transUnit.translations.size === 0 && !replaceSource) {
    return undefined;
  }

  let result = lineText;

  // For "replace" mode, also replace the property value text with the .g.xlf source
  if (replaceSource && transUnit.source) {
    result = replacePropertyValue(result, transUnit.source);
  }

  // Build language label entries from translations
  const orderMap = new Map<string, number>();
  for (let i = 0; i < languageOrder.length; i++) {
    orderMap.set(languageOrder[i], i);
  }

  const entriesWithIndex = Array.from(transUnit.translations.entries()).map((entry, index) => ({
    entry,
    index,
  }));
  entriesWithIndex.sort((a, b) => {
    const aOrder = orderMap.get(a.entry[0]) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = orderMap.get(b.entry[0]) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return a.index - b.index;
  });

  const newLangEntries: string[] = [];
  for (const { entry } of entriesWithIndex) {
    const [langCode, translation] = entry;
    const escaped = translation.replace(/'/g, "''");
    newLangEntries.push(`${langCode}="${escaped}"`);
  }

  if (newLangEntries.length === 0) {
    return result !== lineText ? result : undefined;
  }

  // Find existing Comment = '...' in the line and only modify that portion
  const commentInfo = findCommentInLine(result);

  if (commentInfo) {
    const { nonTranslationParts, existingLangEntries } = parseCommentParts(commentInfo.value);
    const mergedLangEntries = mergeLangEntries(existingLangEntries, newLangEntries, commentMethod);

    if (mergedLangEntries.length === 0 && nonTranslationParts.length === 0) {
      return result !== lineText ? result : undefined;
    }

    const allParts = [...nonTranslationParts, ...mergedLangEntries];
    const newComment = `, ${commentInfo.keyword} = '${allParts.join(",")}'`;
    result = result.substring(0, commentInfo.start) + newComment + result.substring(commentInfo.end);
    return result !== lineText ? result : undefined;
  }

  // No existing Comment — insert before the trailing semicolon
  const semicolonIndex = result.lastIndexOf(";");
  if (semicolonIndex === -1) {
    return result !== lineText ? result : undefined;
  }

  const commentValue = newLangEntries.join(",");
  result = result.substring(0, semicolonIndex) + `, Comment = '${commentValue}'` + result.substring(semicolonIndex);
  return result !== lineText ? result : undefined;
}

/**
 * Replaces the first single-quoted value in the line (the property/label value)
 * with the new value. Handles escaped single quotes ('') correctly.
 */
function replacePropertyValue(lineText: string, newValue: string): string {
  const quoteStart = lineText.indexOf("'");
  if (quoteStart === -1) { return lineText; }

  // Walk to the closing quote, skipping escaped quotes ('')
  let pos = quoteStart + 1;
  while (pos < lineText.length) {
    if (lineText[pos] === "'") {
      if (pos + 1 < lineText.length && lineText[pos + 1] === "'") {
        pos += 2;
      } else {
        break;
      }
    } else {
      pos++;
    }
  }

  const escapedValue = newValue.replace(/'/g, "''");
  return lineText.substring(0, quoteStart + 1) + escapedValue + lineText.substring(pos);
}

/**
 * Finds the `, Comment = '...'` portion in a line, properly handling escaped single quotes.
 * Returns the start (at the comma), end (after closing quote), and the inner value.
 */
function findCommentInLine(lineText: string): { start: number; end: number; value: string; keyword: string } | undefined {
  const commentStart = lineText.match(/,\s*(Comment)\s*=\s*'/i);
  if (!commentStart || commentStart.index === undefined) {
    return undefined;
  }

  const start = commentStart.index;
  const keyword = commentStart[1]; // preserve original casing
  const valueStart = start + commentStart[0].length;

  // Walk to the closing single quote, skipping escaped quotes ('')
  let pos = valueStart;
  while (pos < lineText.length) {
    if (lineText[pos] === "'") {
      if (pos + 1 < lineText.length && lineText[pos + 1] === "'") {
        pos += 2; // skip escaped quote
      } else {
        break; // closing quote
      }
    } else {
      pos++;
    }
  }

  return {
    start,
    end: pos + 1, // after closing quote
    value: lineText.substring(valueStart, pos),
    keyword,
  };
}

/**
 * Splits a Comment value into non-translation parts (like "Locked") and language label entries.
 * Respects double-quote boundaries so values like DEU=" ,Opt1,Opt2" stay intact.
 */
function parseCommentParts(comment: string): { nonTranslationParts: string[]; existingLangEntries: string[] } {
  const nonTranslationParts: string[] = [];
  const existingLangEntries: string[] = [];

  if (!comment) {
    return { nonTranslationParts, existingLangEntries };
  }

  const parts = splitRespectingQuotes(comment);
  const langPattern = /^\w+=".*"$/;

  for (const part of parts) {
    if (langPattern.test(part)) {
      existingLangEntries.push(part);
    } else {
      nonTranslationParts.push(part);
    }
  }

  return { nonTranslationParts, existingLangEntries };
}

/**
 * Splits a string by commas, but does not split inside double-quoted sections.
 */
function splitRespectingQuotes(text: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === "," && !inQuotes) {
      const trimmed = current.trim();
      if (trimmed) {
        parts.push(trimmed);
      }
      current = "";
    } else {
      current += ch;
    }
  }

  const trimmed = current.trim();
  if (trimmed) {
    parts.push(trimmed);
  }
  return parts;
}

/**
 * Merges new language entries with existing ones based on the translation method.
 * - "replace": new entries replace existing ones for the same language, keeps languages not in new entries
 * - "add": only adds languages that don't already exist
 */
function mergeLangEntries(existing: string[], incoming: string[], method: string): string[] {
  const existingMap = new Map<string, string>();
  for (const entry of existing) {
    const match = entry.match(/^(\w+)="/);
    if (match) {
      existingMap.set(match[1], entry);
    }
  }

  const incomingMap = new Map<string, string>();
  for (const entry of incoming) {
    const match = entry.match(/^(\w+)="/);
    if (match) {
      incomingMap.set(match[1], entry);
    }
  }

  if (method === "add") {
    const result = new Map(existingMap);
    for (const [lang, entry] of incomingMap) {
      if (!result.has(lang)) {
        result.set(lang, entry);
      }
    }
    return Array.from(result.values());
  }

  // "replace" or "ask": replace existing languages, keep languages not in incoming
  const result = new Map(existingMap);
  for (const [lang, entry] of incomingMap) {
    result.set(lang, entry);
  }
  return Array.from(result.values());
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
