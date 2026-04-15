import { Settings } from "./Settings";

export const settingsMap = new Map<string, keyof Settings>([
    ["ATC.translationMethod", "translationMethod"],
    ["ATC.languageMapping", "languageMapping"],
    ["ATC.WhenTranslationNotFound", "WhenTranslationNotFound"],
])