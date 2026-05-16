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
