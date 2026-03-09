import vscode from "vscode";
import { ILogger } from "./ILogger";
import { NullLogger } from "./NullLogger";

const timestamp = require('time-stamp');

export let logger: ILogger = new NullLogger();

export function setLogger(newLogger: ILogger): void {
    logger = newLogger;
}

export function appendTimestamp(line?: string): string {
    return "[" + timestamp("HH:mm:ss") + "]" + line;
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

export function throwErrorAndLog(
    action: string,
    error: Error,
    modal = false
): never {
    logger.error(`${error.message}`);
    logger.log(`Stack trace: ${error.stack}`);
    throw error;
}