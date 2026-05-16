---
description: Test the vocabulary trainer application
---

# Test Application Workflow

Steps to test the Lateintrainer app:

1. Start a local HTTP server

   ```bash
   npx serve .
   # or
   python -m http.server 8080
   ```

2. Open browser to `http://localhost:8080`

3. Verify core functionality:

   - Flashcard displays Latin on front
   - "Umdrehen" button flips to German
   - Navigation buttons (← →) work
   - "Gewusst"/"Nicht gewusst" marks cards (green/red border)
   - "Nur unbekannte Vokabeln" filter works
   - Vocabularium checkboxes toggle sets
   - Progress counter updates correctly

4. Check localStorage persistence:
   - Refresh page after marking cards
   - Verify marks are retained

5. Clear test data (if needed):

   ```javascript
   localStorage.clear();
   location.reload();
   ```
