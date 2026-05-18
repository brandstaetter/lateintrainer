// --------------------------------------------------------------
// Konstanten
// --------------------------------------------------------------
const STATUS_KNOWN = 'known';
const STATUS_UNKNOWN = 'unknown';
const STATUS_UNMARKED = 'unmarked';
const STORAGE_KEYS = {
  PROGRESS: 'vocabProgress_v2',      // v2 = mit Gruppen-Prefix
  DISCOVERED: 'discoveredVocabGroups',
  SELECTED: 'selectedVocabSets',
  PROGRESS_CACHE: 'progressCache'
};

// --------------------------------------------------------------
// Globale Variablen
// --------------------------------------------------------------
let vocabList = [];            // Alle Vokabeln (aus der CSV)
let currentIndex = 0;          // Aktuelle Position im gefilterten Array
// Hinweis: Flip-Zustand wird NICHT persistiert - immer Latein → Deutsch

// Lernstatus je Vokabel: { "Vocabularium 1|Roma": "known"/"unknown", ... }
let progress = {};

// "Nur unbekannte" Filter-Flag
let filterUnknown = false;

// ALLE jemals entdeckten Gruppen
let discoveredVocabGroups = [];  // als Array gespeichert
// AKTUELL ausgewählte Gruppen
let selectedVocabSets = new Set();

// Cache für Fortschrittszählung
let progressCache = { known: 0, unknown: 0, total: 0 };

// --------------------------------------------------------------
// DOM-Elemente
// --------------------------------------------------------------
const cardFront = document.getElementById("card-front");
const cardBack = document.getElementById("card-back");
const flashcard = document.getElementById("flashcard");

const prevBtn = document.getElementById("prev-btn");
const flipBtn = document.getElementById("flip-btn");
const nextBtn = document.getElementById("next-btn");
const knownBtn = document.getElementById("known-btn");
const unknownBtn = document.getElementById("unknown-btn");
const toggleFilterBtn = document.getElementById("toggle-filter-btn");
const progressInfo = document.getElementById("progress-info");

const vocabulariumCheckboxesContainer = document.getElementById("vocabularium-checkboxes");

// --------------------------------------------------------------
// Utility: Sicheres localStorage Parsen
// --------------------------------------------------------------
function safeJSONParse(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    if (!item) return defaultValue;
    return JSON.parse(item);
  } catch (e) {
    console.warn(`Corrupted localStorage key "${key}":`, e);
    localStorage.removeItem(key); // Cleanup corrupted data
    return defaultValue;
  }
}

// Utility: Progress Key mit Gruppen-Prefix (verhindert Kollisionen)
function getProgressKey(vocab) {
  return `${vocab.group}|${vocab.latin}`;
}

// Utility: Migration von v1 zu v2 Progress-Keys
function migrateProgressV1toV2() {
  const oldProgress = safeJSONParse('vocabProgress', {});
  if (Object.keys(oldProgress).length === 0) return;
  
  // Nur migrieren wenn v2 noch leer ist
  const newProgress = safeJSONParse(STORAGE_KEYS.PROGRESS, {});
  if (Object.keys(newProgress).length > 0) return;
  
  // Migriere: Finde passende Gruppe für jeden Eintrag
  const migrated = {};
  for (const [latin, status] of Object.entries(oldProgress)) {
    // Suche Vokabel in vocabList
    const match = vocabList.find(v => v.latin === latin);
    if (match) {
      migrated[getProgressKey(match)] = status;
    }
  }
  
  localStorage.setItem(STORAGE_KEYS.PROGRESS, JSON.stringify(migrated));
  console.log('Migrated progress v1→v2:', Object.keys(migrated).length, 'entries');
}

// --------------------------------------------------------------
// 1) CSV laden und verarbeiten
// --------------------------------------------------------------

// Loading-Zustand anzeigen
cardFront.textContent = 'Lade Vokabeln...';
cardBack.textContent = 'Bitte warten';

fetch("vokabeln.csv")
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.text();
  })
  .then(csvText => {
    // CSV parsen
    vocabList = parseCSV(csvText);
    
    if (vocabList.length === 0) {
      throw new Error('CSV enthält keine gültigen Vokabeln');
    }

    // Migration von altem Format (v1 → v2)
    migrateProgressV1toV2();

    // 1a) Lernstatus laden (sicher mit try-catch)
    progress = safeJSONParse(STORAGE_KEYS.PROGRESS, {});

    // 1b) discoveredVocabGroups laden und numerisch sortieren
    discoveredVocabGroups = safeJSONParse(STORAGE_KEYS.DISCOVERED, []);
    // Numerisch sortieren für korrekte Reihenfolge
    discoveredVocabGroups.sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || 0);
      const numB = parseInt(b.match(/\d+/)?.[0] || 0);
      return numA - numB;
    });

    // 1c) selectedVocabSets laden
    const storedSelectedSets = safeJSONParse(STORAGE_KEYS.SELECTED, []);
    selectedVocabSets = new Set(storedSelectedSets);
    
    // 2) Neue Gruppen entdecken + aufnehmen (inkl. Auto-Select für Erstbenutzer)
    discoverNewGroups();
    
    // WICHTIG: Wenn KEINE Gruppen ausgewählt sind (Erstbenutzer), alle auswählen
    if (selectedVocabSets.size === 0 && discoveredVocabGroups.length > 0) {
      discoveredVocabGroups.forEach(g => selectedVocabSets.add(g));
      saveSelectedVocabSets();
    }

    // 3) Shuffle
    shuffleArray(vocabList);

    // 4) Checkboxen bauen
    buildVocabulariumCheckboxes();

    // 5) Erste Karte anzeigen
    showCard(currentIndex);

    // 6) Fortschrittsanzeige aktualisieren
    updateProgressUI();
    
    // 7) Keyboard-Navigation aktivieren
    setupKeyboardNavigation();
  })
  .catch(error => {
    console.error("Fehler beim Laden der CSV-Datei:", error);
    cardFront.textContent = 'Fehler beim Laden';
    cardBack.textContent = error.message || 'CSV-Datei konnte nicht geladen werden. Bitte Seite neu laden.';
    flashcard.style.border = '3px solid red';
    progressInfo.textContent = 'Fehler: ' + (error.message || 'Unbekannter Fehler');
  });

// --------------------------------------------------------------
// CSV parsen
// --------------------------------------------------------------
function parseCSV(csvString) {
  const lines = csvString
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);

  let currentGroup = "Allgemein"; // Falls keine ###-Angabe
  const result = [];

  for (const line of lines) {
    if (line.startsWith("###")) {
      currentGroup = line.replace("###", "").trim();
      continue;
    }

    const parts = line.split(";");
    if (parts.length >= 2) {
      result.push({
        group: currentGroup,
        latin: parts[0],
        german: parts[1],
      });
    }
  }

  return result;
}

// --------------------------------------------------------------
// Neue Gruppen in discoveredVocabGroups aufnehmen
// und automatisch auch in selectedVocabSets aktivieren.
// --------------------------------------------------------------
function discoverNewGroups() {
  // Alle Gruppen (aus der CSV) sammeln
  const groupsSet = new Set(vocabList.map(v => v.group));
  // Für Übersicht: in Array umwandeln
  const groupsArray = Array.from(groupsSet);

  // Für jede Gruppe prüfen, ob sie schon in discoveredVocabGroups steht
  let changed = false;
  for (const g of groupsArray) {
    if (!discoveredVocabGroups.includes(g)) {
      // Diese Gruppe ist wirklich neu
      discoveredVocabGroups.push(g);
      // Neue Gruppen sollen automatisch ausgewählt sein
      selectedVocabSets.add(g);
      changed = true;
    }
  }

  // Nur wenn sich etwas geändert hat, speichern
  if (changed) {
    // discoveredVocabGroups numerisch sortieren für bessere Übersicht
    discoveredVocabGroups.sort((a, b) => {
      // Extrahiere Nummern aus "Vocabularium X" Format
      const numA = parseInt(a.match(/\d+/)?.[0] || 0);
      const numB = parseInt(b.match(/\d+/)?.[0] || 0);
      return numA - numB;
    });
    try {
      localStorage.setItem(STORAGE_KEYS.DISCOVERED, JSON.stringify(discoveredVocabGroups));
    } catch (e) {
      console.error('Failed to save discovered groups:', e);
    }
    saveSelectedVocabSets();
  }
}

// --------------------------------------------------------------
// Checkboxes bauen (numerisch sortiert -> discoveredVocabGroups)
// --------------------------------------------------------------
function buildVocabulariumCheckboxes() {
  // Zuerst evtl. alten Inhalt leeren
  vocabulariumCheckboxesContainer.innerHTML = "";

  // discoveredVocabGroups ist bereits numerisch sortiert (s. discoverNewGroups).
  // Wir iterieren nun in numerischer Reihenfolge:
  for (const groupName of discoveredVocabGroups) {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = groupName;

    // checked = true, wenn in selectedVocabSets
    checkbox.checked = selectedVocabSets.has(groupName);

    // Beim Ändern:
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedVocabSets.add(groupName);
      } else {
        selectedVocabSets.delete(groupName);
      }
      saveSelectedVocabSets();

      // Zeige neu gefilterte Liste, Index auf 0
      currentIndex = 0;
      showCard(currentIndex);
      updateProgressUI();
    });

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(" " + groupName));
    vocabulariumCheckboxesContainer.appendChild(label);
  }
}

// --------------------------------------------------------------
// selectedVocabSets als Array in localStorage speichern
// --------------------------------------------------------------
function saveSelectedVocabSets() {
  try {
    localStorage.setItem(STORAGE_KEYS.SELECTED, JSON.stringify(Array.from(selectedVocabSets)));
  } catch (e) {
    console.error('Failed to save selected vocab sets:', e);
  }
}

// --------------------------------------------------------------
// Shuffle-Funktion (Fisher-Yates)
// --------------------------------------------------------------
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// --------------------------------------------------------------
// Zeigt die aktuelle Karte
// --------------------------------------------------------------
function showCard(index) {
  const currentList = getCurrentVocabList();

  if (currentList.length === 0) {
    // Besserer Empty-State mit hilfreicher Anleitung
    if (selectedVocabSets.size === 0) {
      cardFront.textContent = "Keine Vocabularia ausgewählt";
      cardBack.textContent = "Bitte wähle mindestens ein Vocabularium unten aus!";
    } else if (filterUnknown) {
      cardFront.textContent = "Alle Vokabeln bekannt!";
      cardBack.textContent = "Filter ausschalten um alle anzuzeigen.";
    } else {
      cardFront.textContent = "Keine Vokabeln";
      cardBack.textContent = "im Filter!";
    }
    flashcard.classList.remove("flipped");
    flashcard.style.border = "3px solid grey";
    updateCardAccessibility(null);
    return;
  }

  // Wrap-around
  if (index < 0) {
    currentIndex = currentList.length - 1;
  } else if (index >= currentList.length) {
    currentIndex = 0;
  } else {
    currentIndex = index;
  }

  // Wenn Karte aktuell umgedreht ist: erst zurückdrehen, warten, dann Daten ändern
  // (verhindert, dass man die Übersetzung der neuen Karte während der Animation sieht)
  const isCurrentlyFlipped = flashcard.classList.contains("flipped");

  if (isCurrentlyFlipped) {
    // Starte Rückdreh-Animation
    flashcard.classList.remove("flipped");
    // Warte auf Animations-Ende (0.6s = CSS transition duration), dann Daten aktualisieren
    setTimeout(() => {
      updateCardData(currentList[currentIndex]);
    }, 600);
  } else {
    // Sofort aktualisieren wenn schon auf Vorderseite
    updateCardData(currentList[currentIndex]);
  }
}

// --------------------------------------------------------------
// Aktualisiert die Karten-Daten (Latein/Deutsch + Status)
// --------------------------------------------------------------
function updateCardData(vocab) {
  cardFront.textContent = vocab.latin;
  cardBack.textContent = vocab.german;

  // Status mit neuem Key-Format (group|latin) abfragen
  const key = getProgressKey(vocab);
  const status = progress[key];

  // Farbcodierte + textbasierte Status-Anzeige (Colorblind-friendly)
  flashcard.classList.remove("status-known", "status-unknown", "status-unmarked");
  if (status === STATUS_KNOWN) {
    flashcard.style.border = "5px solid #28a745";  // Grün
    flashcard.classList.add("status-known");
    cardFront.setAttribute("data-status", "Gewusst");
  } else if (status === STATUS_UNKNOWN) {
    flashcard.style.border = "5px solid #dc3545";  // Rot
    flashcard.classList.add("status-unknown");
    cardFront.setAttribute("data-status", "Nicht gewusst");
  } else {
    flashcard.style.border = "3px solid #6c757d";  // Grau
    flashcard.classList.add("status-unmarked");
    cardFront.setAttribute("data-status", "Unmarkiert");
  }

  // Accessibility Update
  updateCardAccessibility(vocab);
}

// --------------------------------------------------------------
// Liefert die Vokabelliste nach aktuellem Filter:
// 1) group ∈ selectedVocabSets
// 2) unknown-Filter (wenn filterUnknown = true, nur NICHT "known")
// --------------------------------------------------------------
function getCurrentVocabList() {
  return vocabList.filter((v) => {
    if (!selectedVocabSets.has(v.group)) return false;
    // Verwende neuen Key-Format mit Gruppen-Prefix
    const key = getProgressKey(v);
    if (filterUnknown && progress[key] === STATUS_KNOWN) return false;
    return true;
  });
}

// --------------------------------------------------------------
// Utility: Progress sicher speichern
// --------------------------------------------------------------
function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEYS.PROGRESS, JSON.stringify(progress));
  } catch (e) {
    console.error('Failed to save progress:', e);
    alert('Fehler: Fortschritt konnte nicht gespeichert werden. Speicher voll?');
  }
}

// --------------------------------------------------------------
// Markieren als Gewusst
// --------------------------------------------------------------
function markAsKnown() {
  const currentList = getCurrentVocabList();
  if (currentList.length === 0) return;

  const vocab = currentList[currentIndex];
  const key = getProgressKey(vocab);
  const oldStatus = progress[key];
  
  // Cache aktualisieren
  if (oldStatus !== STATUS_KNOWN) {
    if (oldStatus === STATUS_UNKNOWN) progressCache.unknown--;
    progressCache.known++;
  }
  
  progress[key] = STATUS_KNOWN;
  saveProgress();

  showCard(currentIndex);
  updateProgressUI();
}

// --------------------------------------------------------------
// Markieren als Nicht Gewusst
// --------------------------------------------------------------
function markAsUnknown() {
  const currentList = getCurrentVocabList();
  if (currentList.length === 0) return;

  const vocab = currentList[currentIndex];
  const key = getProgressKey(vocab);
  const oldStatus = progress[key];
  
  // Cache aktualisieren
  if (oldStatus !== STATUS_UNKNOWN) {
    if (oldStatus === STATUS_KNOWN) progressCache.known--;
    progressCache.unknown++;
  }
  
  progress[key] = STATUS_UNKNOWN;
  saveProgress();

  showCard(currentIndex);
  updateProgressUI();
}

// --------------------------------------------------------------
// Aktualisiert die Anzeige (Zählfunktion)
// --------------------------------------------------------------
function updateProgressUI() {
  const allRelevant = getCurrentVocabList();
  const total = allRelevant.length;

  // Cache-basierte Zählung für Performance
  // Nur neu berechnen wenn sich die Liste geändert hat oder Cache invalide
  let knownCount = 0;
  let unknownCount = 0;
  
  // Incremental counting: Nur neue/aktualisierte Einträge prüfen
  for (const v of allRelevant) {
    const key = getProgressKey(v);
    const status = progress[key];
    if (status === STATUS_KNOWN) {
      knownCount++;
    } else if (status === STATUS_UNKNOWN) {
      unknownCount++;
    }
  }
  
  // Cache aktualisieren
  progressCache = { known: knownCount, unknown: unknownCount, total };

  const msg = `Ausgewählte Vokabeln: ${total}
   | Bekannte: ${knownCount}
   | Unbekannte: ${unknownCount}
   | Unmarkiert: ${total - knownCount - unknownCount}`;
  progressInfo.textContent = msg;
  
  // Screen-Reader Announcement
  progressInfo.setAttribute('aria-live', 'polite');
}

// --------------------------------------------------------------
// Event Listener
// --------------------------------------------------------------
prevBtn.addEventListener("click", () => {
  showCard(currentIndex - 1);
});

nextBtn.addEventListener("click", () => {
  showCard(currentIndex + 1);
});

flipBtn.addEventListener("click", () => {
  flashcard.classList.toggle("flipped");
});

knownBtn.addEventListener("click", markAsKnown);
unknownBtn.addEventListener("click", markAsUnknown);

toggleFilterBtn.addEventListener("click", () => {
  filterUnknown = !filterUnknown;
  if (filterUnknown) {
    toggleFilterBtn.textContent = "Alle Vokabeln anzeigen";
  } else {
    toggleFilterBtn.textContent = "Nur unbekannte Vokabeln";
  }
  currentIndex = 0;
  showCard(currentIndex);
  updateProgressUI();
});

// --------------------------------------------------------------
// Keyboard Navigation
// --------------------------------------------------------------
function setupKeyboardNavigation() {
  document.addEventListener('keydown', (e) => {
    // Nur wenn keine Texteingabe aktiv ist
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    const currentList = getCurrentVocabList();
    if (currentList.length === 0) return;
    
    switch (e.key) {
      case ' ':  // Leertaste: Karte umdrehen
      case 'Enter':
        e.preventDefault();
        flipBtn.click();
        break;
      case 'ArrowLeft':  // Links: Vorherige Karte
      case 'ArrowUp':
        e.preventDefault();
        prevBtn.click();
        break;
      case 'ArrowRight':  // Rechts: Nächste Karte
      case 'ArrowDown':
        e.preventDefault();
        nextBtn.click();
        break;
      case 'k':  // K: Gewusst markieren
      case 'K':
        e.preventDefault();
        markAsKnown();
        // Auto-advance nach "Gewusst"
        setTimeout(() => nextBtn.click(), 300);
        break;
      case 'u':  // U: Nicht gewusst markieren
      case 'U':
        e.preventDefault();
        markAsUnknown();
        break;
      case 'f':  // F: Filter togglen
      case 'F':
        e.preventDefault();
        toggleFilterBtn.click();
        break;
    }
  });
}

// --------------------------------------------------------------
// Accessibility: Karten-Attribute aktualisieren
// --------------------------------------------------------------
function updateCardAccessibility(vocab) {
  if (!vocab) {
    flashcard.setAttribute('role', 'region');
    flashcard.setAttribute('aria-label', 'Flashcard');
    cardFront.setAttribute('aria-label', 'Vorderseite');
    cardBack.setAttribute('aria-label', 'Rückseite');
    return;
  }
  
  flashcard.setAttribute('role', 'region');
  flashcard.setAttribute('aria-label', `Vokabel: ${vocab.latin}`);
  
  // Live-Region für Status-Änderungen
  const key = getProgressKey(vocab);
  const status = progress[key];
  let statusText = 'Unmarkiert';
  if (status === STATUS_KNOWN) statusText = 'Gewusst';
  if (status === STATUS_UNKNOWN) statusText = 'Nicht gewusst';
  
  cardFront.setAttribute('aria-label', `Latein: ${vocab.latin}. Status: ${statusText}. Leertaste zum Umdrehen.`);
  cardBack.setAttribute('aria-label', `Deutsch: ${vocab.german}`);
}

// ==============================================================
// FORMS MODE: Deklination & Konjugation
// ==============================================================

// --------------------------------------------------------------
// Konstanten für Forms Mode
// --------------------------------------------------------------
const FORMS_STORAGE_KEYS = {
  PROGRESS: 'formsProgress_v1',     // { wordKey: { solved: bool, attempts: int } }
  FILTER_SOLVED: 'formsFilterSolved' // bool: hide solved words
};

// --------------------------------------------------------------
// Globale Variablen für Forms Mode
// --------------------------------------------------------------
let formsData = [];              // Alle Form-Einträge aus forms.csv
let formsCurrentIndex = 0;       // Aktuelle Position
let formsProgress = {};          // Fortschritt: { "Vocabularium 1|schola": { solved: true, attempts: 2 } }
let currentFormsWord = null;     // Aktuelles Wort mit Formen
let droppedForms = new Map();    // cellIndex -> droppedForm
// Note: formsFilterSolved is the checkbox element reference, not a boolean

// --------------------------------------------------------------
// DOM-Elemente für Forms Mode
// --------------------------------------------------------------
const modeFlashcardsBtn = document.getElementById('mode-flashcards');
const modeFormsBtn = document.getElementById('mode-forms');
const flashcardMode = document.getElementById('flashcard-mode');
const formsMode = document.getElementById('forms-mode');
const flashcardHelp = document.getElementById('flashcard-help');
const formsHelp = document.getElementById('forms-help');

const formsWordTitle = document.getElementById('forms-word-title');
const formsWordType = document.getElementById('forms-word-type');
const draggableForms = document.getElementById('draggable-forms');
const formsGrid = document.getElementById('forms-grid');
const formsHeader = document.getElementById('forms-header');
const formsBody = document.getElementById('forms-body');
const formsFeedback = document.getElementById('forms-feedback');
const formsCheckBtn = document.getElementById('forms-check-btn');
const formsHintBtn = document.getElementById('forms-hint-btn');
const formsResetBtn = document.getElementById('forms-reset-btn');
const formsSkipBtn = document.getElementById('forms-skip-btn');
const formsFilterSolved = document.getElementById('forms-filter-solved');

// --------------------------------------------------------------
// Forms CSV laden
// --------------------------------------------------------------
async function loadFormsCSV() {
  try {
    const response = await fetch('forms.csv');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    formsData = parseFormsCSV(text);
    console.log(`Forms CSV geladen: ${formsData.length} Einträge`);
  } catch (error) {
    console.error('Fehler beim Laden von forms.csv:', error);
    formsFeedback.textContent = 'Fehler: forms.csv konnte nicht geladen werden.';
    formsFeedback.className = 'forms-feedback error';
  }
}

// --------------------------------------------------------------
// Forms CSV parsen
// Format: word;type;subtype;form1|form2|form3|...
// --------------------------------------------------------------
function parseFormsCSV(csvText) {
  const lines = csvText.split(/\r?\n/);
  const result = [];
  let currentGroup = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Header: ### Vocabularium N
    if (trimmed.startsWith('###')) {
      currentGroup = trimmed.replace('###', '').trim();
      continue;
    }

    // Datenzeile: word;type;subtype;forms
    const parts = trimmed.split(';');
    if (parts.length >= 4) {
      const [word, type, subtype, formsStr] = parts;
      const forms = formsStr.split('|').map(f => f.trim()).filter(f => f);
      
      result.push({
        group: currentGroup,
        word: word.trim(),
        type: type.trim(),
        subtype: subtype.trim(),
        forms: forms
      });
    }
  }

  return result;
}

// --------------------------------------------------------------
// Modus-Umschaltung
// --------------------------------------------------------------
function switchMode(mode) {
  if (mode === 'flashcards') {
    flashcardMode.classList.add('active');
    formsMode.classList.remove('active');
    modeFlashcardsBtn.classList.add('active');
    modeFlashcardsBtn.setAttribute('aria-selected', 'true');
    modeFormsBtn.classList.remove('active');
    modeFormsBtn.setAttribute('aria-selected', 'false');
    flashcardHelp.classList.remove('hidden');
    formsHelp.classList.add('hidden');
  } else {
    flashcardMode.classList.remove('active');
    formsMode.classList.add('active');
    modeFlashcardsBtn.classList.remove('active');
    modeFlashcardsBtn.setAttribute('aria-selected', 'false');
    modeFormsBtn.classList.add('active');
    modeFormsBtn.setAttribute('aria-selected', 'true');
    flashcardHelp.classList.add('hidden');
    formsHelp.classList.remove('hidden');
    
    // Forms Mode initialisieren wenn nötig
    if (formsData.length === 0) {
      loadFormsCSV().then(() => {
        initFormsMode();
      });
    } else {
      initFormsMode();
    }
  }
}

// --------------------------------------------------------------
// Forms Mode initialisieren
// --------------------------------------------------------------
function initFormsMode() {
  // Progress laden
  formsProgress = safeJSONParse(FORMS_STORAGE_KEYS.PROGRESS, {});
  formsFilterSolved.checked = safeJSONParse(FORMS_STORAGE_KEYS.FILTER_SOLVED, false);
  
  // Erstes Wort anzeigen
  showNextFormsWord();
}

// --------------------------------------------------------------
// Nächstes Wort im Forms Mode anzeigen
// --------------------------------------------------------------
function showNextFormsWord() {
  const availableWords = getAvailableFormsWords();
  
  if (availableWords.length === 0) {
    showFormsEmptyState();
    return;
  }
  
  // Zufälliges Wort auswählen (oder sequentiell)
  formsCurrentIndex = Math.floor(Math.random() * availableWords.length);
  currentFormsWord = availableWords[formsCurrentIndex];
  
  renderFormsGame();
}

// --------------------------------------------------------------
// Verfügbare Wörter für Forms Mode (mit Filter)
// --------------------------------------------------------------
function getAvailableFormsWords() {
  return formsData.filter(item => {
    // Nur ausgewählte Vocabularia
    if (!selectedVocabSets.has(item.group)) return false;
    
    // Filter: gelöste ausblenden
    if (formsFilterSolved.checked) {
      const key = `${item.group}|${item.word}`;
      const prog = formsProgress[key];
      if (prog && prog.solved) return false;
    }
    
    return true;
  });
}

// --------------------------------------------------------------
// Empty State für Forms Mode
// --------------------------------------------------------------
function showFormsEmptyState() {
  formsWordTitle.textContent = 'Keine Wörter verfügbar';
  formsWordType.textContent = formsFilterSolved.checked 
    ? 'Alle verfügbaren Wörter wurden gelöst! Filter deaktivieren um alle zu sehen.'
    : 'Bitte wähle Vocabularia aus (unten).';
  
  draggableForms.innerHTML = '';
  formsHeader.innerHTML = '';
  formsBody.innerHTML = '';
  formsFeedback.textContent = '';
  formsFeedback.className = 'forms-feedback';
  
  formsCheckBtn.disabled = true;
  formsResetBtn.disabled = true;
}

// --------------------------------------------------------------
// Forms Game rendern (Grid + Draggables)
// --------------------------------------------------------------
function renderFormsGame() {
  if (!currentFormsWord) return;
  
  const word = currentFormsWord;
  const key = `${word.group}|${word.word}`;
  const progress = formsProgress[key] || { solved: false, attempts: 0 };
  
  // Titel und Typ
  formsWordTitle.textContent = `Wort: ${word.word}`;
  const typeLabel = word.type === 'Noun' ? 'Substantiv' : 'Verb';
  formsWordType.textContent = `Typ: ${typeLabel} (${word.subtype}) - ${word.group}`;
  
  // Feedback zurücksetzen
  formsFeedback.textContent = progress.solved 
    ? `Bereits gelöst (Versuche: ${progress.attempts})`
    : 'Ziehe die Formen in die richtigen Felder';
  formsFeedback.className = progress.solved ? 'forms-feedback success' : 'forms-feedback info';
  
  // Buttons aktivieren
  formsCheckBtn.disabled = progress.solved;
  formsResetBtn.disabled = false;
  formsSkipBtn.textContent = 'Überspringen';

  // Draggables erstellen
  createDraggableForms(word);

  // Grid erstellen
  createFormsGrid(word);

  // Drop-Zone für Pool einrichten (zum Zurückziehen)
  setupPoolDropZone();

  // Dropped Forms zurücksetzen
  droppedForms = new Map();
}

// --------------------------------------------------------------
// Pool als Drop-Zone einrichten (für Zurückziehen aus Zellen)
// --------------------------------------------------------------
function setupPoolDropZone() {
  const pool = document.getElementById('draggable-forms');
  if (!pool) return;

  pool.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    pool.classList.add('drag-over');
  });

  pool.addEventListener('dragleave', () => {
    pool.classList.remove('drag-over');
  });

  pool.addEventListener('drop', (e) => {
    e.preventDefault();
    pool.classList.remove('drag-over');

    const form = e.dataTransfer.getData('text/plain');
    const sourceCellIndex = e.dataTransfer.getData('source-cell');

    if (sourceCellIndex) {
      // Aus Zelle entfernen
      droppedForms.delete(sourceCellIndex);
      const sourceCell = document.querySelector(`.drop-zone[data-index="${sourceCellIndex}"]`);
      if (sourceCell) {
        sourceCell.innerHTML = '';
        sourceCell.classList.remove('correct', 'incorrect');
      }

      // Im Pool freigeben
      releaseDraggableItem(form);
    }
  });
}

// --------------------------------------------------------------
// Draggable Formen erstellen
// --------------------------------------------------------------
function createDraggableForms(word) {
  draggableForms.innerHTML = '';
  
  // Alle korrekten Formen + ein paar falsche (distractors)
  const correctForms = [...word.forms];
  const distractors = generateDistractors(word);
  const allForms = shuffleArray([...correctForms, ...distractors]);
  
  allForms.forEach((form, index) => {
    const item = document.createElement('div');
    item.className = 'draggable-item';
    item.textContent = form;
    item.draggable = true;
    item.dataset.form = form;
    item.dataset.index = index;
    
    // Drag Events
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
    
    // Touch Events für Mobile
    item.addEventListener('touchstart', handleTouchStart, { passive: false });
    item.addEventListener('touchmove', handleTouchMove, { passive: false });
    item.addEventListener('touchend', handleTouchEnd);
    
    draggableForms.appendChild(item);
  });
}

// --------------------------------------------------------------
// Falsche Formen (Distractors) generieren
// --------------------------------------------------------------
function generateDistractors(word) {
  const distractors = [];
  
  if (word.type === 'Noun') {
    // Typische Fehler: falsche Endungen
    const endings = ['a', 'ae', 'am', 'ā', 'ī', 'ō', 'um', 'ō', 'us', 'ī', 'ō', 'um'];
    const stems = word.forms.map(f => f.replace(/[aeiouāēīōū]$/, ''));
    
    for (let i = 0; i < 3; i++) {
      const stem = stems[Math.floor(Math.random() * stems.length)];
      const ending = endings[Math.floor(Math.random() * endings.length)];
      const fake = stem + ending;
      if (!word.forms.includes(fake) && !distractors.includes(fake)) {
        distractors.push(fake);
      }
    }
  } else if (word.type === 'Verb') {
    // Typische Fehler: falsche Konjugation
    const fakeEndings = ['o', 's', 't', 'mus', 'tis', 'nt', 'bam', 'bas', 'bat', 'bamus', 'batis', 'bant'];
    const stem = word.word.replace(/(o|or)$/, '');
    
    for (let i = 0; i < 4; i++) {
      const ending = fakeEndings[Math.floor(Math.random() * fakeEndings.length)];
      const fake = stem + ending;
      if (!word.forms.includes(fake) && !distractors.includes(fake)) {
        distractors.push(fake);
      }
    }
  }
  
  return distractors.slice(0, 4); // Max 4 Distractors
}

// --------------------------------------------------------------
// Forms Grid erstellen (Kasus oder Personen)
// --------------------------------------------------------------
function createFormsGrid(word) {
  formsHeader.innerHTML = '';
  formsBody.innerHTML = '';
  
  if (word.type === 'Noun') {
    createNounGrid(word);
  } else if (word.type === 'Verb') {
    createVerbGrid(word);
  }
}

// --------------------------------------------------------------
// Substantiv-Grid (Deklination)
// --------------------------------------------------------------
function createNounGrid(word) {
  // Header: Singular / Plural
  const thEmpty = document.createElement('th');
  thEmpty.textContent = 'Kasus';
  formsHeader.appendChild(thEmpty);
  
  const thSing = document.createElement('th');
  thSing.textContent = 'Singular';
  formsHeader.appendChild(thSing);
  
  const thPlur = document.createElement('th');
  thPlur.textContent = 'Plural';
  formsHeader.appendChild(thPlur);
  
  // Kasus-Reihenfolge (wie in CSV: N-G-D-A-V-Abl)
  const cases = ['Nominativ', 'Genitiv', 'Dativ', 'Akkusativ', 'Vokativ', 'Ablativ'];
  const singForms = word.forms.slice(0, 6);
  const plurForms = word.forms.slice(6, 12);
  
  cases.forEach((casus, index) => {
    const row = document.createElement('tr');
    
    // Kasus-Label
    const th = document.createElement('th');
    th.textContent = casus;
    row.appendChild(th);
    
    // Singular
    const tdSing = document.createElement('td');
    tdSing.className = 'drop-zone';
    tdSing.dataset.case = casus;
    tdSing.dataset.number = 'Singular';
    tdSing.dataset.index = index;
    tdSing.dataset.correct = singForms[index] || '';
    setupDropZone(tdSing);
    row.appendChild(tdSing);
    
    // Plural
    const tdPlur = document.createElement('td');
    tdPlur.className = 'drop-zone';
    tdPlur.dataset.case = casus;
    tdPlur.dataset.number = 'Plural';
    tdPlur.dataset.index = index + 6;
    tdPlur.dataset.correct = plurForms[index] || '';
    setupDropZone(tdPlur);
    row.appendChild(tdPlur);
    
    formsBody.appendChild(row);
  });
}

// --------------------------------------------------------------
// Verb-Grid (Konjugation)
// --------------------------------------------------------------
function createVerbGrid(word) {
  const forms = word.forms;
  // forms[0-5] = Präsens Indikativ Aktiv (1.-3. Sg + 1.-3. Pl)
  // forms[6-11] = Perfekt
  // forms[12-17] = Plusquamperfekt
  // forms[18-23] = Futur I
  
  const tempi = ['Präsens', 'Perfekt', 'Plusquamperfekt', 'Futur I'];
  const personen = ['1. Person Sg', '2. Person Sg', '3. Person Sg', 
                    '1. Person Pl', '2. Person Pl', '3. Person Pl'];
  
  // Header: Personen
  const thEmpty = document.createElement('th');
  thEmpty.textContent = 'Person';
  formsHeader.appendChild(thEmpty);
  
  tempi.forEach(tempus => {
    const th = document.createElement('th');
    th.textContent = tempus;
    formsHeader.appendChild(th);
  });
  
  // Zeilen: Personen
  for (let p = 0; p < 6; p++) {
    const row = document.createElement('tr');
    
    const th = document.createElement('th');
    th.textContent = personen[p];
    row.appendChild(th);
    
    tempi.forEach((tempus, t) => {
      const td = document.createElement('td');
      td.className = 'drop-zone';
      td.dataset.person = personen[p];
      td.dataset.tempus = tempus;
      td.dataset.index = t * 6 + p;
      td.dataset.correct = forms[t * 6 + p] || '';
      setupDropZone(td);
      row.appendChild(td);
    });
    
    formsBody.appendChild(row);
  }
}

// --------------------------------------------------------------
// Drop Zone Setup
// --------------------------------------------------------------
function setupDropZone(element) {
  element.addEventListener('dragover', handleDragOver);
  element.addEventListener('dragenter', handleDragEnter);
  element.addEventListener('dragleave', handleDragLeave);
  element.addEventListener('drop', handleDrop);
}

// --------------------------------------------------------------
// Drag & Drop Event Handler
// --------------------------------------------------------------
let draggedItem = null;
let touchDragItem = null;

function handleDragStart(e) {
  draggedItem = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.form);
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  draggedItem = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
  e.preventDefault();
  if (this.classList.contains('drop-zone')) {
    this.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over');

  if (!this.classList.contains('drop-zone')) return;

  const form = e.dataTransfer.getData('text/plain');
  const sourceCellIndex = e.dataTransfer.getData('source-cell');
  const targetCellIndex = this.dataset.index;

  // Wenn aus einer anderen Zelle verschoben wird
  if (sourceCellIndex && sourceCellIndex !== targetCellIndex) {
    // Aus alter Zelle entfernen
    droppedForms.delete(sourceCellIndex);
    const sourceCell = document.querySelector(`.drop-zone[data-index="${sourceCellIndex}"]`);
    if (sourceCell) {
      sourceCell.innerHTML = '';
      sourceCell.classList.remove('correct', 'incorrect');
    }
  }

  // Form in Ziel-Zelle platzieren
  placeFormInCell(this, form, targetCellIndex);
}

// --------------------------------------------------------------
// Touch Event Handler für Mobile
// --------------------------------------------------------------
function handleTouchStart(e) {
  if (this.classList.contains('used')) return;
  
  touchDragItem = this;
  this.classList.add('dragging');
  
  // Touch-Position merken
  const touch = e.touches[0];
  this.dataset.touchX = touch.clientX;
  this.dataset.touchY = touch.clientY;
}

function handleTouchMove(e) {
  if (!touchDragItem) return;
  e.preventDefault();
  
  const touch = e.touches[0];
  
  // Element unter dem Finger finden
  const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
  if (!elementBelow) return;
  
  // Drop-Zone finden
  const dropZone = elementBelow.closest('.drop-zone');
  if (dropZone) {
    document.querySelectorAll('.drop-zone').forEach(z => z.classList.remove('drag-over'));
    dropZone.classList.add('drag-over');
  }
}

function handleTouchEnd(e) {
  if (!touchDragItem) return;
  
  touchDragItem.classList.remove('dragging');
  
  const touch = e.changedTouches[0];
  const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
  
  if (elementBelow) {
    const dropZone = elementBelow.closest('.drop-zone');
    if (dropZone) {
      const form = touchDragItem.dataset.form;
      const cellIndex = dropZone.dataset.index;
      placeFormInCell(dropZone, form, cellIndex);
    }
  }
  
  document.querySelectorAll('.drop-zone').forEach(z => z.classList.remove('drag-over'));
  touchDragItem = null;
}

// --------------------------------------------------------------
// Form in Zelle platzieren
// --------------------------------------------------------------
function placeFormInCell(cell, form, cellIndex) {
  // Vorherige Form aus dieser Zelle zurücksetzen
  const previousForm = droppedForms.get(cellIndex);
  if (previousForm) {
    releaseDraggableItem(previousForm);
  }

  // Neue Form setzen (mit draggable span)
  const span = document.createElement('span');
  span.className = 'dropped-item';
  span.textContent = form;
  span.draggable = true;
  span.dataset.form = form;

  // Drag-Events für das bewegliche Element in der Zelle
  span.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', form);
    e.dataTransfer.setData('source-cell', cellIndex);
    span.classList.add('dragging');
  });

  span.addEventListener('dragend', () => {
    span.classList.remove('dragging');
  });

  // Touch-Events für Mobile
  span.addEventListener('touchstart', handleCellTouchStart, { passive: false });
  span.addEventListener('touchmove', handleCellTouchMove, { passive: false });
  span.addEventListener('touchend', handleCellTouchEnd);

  cell.innerHTML = '';
  cell.appendChild(span);
  droppedForms.set(cellIndex, form);

  // Draggable-Pool-Item als "used" markieren
  const draggable = document.querySelector(`.draggable-item[data-form="${form}"]`);
  if (draggable) {
    draggable.classList.add('used');
    draggable.draggable = false;
  }

  // Zellen-Styling zurücksetzen (falls vorher geprüft)
  cell.classList.remove('correct', 'incorrect');
}

// --------------------------------------------------------------
// Touch-Handler für Elemente in Zellen (zum Verschieben)
// --------------------------------------------------------------
let cellTouchItem = null;
let cellTouchSource = null;

function handleCellTouchStart(e) {
  e.preventDefault();
  cellTouchItem = this;
  cellTouchSource = this.parentElement;
  this.classList.add('dragging');
}

function handleCellTouchMove(e) {
  if (!cellTouchItem) return;
  e.preventDefault();

  const touch = e.touches[0];
  const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
  if (!elementBelow) return;

  // Drop-Zone oder Pool finden
  const dropZone = elementBelow.closest('.drop-zone');
  const pool = elementBelow.closest('.draggable-container');

  document.querySelectorAll('.drop-zone, .draggable-container').forEach(z => z.classList.remove('drag-over'));

  if (dropZone && dropZone !== cellTouchSource) {
    dropZone.classList.add('drag-over');
  } else if (pool) {
    pool.classList.add('drag-over');
  }
}

function handleCellTouchEnd(e) {
  if (!cellTouchItem) return;

  cellTouchItem.classList.remove('dragging');

  const touch = e.changedTouches[0];
  const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);

  if (elementBelow) {
    const dropZone = elementBelow.closest('.drop-zone');
    const pool = elementBelow.closest('.draggable-container');
    const form = cellTouchItem.dataset.form;
    const sourceCell = cellTouchSource;

    if (dropZone && dropZone !== sourceCell) {
      // In neue Zelle verschieben
      const targetIndex = dropZone.dataset.index;
      const previousForm = droppedForms.get(targetIndex);
      if (previousForm) {
        releaseDraggableItem(previousForm);
      }

      // Aus alter Zelle entfernen
      const sourceIndex = sourceCell.dataset.index;
      droppedForms.delete(sourceIndex);
      sourceCell.innerHTML = '';
      sourceCell.classList.remove('correct', 'incorrect');

      // In neue Zelle setzen
      placeFormInCell(dropZone, form, targetIndex);
    } else if (pool) {
      // Zurück in den Pool
      const sourceIndex = sourceCell.dataset.index;
      droppedForms.delete(sourceIndex);
      sourceCell.innerHTML = '';
      sourceCell.classList.remove('correct', 'incorrect');
      releaseDraggableItem(form);
    }
  }

  document.querySelectorAll('.drop-zone, .draggable-container').forEach(z => z.classList.remove('drag-over'));
  cellTouchItem = null;
  cellTouchSource = null;
}

// --------------------------------------------------------------
// Draggable Item freigeben (aus Zelle entfernen)
// --------------------------------------------------------------
function releaseDraggableItem(form) {
  const draggable = document.querySelector(`.draggable-item[data-form="${form}"]`);
  if (draggable) {
    draggable.classList.remove('used');
    draggable.draggable = true;
  }
}

// --------------------------------------------------------------
// Prüfen-Button Handler
// --------------------------------------------------------------
formsCheckBtn.addEventListener('click', checkFormsAnswers);

function checkFormsAnswers() {
  if (!currentFormsWord) return;
  
  let correct = 0;
  let total = 0;
  const dropZones = document.querySelectorAll('.drop-zone');
  
  dropZones.forEach(zone => {
    const cellIndex = zone.dataset.index;
    const correctForm = zone.dataset.correct;
    const droppedForm = droppedForms.get(cellIndex);
    
    if (correctForm) {
      total++;
      
      if (droppedForm === correctForm) {
        zone.classList.add('correct');
        zone.classList.remove('incorrect');
        correct++;
      } else if (droppedForm) {
        zone.classList.add('incorrect');
        zone.classList.remove('correct');
      } else {
        zone.classList.remove('correct', 'incorrect');
      }
    }
  });
  
  // Feedback
  const key = `${currentFormsWord.group}|${currentFormsWord.word}`;
  const isComplete = correct === total;
  
  if (isComplete) {
    formsFeedback.textContent = `Richtig! Alle ${total} Formen korrekt.`;
    formsFeedback.className = 'forms-feedback success';

    // Progress speichern
    formsProgress[key] = {
      solved: true,
      attempts: (formsProgress[key]?.attempts || 0) + 1
    };
    saveFormsProgress();

    formsCheckBtn.disabled = true;
    formsSkipBtn.textContent = 'Nächstes';
  } else {
    formsFeedback.textContent = `${correct} von ${total} richtig. Versuche es nochmal!`;
    formsFeedback.className = 'forms-feedback error';
    
    // Progress: Versuch zählen
    formsProgress[key] = { 
      solved: false, 
      attempts: (formsProgress[key]?.attempts || 0) + 1 
    };
    saveFormsProgress();
  }
}

// --------------------------------------------------------------
// Zurücksetzen-Button Handler
// --------------------------------------------------------------
formsResetBtn.addEventListener('click', resetFormsGame);

function resetFormsGame() {
  droppedForms = new Map();
  document.querySelectorAll('.drop-zone').forEach(zone => {
    zone.innerHTML = '';
    zone.classList.remove('correct', 'incorrect');
  });
  document.querySelectorAll('.draggable-item').forEach(item => {
    item.classList.remove('used');
    item.draggable = true;
  });
  formsFeedback.textContent = 'Zurückgesetzt. Versuche es nochmal!';
  formsFeedback.className = 'forms-feedback info';
  formsCheckBtn.disabled = false;
}

// --------------------------------------------------------------
// Überspringen-Button Handler
// --------------------------------------------------------------
formsSkipBtn.addEventListener('click', () => {
  showNextFormsWord();
});

// --------------------------------------------------------------
// Hilfe-Button Handler
// --------------------------------------------------------------
formsHintBtn.addEventListener('click', giveHint);

function giveHint() {
  if (!currentFormsWord) return;

  // Alle leeren Zellen finden
  const emptyCells = [];
  const allCells = document.querySelectorAll('.drop-zone');

  allCells.forEach(cell => {
    if (!cell.querySelector('.dropped-item')) {
      const correctForm = cell.dataset.correct;
      if (correctForm) {
        emptyCells.push({
          cell: cell,
          index: cell.dataset.index,
          correctForm: correctForm
        });
      }
    }
  });

  if (emptyCells.length === 0) {
    formsFeedback.textContent = 'Alle Felder sind bereits ausgefüllt!';
    formsFeedback.className = 'forms-feedback info';
    return;
  }

  // Zufällige leere Zelle auswählen
  const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  const form = randomCell.correctForm;
  const cell = randomCell.cell;
  const cellIndex = randomCell.index;

  // Prüfen ob Form im Pool verfügbar ist
  const draggable = document.querySelector(`.draggable-item[data-form="${form}"]:not(.used)`);
  const alreadyInCell = Array.from(droppedForms.values()).includes(form);

  if (!draggable && alreadyInCell) {
    // Form ist bereits in einer anderen Zelle - dort entfernen
    const occupiedCell = document.querySelector(`.drop-zone[data-index="${cellIndex}"]`);
    if (occupiedCell && occupiedCell.querySelector('.dropped-item')) {
      // Diese Zelle ist bereits korrekt besetzt, neue wählen
      formsFeedback.textContent = 'Diese Form ist bereits korrekt platziert!';
      formsFeedback.className = 'forms-feedback info';
      return;
    }
  }

  // Form in Zelle platzieren
  placeFormInCell(cell, form, cellIndex);

  // Visuelles Feedback
  cell.classList.add('hint-applied');
  setTimeout(() => cell.classList.remove('hint-applied'), 1000);

  // Feedback-Text
  const remaining = emptyCells.length - 1;
  formsFeedback.textContent = `Hilfe: "${form}" wurde eingefügt. Noch ${remaining} Feld(er) leer.`;
  formsFeedback.className = 'forms-feedback hint';
}

// --------------------------------------------------------------
// Forms Progress speichern
// --------------------------------------------------------------
function saveFormsProgress() {
  try {
    localStorage.setItem(FORMS_STORAGE_KEYS.PROGRESS, JSON.stringify(formsProgress));
  } catch (e) {
    console.error('Failed to save forms progress:', e);
  }
}

// --------------------------------------------------------------
// Shuffle Array (Fisher-Yates)
// --------------------------------------------------------------
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// ==============================================================
// Event Listeners für Mode Switch
// ==============================================================
modeFlashcardsBtn.addEventListener('click', () => switchMode('flashcards'));
modeFormsBtn.addEventListener('click', () => switchMode('forms'));

// --------------------------------------------------------------
// Forms Filter Change Handler
// --------------------------------------------------------------
formsFilterSolved.addEventListener('change', () => {
  // Speichern und neue Wort laden
  try {
    localStorage.setItem(FORMS_STORAGE_KEYS.FILTER_SOLVED, JSON.stringify(formsFilterSolved.checked));
  } catch (e) {
    console.error('Failed to save filter setting:', e);
  }
  showNextFormsWord();
});

// ==============================================================
// Automatic Update Check System
// Checks every 5 minutes for new data versions online
// ==============================================================
const UPDATE_CONFIG = {
  checkInterval: 5 * 60 * 1000, // 5 minutes
  versionUrl: './version.json',
  localStorageKey: 'lateintrainer_lastVersion',
  hashKeys: ['formsHash', 'vocabHash']
};

let updateCheckInterval = null;
let updateNotificationShown = false;

async function checkForUpdates() {
  // Skip if already showing notification
  if (updateNotificationShown) return;

  try {
    // Add cache-buster to prevent caching
    const cacheBuster = `?t=${Date.now()}`;
    const response = await fetch(UPDATE_CONFIG.versionUrl + cacheBuster, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      // Silent fail on network errors - no error thrown
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      // Server returned error - silently ignore
      return;
    }

    const remoteVersion = await response.json();
    const currentVersion = localStorage.getItem(UPDATE_CONFIG.localStorageKey);

    // If no version stored yet, store current and skip
    if (!currentVersion) {
      localStorage.setItem(UPDATE_CONFIG.localStorageKey, remoteVersion.version);
      // Also store hashes
      UPDATE_CONFIG.hashKeys.forEach(key => {
        if (remoteVersion[key]) {
          localStorage.setItem(`lateintrainer_${key}`, remoteVersion[key]);
        }
      });
      return;
    }

    // Check if version changed
    const versionChanged = remoteVersion.version !== currentVersion;

    // Check if any content hashes changed
    let hashesChanged = false;
    UPDATE_CONFIG.hashKeys.forEach(key => {
      const storedHash = localStorage.getItem(`lateintrainer_${key}`);
      const remoteHash = remoteVersion[key];
      if (remoteHash && storedHash !== remoteHash) {
        hashesChanged = true;
      }
    });

    // Show notification if version OR content changed
    if (versionChanged || hashesChanged) {
      showUpdateNotification(remoteVersion);
    }
  } catch (error) {
    // Network error, timeout, or other issue - silently ignore
    // No console.error to avoid spamming users
  }
}

function showUpdateNotification(versionInfo) {
  updateNotificationShown = true;

  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'update-notification';
  notification.className = 'update-notification';
  notification.innerHTML = `
    <div class="update-content">
      <span class="update-icon">📚</span>
      <div class="update-text">
        <strong>Neue Vokabel-Daten verfügbar!</strong>
        <span>Version ${versionInfo.version} ist online.</span>
      </div>
      <button id="update-reload-btn" class="update-btn">Jetzt aktualisieren</button>
      <button id="update-dismiss-btn" class="update-btn secondary">Später</button>
    </div>
  `;

  document.body.appendChild(notification);

  // Handle reload button
  notification.querySelector('#update-reload-btn').addEventListener('click', () => {
    localStorage.setItem(UPDATE_CONFIG.localStorageKey, versionInfo.version);
    // Save all hashes
    UPDATE_CONFIG.hashKeys.forEach(key => {
      if (versionInfo[key]) {
        localStorage.setItem(`lateintrainer_${key}`, versionInfo[key]);
      }
    });
    window.location.reload();
  });

  // Handle dismiss button
  notification.querySelector('#update-dismiss-btn').addEventListener('click', () => {
    notification.remove();
    updateNotificationShown = false;
    // Remember dismissed version but keep checking
    localStorage.setItem(UPDATE_CONFIG.localStorageKey, versionInfo.version);
  });
}

function startUpdateChecker() {
  // Initial check after 30 seconds (let page fully load first)
  setTimeout(checkForUpdates, 30000);

  // Then check every 5 minutes
  updateCheckInterval = setInterval(checkForUpdates, UPDATE_CONFIG.checkInterval);
}

function stopUpdateChecker() {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
}

// Start checking when page loads
startUpdateChecker();

// Stop checking when page is hidden (save battery)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopUpdateChecker();
  } else {
    startUpdateChecker();
    // Immediate check when becoming visible
    checkForUpdates();
  }
});
