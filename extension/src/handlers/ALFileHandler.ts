import * as vscode from "vscode";
import * as path from "path";
import { logger } from "../logging/LogHelper";
import { XliffIdToken } from "./XliffIdToken";

/**
 * ALFileHandler: Handles all operations related to AL (.al) files
 * - Parsing AL object headers
 * - Generating XLIFF IDs from AL content
 * - FNV hash calculations
 * - AL file navigation and search
 */

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
]);

/**
 * Create the trans-unit id for the AL object by parsing the file lines,
 * extracting the object type and name, and generating the XLIFF ID.
 */
export function createObjectTransUnitId(lines: string[]): string {
  const headerPattern = /^\s*(table|page|report|codeunit|query|xmlport|enum|enumextension|pageextension|tableextension|reportextension|controladdin)\s+(\d+\s+)?("?[^"]+"?)/i;
  let objectType: string | undefined;
  let objectName: string | undefined;

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
    logger.error("createObjectTransUnitId: Could not identify AL object");
    throw new Error("The file does not seem to be an AL Object.");
  }

  logger.log(`Found object: ${objectType} "${objectName}"`);
  const tokens = [new XliffIdToken(objectType, objectName)];
  return XliffIdToken.getXliffId(tokens);
}