# Changelog

All notable changes to the "al-translation-cleaner" extension will be documented in this file.

<!-- Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file. -->

## [Unreleased]

### Added

* Better Log Outputs for easier use

### Fixed

* Error where the first Enum Value got replaced
* In PageExt there was Mapping Confusion between modify Action Captions and addAfter Field Captions
* Double-Line Comments are now recognized
* Fixed 1.0.1 Mapping Error that broke the Extension

## [1.0.3] - 2026-04-01

### Fixed

* translations were sometimes directly taken from the .g.xlf note, not the translation files
* fields in pages were sometimes matched wrong
* actions in groups were mapped wrong

## [1.0.2] - 2026-03-30

### Added

* Summary Property

### Fixed

* Unknown Properties were being written into AL Files, which caused an error. They are now logged and ignored
* Variables with same name written into wrong document section

### Removed

* Removed Setting: ATC.addMissingProperties temporarily, since it was causing unanticipated errors without instant solution

## [1.0.1] - 2026-03-11

### Fixed

* Translations arent written into Report Columns anymore
* Recognizing the Difference between Report Caption and Report Rendering Layout Caption
* Existing(Non-translatio) Comments are written as //Comments at the end of the line because of errors with the AL Translation Center Tool

## [1.0.0] - 2026-03-10

### Added

* Command:Write Translations from All Xliff Files to AL File Comments (See [README.md](README.md#atc-write-translations-from-all-xliff-files-to-al-file-comments) for more info)

### Fixed

* Translations are not written into Locked Lines

## [1.0.0-beta-1] - 2026-03-10

### Added

- Setting: ATC.addMissingProperties

### Changed

- Renamed "ATC.TranslationMethod" to "ATC.translationMethod" for consistency
  -Renamed "ATC: Find Translations in AL File" to "ATC: Write Translations to Comments in current AL File" for better understanding
- Renamed "ATC: Find Translations in XLF File" to "ATC: Write Translations in current Xliff File to AL File Comments" for better understanding

### Fixed

- Comments have to be structured like this: '%1="Description", DEU="Translation", Other Comment'

## [1.0.0-beta] - 2026-03-10

### Added

- Command: Find Translations in Xliff File (See [README.md](README.md#atc-write-translations-in-current-xliff-file-to-al-file-comments) for more info)

## [0.0.1-beta] - 2026-03-09

### Added

- Command: Find Translations in AL File (See [README.md](README.md#atc-write-translations-to-comments-in-current-al-file) for more info)
- Setting: ATC.TranslationMethod
- Setting: ATC.languageMapping
