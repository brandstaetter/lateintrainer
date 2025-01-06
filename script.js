// --------------------------------------------------------------
// Globale Variablen
// --------------------------------------------------------------
let vocabList = [];            // Alle Vokabeln (aus der CSV)
let currentIndex = 0;          // Aktuelle Position im gefilterten Array

// Lernstatus je Vokabel: { "Roma": "known"/"unknown", ... }
let progress = {};

// "Nur unbekannte" Filter-Flag
let filterUnknown = false;

// ALLE jemals entdeckten Gruppen
let discoveredVocabGroups = [];  // als Array gespeichert
// AKTUELL ausgewählte Gruppen
let selectedVocabSets = new Set();

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
// 1) CSV laden und verarbeiten
// --------------------------------------------------------------
fetch("vokabeln.csv")
  .then(response => response.text())
  .then(csvText => {
    // CSV parsen
    vocabList = parseCSV(csvText);

    // 1a) Lernstatus laden
    const storedProgress = localStorage.getItem("vocabProgress");
    if (storedProgress) {
      progress = JSON.parse(storedProgress);
    } else {
      progress = {};
    }

    // 1b) discoveredVocabGroups laden
    //     (Falls nicht vorhanden, als leeres Array initialisieren)
    const storedDiscovered = localStorage.getItem("discoveredVocabGroups");
    if (storedDiscovered) {
      discoveredVocabGroups = JSON.parse(storedDiscovered);
    } else {
      discoveredVocabGroups = [];
    }

    // 1c) selectedVocabSets laden
    const storedSelectedSets = localStorage.getItem("selectedVocabSets");
    if (storedSelectedSets) {
      selectedVocabSets = new Set(JSON.parse(storedSelectedSets));
    } else {
      selectedVocabSets = new Set();
    }

    // 2) Shuffle
    shuffleArray(vocabList);

    // 3) Neue Gruppen entdecken + aufnehmen
    discoverNewGroups();

    // 4) Checkboxen bauen
    buildVocabulariumCheckboxes();

    // 5) Erste Karte anzeigen
    showCard(currentIndex);

    // Fortschrittsanzeige aktualisieren
    updateProgressUI();
  })
  .catch(error => {
    console.error("Fehler beim Laden der CSV-Datei:", error);
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
    // discoveredVocabGroups sortieren für bessere Übersicht
    discoveredVocabGroups.sort();
    localStorage.setItem("discoveredVocabGroups", JSON.stringify(discoveredVocabGroups));
    saveSelectedVocabSets();
  }
}

// --------------------------------------------------------------
// Checkboxes bauen (alphabetisch sortiert -> discoveredVocabGroups)
// --------------------------------------------------------------
function buildVocabulariumCheckboxes() {
  // Zuerst evtl. alten Inhalt leeren
  vocabulariumCheckboxesContainer.innerHTML = "";

  // discoveredVocabGroups ist bereits sortiert (s. discoverNewGroups).
  // Wir iterieren nun in Alphabetischer Reihenfolge:
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
  localStorage.setItem("selectedVocabSets", JSON.stringify(Array.from(selectedVocabSets)));
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
    cardFront.textContent = "Keine Vokabeln";
    cardBack.textContent = "im Filter!";
    flashcard.classList.remove("flipped");
    flashcard.style.border = "3px solid grey";
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

  const vocab = currentList[currentIndex];
  cardFront.textContent = vocab.latin;
  cardBack.textContent = vocab.german;

  // ggf. zurückdrehen
  flashcard.classList.remove("flipped");

  const status = progress[vocab.latin];
  if (status === "known") {
    flashcard.style.border = "5px solid green";
  } else if (status === "unknown") {
    flashcard.style.border = "5px solid red";
  } else {
    flashcard.style.border = "none";
  }
}

// --------------------------------------------------------------
// Liefert die Vokabelliste nach aktuellem Filter:
// 1) group ∈ selectedVocabSets
// 2) unknown-Filter (wenn filterUnknown = true, nur NICHT "known")
// --------------------------------------------------------------
function getCurrentVocabList() {
  return vocabList.filter((v) => {
    if (!selectedVocabSets.has(v.group)) return false;
    if (filterUnknown && progress[v.latin] === "known") return false;
    return true;
  });
}

// --------------------------------------------------------------
// Markieren als Gewusst
// --------------------------------------------------------------
function markAsKnown() {
  const currentList = getCurrentVocabList();
  if (currentList.length === 0) return;

  const vocab = currentList[currentIndex];
  progress[vocab.latin] = "known";
  localStorage.setItem("vocabProgress", JSON.stringify(progress));

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
  progress[vocab.latin] = "unknown";
  localStorage.setItem("vocabProgress", JSON.stringify(progress));

  showCard(currentIndex);
  updateProgressUI();
}

// --------------------------------------------------------------
// Aktualisiert die Anzeige (Zählfunktion)
// --------------------------------------------------------------
function updateProgressUI() {
  const allRelevant = getCurrentVocabList();
  const total = allRelevant.length;

  let knownCount = 0;
  let unknownCount = 0;
  for (const v of allRelevant) {
    if (progress[v.latin] === "known") {
      knownCount++;
    } else if (progress[v.latin] === "unknown") {
      unknownCount++;
    }
  }

  const msg = `Ausgewählte Vokabeln: ${total}
   | Bekannte: ${knownCount}
   | Unbekannte: ${unknownCount}
   | Unmarkiert: ${total - knownCount - unknownCount}`;
  progressInfo.textContent = msg;
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
