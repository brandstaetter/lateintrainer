# Lateintrainer Project Context

## Project Overview

A web-based Latin vocabulary flashcard learning application.

## File Structure

- `index.html` - Main HTML with flashcard UI and forms mode
- `script.js` - Core JavaScript logic for flashcards, forms mode, and localStorage
- `style.css` - Styling for flashcards, forms mode, and UI
- `vokabeln.csv` - Latin vocabulary data (25 vocabularia)
- `forms.csv` - Latin declension/conjugation data for forms mode
- `favicon.ico` - Site icon

## Key Features

### Flashcard Mode

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

### Forms Mode (Deklination/Konjugation)

- **Drag-and-drop** interface for arranging word forms
- **Substantive (Nouns)**: 6 Kasus × 2 Numeri (Singular/Plural)
- **Verben**: 6 Personen × 4 Tempora (Präsens, Perfekt, Plusquamperfekt, Futur I)
- **Distractors**: Falsche Formen als Ablenkung
- **Submit & Check**: Prüft Platzierung mit visuellem Feedback
- **Statistics**: Track solved words, attempts per word
- **Filter**: Hide successfully solved words
- Works with same vocabularium selection as flashcard mode

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

## Forms CSV Format

```csv
### Vocabularium N
word;type;subtype;form1|form2|form3|...
```

- `word` - Stammwort (z.B. "schola", "sedet")
- `type` - "Noun" (Substantiv) oder "Verb"
- `subtype` - Deklination/Konjugation (z.B. "2nd F", "1st Conj")
- `forms` - Pipe-getrennte Liste aller Formen

Example Noun (Deklination):

```csv
schola;Noun;2nd F;schola|scholae|scholae|scholam|schola|scholae|scholarum|scholis|scholas|scholis
```

Example Verb (Konjugation):

```csv
sedet;Verb;1st Conj;sedeo|sedes|sedet|sedemus|sedetis|sedent|sedi|sedisti|sedit|sedimus|sedistis|sederunt|...
```

## Architecture

- Pure client-side (HTML/JS/CSS), no backend
- Uses `fetch()` to load `vokabeln.csv` and `forms.csv`
- `localStorage` keys:
  - `vocabProgress_v2` - JSON object of learned status (with group prefix)
  - `discoveredVocabGroups` - Array of discovered vocabularia
  - `selectedVocabSets` - Array of currently selected sets
  - `formsProgress_v1` - JSON object of forms mode progress
  - `formsFilterSolved` - Boolean: hide solved form words

## Mode Switching

- **Flashcard Mode**: Traditional Latin → German flashcards
- **Forms Mode**: Drag-and-drop declension/conjugation tables
- Mode state is not persisted (resets to flashcards on reload)

## Development Commands

- Open `index.html` in browser for testing
- Or use Live Server extension in VS Code
