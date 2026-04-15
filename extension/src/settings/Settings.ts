import path from "path";
// To add a Setting to the Config:
// - add the Setting to the package.json configuration Selection
// - Link the Command Name with the code name in the SettingsMap.ts
// - add the code name to the Settings Class
//
// How to use:
// - const settings = SettingsLoader.getSettings();
// - settings.logLevel

export class Settings {
    public workspaceFolderPath: string;
    public translationMethod: "replace" | "add" = "replace";
    public languageMapping: { [targetLanguage: string]: string } = {};
    public WhenTranslationNotFound: "log" | "ask" | "delete" = "ask";

    constructor(workspaceFolderPath: string) {
        this.workspaceFolderPath = workspaceFolderPath;
    }
    public get sourceFolderPath(): string {
        return path.join(this.workspaceFolderPath, "src");
    }
}