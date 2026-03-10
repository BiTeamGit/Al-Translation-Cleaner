import * as vscode from 'vscode';
import { settingsMap } from "./SettingsMap";
import { Settings } from './Settings';


export function getSettingsForFolder(workspaceFolderPath: string): Settings {
    const config = vscode.workspace.getConfiguration(
        undefined,
        vscode.Uri.file(workspaceFolderPath)
    );
    const settings = new Settings(workspaceFolderPath);

    settingsMap.forEach((propertyName, settingName) => {
        const configuredValue = config.get(settingName);
        if (configuredValue !== undefined) {
            (settings as any)[propertyName] = configuredValue;
        }
    });

    return settings;
}

export function getSettings(workspaceFilePath?: string): Settings {
    const workspaceFolderPath = getWorkspaceFolderPath(workspaceFilePath);
    return getSettingsForFolder(workspaceFolderPath)
}


export function getWorkspaceFolderPath(workspaceFilePath?: string): string {
  let workspaceFolder: vscode.WorkspaceFolder | undefined;
  if (workspaceFilePath) {
    const workspaceFileUri = vscode.Uri.file(workspaceFilePath);
    workspaceFolder = vscode.workspace.getWorkspaceFolder(workspaceFileUri);
  } else if (vscode.window.activeTextEditor) {
    workspaceFolder = vscode.workspace.getWorkspaceFolder(
      vscode.window.activeTextEditor.document.uri
    );
  }

  if (!workspaceFolder) {
    const realTextEditors = vscode.window.visibleTextEditors.filter(
      (x) =>
        x.document.uri.scheme !== "output" && x.document.uri.path !== "tasks"
    );
    if (realTextEditors.length > 0) {
      for (let index = 0; index < realTextEditors.length; index++) {
        const textEditor = vscode.window.visibleTextEditors[index];
        workspaceFolder = vscode.workspace.getWorkspaceFolder(
          textEditor.document.uri
        );
        if (workspaceFolder) {
          break;
        }
      }
    }
  }

  if (!workspaceFolder) {
    if (vscode.workspace.workspaceFolders) {
      workspaceFolder = vscode.workspace.workspaceFolders[0];
    }
  }
  if (!workspaceFolder) {
    throw new Error(
      "No workspace found. Please open a file within your workspace folder and try again."
    );
  }
  return workspaceFolder.uri.fsPath;
}
