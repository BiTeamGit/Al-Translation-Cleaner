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

export function throwErrorAndLog(
    action: string,
    error: Error
): never {
    logger.error(`[${action}] ${error.message}`);
    logger.log(`Stack trace: ${error.stack}`);
    throw error;
}