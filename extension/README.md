[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT) ![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/biteam.al-translation-cleaner) ![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/biteam.al-translation-cleaner?color=green)

# Introduction

AL Translation Cleaner is a VS Code extension that automatically inserts missing translations from XLIFF files as code comments into your AL files. It helps Business Central developers to quickly and accurately comment, fix and review their multilingual extensions.

## Features

### ATC: Write Translations to Comments in current AL File

Finds all translations for the selected AL file and adds missing translations if needed.

### ATC: Find Translations in Xliff File

Finds all translations in the XLIFF file and writes all missing translations for that language into the corresponding files.

## Extension Settings

- `ATC.translationMethod` - Specifies the Method of XLIFF editing used. Replace Mode completely overwrites all translations with the translations given in the XLIFF files. Add Mode only adds missing translation and does not modify existing translations. Ask Mode has the same functionality as Add Mode, but if there is a wrong translation the User is asked how he wants to respond("Replace" replaces the wrong translations, "Add missing only" only adds missing translations, "Skip completely skips the current line, "Cancel all" stops the whole process)
- `ATC.languageMapping` - Maps target language codes (from XLIFF) to AL comment language codes. Key: target language (e.g., 'de-DE'), Value: AL comment code (e.g., 'DEU')

## Contribute

You are always welcome to open an issue for enhancements and bugs [here](https://github.com/BiTeamGit/Al-Translation-Cleaner/issues/new).
