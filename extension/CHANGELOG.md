# Changelog

All notable changes to the "al-translation-cleaner" extension will be documented in this file.

<!-- Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file. -->

## [Unreleased]

### Added

* Command:Write Translations from All Xliff Files to AL File Comments (See [README.md](README.md#atc-write-translations-from-all-xliff-files-to-al-file-comments) for more info)

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
