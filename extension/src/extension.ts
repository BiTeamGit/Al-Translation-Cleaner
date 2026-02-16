import * as vscode from 'vscode';
import { findTranslationsInFile } from './ATCFunctions';
import { setLogger } from './logging/LogHelper';
import { OutputLogger } from './logging/OutputLogger';

export function activate(context: vscode.ExtensionContext) {
    setLogger(OutputLogger.getInstance());
    console.log('Extension al-translation-cleaner activated');

    context.subscriptions.push(
        vscode.commands.registerCommand('atc.findTranslationsInFile', findTranslationsInFile)
    );

}

export function deactivate() { }
