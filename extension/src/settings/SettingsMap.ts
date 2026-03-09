import { Settings } from "./Settings";

export const settingsMap = new Map<string, keyof Settings>([
    ["ATC.TranslationMethod", "translationMethod"],
    ["ATC.languageMapping", "languageMapping"]
])