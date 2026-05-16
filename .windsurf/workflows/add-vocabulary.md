---
description: Add new vocabulary to vokabeln.csv
---

# Add Vocabulary Workflow

Steps to add new Latin vocabulary entries:

1. Read the existing `vokabeln.csv` to understand current format
2. Identify which Vocabularium section the new words belong to
3. Format entries as: `latin;german`
4. Insert at appropriate position (maintain numerical order)
5. Ensure no duplicates by checking existing entries
6. Verify semicolon separator is used (not comma)

## Entry Format Guidelines

- Latin terms include declension/conjugation info in parentheses
- German meanings use "1) ... 2) ..." for multiple definitions
- Adjectives show all three forms: `us/a/um` or `is/e`
- Prepositions indicate case: `(Präp. + Akk.)` or `(Präp. + Abl.)`

## Examples

```csv
incendium (incendii n.);der Brand
princeps (principis m.);1) der Erste, 2) der Prinzeps, der Kaiser
gravis/e;schwer, schwerwiegend
usque ad (+ Akk.);bis zu
```
