import vscode from "vscode";
import { throwErrorAndLog } from "../logging/LogHelper";

export interface ALObjectHeader {
  objectType: string;
  objectName: string;
  objectId: number;
}

/**
 * Gets the header information of an AL object from the given file.
 * @param lines The lines of the AL file.
 * @returns An object containing the object type, name, and ID.
 */
export function getALObjectHeader(lines: string[]): ALObjectHeader {
  const headerPattern = /^\s*(table|page|report|codeunit|query|xmlport|enum|enumextension|pageextension|tableextension|reportextension|controladdin)\s+(\d+\s+)?("?[^"]+"?)/i;
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
  return { objectType, objectName, objectId };
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
            `^(?:field|group|part|repeater|area|cuegroup|grid|fixed|usercontrol|label)\\s*\\(\\s*"?${escapedName}"?`,
            "i"
          ).test(trimmed)
        ) {
          return i;
        }
        break;

      case "action":
        if (
          new RegExp(
            `^action\\s*\\(\\s*"?${escapedName}"?\\s*\\)`,
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
