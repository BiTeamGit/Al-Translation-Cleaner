import { logger, throwErrorAndLog } from "../logging/LogHelper";
import { ALObjectHeader } from "./ALFileHandler";
import path from "path";
import vscode from "vscode";

export interface XliffFile {
  filePath: string;
  targetLanguage: string;
  transUnits: TransUnit[];
}

export interface TransUnit {
  lineNumber: number;
  source: string;
  translation?: string;
  elementPath: { type: string; name: string }[];
  propertyName?: string;
  translations: Map<string, string>;
  alLocation?: vscode.Location;
  /** Set when the property should exist but is missing in the AL file. */
  missingProperty?: { insertAfterLine: number; indent: number; propertyName: string };
}

const PROPERTY_MAP: Record<string, string> = {
  "2879900210": "Caption",
  "1295455071": "ToolTip",
  "1968111052": "InstructionalText",
  "62802879": "OptionCaption",
  "2019332006": "PromotedActionCategories",
  "1806354803": "RequestFilterHeading",
  "3863440606": "AdditionalSearchTerms",
  "3446740159": "EntityCaption",
  "631549417": "EntitySetCaption",
  "4111922599": "ProfileDescription",
  "1064389655": "AboutTitle",
  "247559172": "AboutText",
  "2879845413": "Label",
  "3519868930": "ReportLabel",
  "3333885854": "NamedType",
};

/**
 * Parses the active XLIFF document for trans-units matching the given AL object header.
 * Extracts the target language and returns structured translation data.
 */
export function searchForTransUnitIdInXliff(alObjectHeader: ALObjectHeader, document: vscode.TextDocument): XliffFile {
  const lines = document.getText().split("\n");
  const targetLanguage = path.basename(document.uri.fsPath).endsWith(".g.xlf")
    ? ""
    : findTargetLanguageInFile(lines);

  const transUnits = findTransUnitsForObject(alObjectHeader, lines);

  return { filePath: document.uri.fsPath, targetLanguage, transUnits };
}

function findTransUnitsForObject(alObjectHeader: ALObjectHeader, lines: string[]): TransUnit[] {
  const transUnits: TransUnit[] = [];
  const objectUnitId = `${alObjectHeader.objectType} ${alObjectHeader.objectId}`;

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(objectUnitId)) {
      continue;
    }
    const transUnit = extractTransUnitFromLine(lines, i);
    if (transUnit) {
      transUnits.push(transUnit);
    }
  }
  return transUnits;
}

function extractTransUnitFromLine(lines: string[], lineIndex: number): TransUnit | undefined {
  const idMatch = lines[lineIndex].match(/<trans-unit\s+id="([^"]*)"[^>]*>/i);
  if (!idMatch) {
    return undefined;
  }

  const transUnitId = idMatch[1];
  const sourceMatch = lines[lineIndex + 1]?.match(/<source>(.*)<\/source>/);
  const translationMatch = lines[lineIndex + 2]?.match(/<target[^>]*>(.*)<\/target>/);
  const note = findXliffGeneratorNote(lines, lineIndex);
  const elementPath = note ? parseXliffElementPath(transUnitId, note) : [];
  let propertyName = parsePropertyNameFromId(transUnitId);

  // Labels don't have a Property segment in their XLIFF ID — infer the property name from the element path
  if (!propertyName && elementPath.some(e => e.type === "NamedType" || e.type === "ReportLabel")) {
    propertyName = "Label";
  }

  return {
    lineNumber: lineIndex,
    source: sourceMatch ? formatName(sourceMatch[1]) : "",
    translation: translationMatch ? formatName(translationMatch[1]) : undefined,
    elementPath,
    propertyName,
    translations: new Map(),
  };
}

function findXliffGeneratorNote(lines: string[], startLine: number): string | undefined {
  for (let j = startLine; j < lines.length && j - startLine <= 20; j++) {
    if (j > startLine && /<\/trans-unit>/i.test(lines[j])) {
      break;
    }
    const noteMatch = lines[j].match(/<note\s+from="Xliff Generator"[^>]*>(.*?)<\/note>/i);
    if (noteMatch) {
      return noteMatch[1];
    }
  }
  return undefined;
}

function parsePropertyNameFromId(transUnitId: string): string | undefined {
  const segments = transUnitId.split(" - ");
  for (const segment of segments) {
    const match = segment.match(/^(\w+)\s+(\d+)$/);
    if (match && match[1] === "Property") {
      return mapPropertyIdToName(match[2]);
    }
  }
  return undefined;
}

function mapPropertyIdToName(propertyId: string): string {
  const name = PROPERTY_MAP[propertyId];
  if (name) {
    return name;
  }
  logger.log(`Unknown property ID: ${propertyId}`);
  return `Property_${propertyId}`;
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
  throwErrorAndLog("findTargetLanguageInFile", new Error("Could not find target language in the first 10 lines of the file"));
}

/**
 * Merges trans-units from multiple XLIFF files into a deduplicated list.
 * The .g.xlf provides the source text, translated files add language-specific translations
 * mapped via languageMapping.
 */
export function mergeTranslations(xliffFiles: XliffFile[], languageMapping: { [targetLanguage: string]: string }): TransUnit[] {
  const transUnitMap = new Map<string, TransUnit>();

  // First pass: populate from .g.xlf files (source text)
  for (const xliffFile of xliffFiles) {
    if (xliffFile.targetLanguage !== "") {
      continue;
    }
    for (const tu of xliffFile.transUnits) {
      if (!tu.propertyName || tu.elementPath.length === 0) {
        continue;
      }
      const key = buildTransUnitKey(tu);
      if (!transUnitMap.has(key)) {
        transUnitMap.set(key, { ...tu, translations: new Map() });
      }
    }
  }

  // Second pass: add translations from translated files
  for (const xliffFile of xliffFiles) {
    if (xliffFile.targetLanguage === "") {
      continue;
    }
    const alLangCode = languageMapping[xliffFile.targetLanguage];
    if (!alLangCode) {
      logger.log(`No language mapping for '${xliffFile.targetLanguage}', skipping ${path.basename(xliffFile.filePath)}`);
      continue;
    }
    for (const tu of xliffFile.transUnits) {
      if (!tu.propertyName || !tu.translation || tu.elementPath.length === 0) {
        continue;
      }
      const key = buildTransUnitKey(tu);
      const existing = transUnitMap.get(key);
      if (existing) {
        existing.translations.set(alLangCode, tu.translation);
      } else {
        const merged: TransUnit = { ...tu, translations: new Map([[alLangCode, tu.translation]]) };
        transUnitMap.set(key, merged);
      }
    }
  }

  return Array.from(transUnitMap.values());
}

function buildTransUnitKey(transUnit: TransUnit): string {
  const pathKey = transUnit.elementPath.map(e => `${e.type}:${e.name}`).join("/");
  return `${pathKey}/${transUnit.propertyName}`;
}

/**
 * Parses the XLIFF element path from the trans-unit ID and note.
 * @param transUnitId The ID of the trans-unit element.
 * @param xliffGeneratorNote The note from the XLIFF generator.
 * @returns An array of objects representing the element path, each containing a type and name.
 */
function parseXliffElementPath(transUnitId: string, xliffGeneratorNote: string): { type: string; name: string }[] {
  if (!xliffGeneratorNote.trim()) {
    return [];
  }

  // The XLIFF note carries the real hierarchy (e.g. Rendering Layout), while
  // trans-unit IDs may only include a subset of path segments.
  const segments = xliffGeneratorNote.split(/\s+-\s+/).map(s => s.trim()).filter(Boolean);
  if (segments.length === 0) {
    return [];
  }

  const result: { type: string; name: string }[] = [];
  for (const segment of segments) {
    const parsed = parseNoteSegment(segment);
    if (!parsed) {
      continue;
    }
    result.push({ type: parsed.type, name: formatName(parsed.name) });
  }

  return result;
}

function parseNoteSegment(segment: string): { type: string; name: string } | undefined {
  const normalized = segment.trim();
  if (!normalized) {
    return undefined;
  }

  const typePrefixes: Array<{ notePrefix: string; normalizedType: string }> = [
    { notePrefix: "Rendering Layout", normalizedType: "RenderingLayout" },
    { notePrefix: "Report Label", normalizedType: "ReportLabel" },
    { notePrefix: "Named Type", normalizedType: "NamedType" },
    { notePrefix: "Enum Value", normalizedType: "EnumValue" },
    { notePrefix: "Data Item", normalizedType: "DataItem" },
    { notePrefix: "Control AddIn", normalizedType: "ControlAddIn" },
    { notePrefix: "Permission Set", normalizedType: "PermissionSet" },
    { notePrefix: "Table Extension", normalizedType: "TableExtension" },
    { notePrefix: "Page Extension", normalizedType: "PageExtension" },
    { notePrefix: "Report Extension", normalizedType: "ReportExtension" },
    { notePrefix: "Enum Extension", normalizedType: "EnumExtension" },
    { notePrefix: "Xml Port", normalizedType: "XmlPort" },
    { notePrefix: "Method", normalizedType: "Method" },
    { notePrefix: "Property", normalizedType: "Property" },
    { notePrefix: "Rendering", normalizedType: "Rendering" },
    { notePrefix: "Layout", normalizedType: "Layout" },
    { notePrefix: "Action", normalizedType: "Action" },
    { notePrefix: "Control", normalizedType: "Control" },
    { notePrefix: "Field", normalizedType: "Field" },
    { notePrefix: "Column", normalizedType: "Column" },
    { notePrefix: "DataItem", normalizedType: "DataItem" },
    { notePrefix: "Value", normalizedType: "Value" },
    { notePrefix: "Report", normalizedType: "Report" },
    { notePrefix: "Page", normalizedType: "Page" },
    { notePrefix: "Table", normalizedType: "Table" },
    { notePrefix: "Codeunit", normalizedType: "Codeunit" },
    { notePrefix: "Query", normalizedType: "Query" },
    { notePrefix: "Enum", normalizedType: "Enum" },
    { notePrefix: "Profile", normalizedType: "Profile" },
  ];

  for (const prefix of typePrefixes) {
    const match = normalized.match(new RegExp(`^${prefix.notePrefix}\\s+(.+)$`, "i"));
    if (match) {
      return { type: prefix.normalizedType, name: match[1].trim() };
    }
  }

  const fallback = normalized.match(/^(\w+)\s+(.+)$/);
  if (fallback) {
    return { type: fallback[1], name: fallback[2].trim() };
  }

  return undefined;
}

function formatName(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Scans the given XLF document and returns the unique AL objects referenced by trans-units.
 */
export function getUniqueObjectsFromXlf(document: vscode.TextDocument): { objectType: string; objectName: string }[] {
  const lines = document.getText().split("\n");
  const seen = new Set<string>();
  const result: { objectType: string; objectName: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const idMatch = lines[i].match(/<trans-unit\s+id="([^"]*)"[^>]*>/i);
    if (!idMatch) {
      continue;
    }

    const note = findXliffGeneratorNote(lines, i);
    if (!note) {
      continue;
    }

    const elementPath = parseXliffElementPath(idMatch[1], note);
    if (elementPath.length === 0) {
      continue;
    }

    const key = `${elementPath[0].type}|${elementPath[0].name}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ objectType: elementPath[0].type, objectName: elementPath[0].name });
  }

  return result;
}

export interface GroupedXlfResult {
  filePath: string;
  targetLanguage: string;
  /** Trans-units grouped by "objectType|objectName" key */
  transUnitsByObject: Map<string, TransUnit[]>;
}

/**
 * Parses the entire XLF document in a single pass, grouping all trans-units
 * by their root AL object (objectType|objectName).
 */
export function parseXlfGroupedByObject(document: vscode.TextDocument): GroupedXlfResult {
  const lines = document.getText().split("\n");
  const targetLanguage = path.basename(document.uri.fsPath).endsWith(".g.xlf")
    ? ""
    : findTargetLanguageInFile(lines);

  const transUnitsByObject = new Map<string, TransUnit[]>();

  for (let i = 0; i < lines.length; i++) {
    const transUnit = extractTransUnitFromLine(lines, i);
    if (!transUnit || transUnit.elementPath.length === 0) {
      continue;
    }

    const objectKey = `${transUnit.elementPath[0].type}|${transUnit.elementPath[0].name}`;
    let group = transUnitsByObject.get(objectKey);
    if (!group) {
      group = [];
      transUnitsByObject.set(objectKey, group);
    }
    group.push(transUnit);
  }

  return { filePath: document.uri.fsPath, targetLanguage, transUnitsByObject };
}