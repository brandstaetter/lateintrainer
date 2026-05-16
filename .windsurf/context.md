# Lateintrainer Project Context

## Project Overview

A web-based Latin vocabulary flashcard learning application.

## File Structure

- `index.html` - Main HTML with flashcard UI
- `script.js` - Core JavaScript logic for flashcards and localStorage
- `style.css` - Styling for flashcards and UI
- `vokabeln.csv` - Latin vocabulary data (25 vocabularia)
- `favicon.ico` - Site icon

## Key Features

- Flashcard flip animation (Latin front, German back)
- **Translation direction: ALWAYS Latin → German** - cards always reset to Latin side when navigating
- 25 vocabularia (Vocabularium 1-25) with checkboxes to select
- LocalStorage persistence for:
  - Learning progress (known/unknown per vocab)
  - Discovered vocabulary groups
  - Selected vocabulary sets
- "Known" (green border) / "Unknown" (red border) marking
- Filter: "Show only unknown" mode
- Shuffle mode for random order

## Vocabulary CSV Format

```csv
### Vocabularium N
latin entry;german meaning
```

Example:

```csv
### Vocabularium 1
schola f. (2.F. scholae);die Schule
hic (Adv.);hier
```

## Architecture

- Pure client-side (HTML/JS/CSS), no backend
- Uses `fetch()` to load `vokabeln.csv`
- `localStorage` keys:
  - `vocabProgress` - JSON object of learned status
  - `discoveredVocabGroups` - Array of discovered vocabularia
  - `selectedVocabSets` - Array of currently selected sets

## Development Commands

- Open `index.html` in browser for testing
- Or use Live Server extension in VS Code
