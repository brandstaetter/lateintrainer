// --------------------------------------------------------------
// Globale Variablen
// --------------------------------------------------------------
let vocabList = [];           // Alle Vokabeln (aus der CSV)
let currentIndex = 0;         // Aktuelle Position in der angezeigten Liste
let progress = {};            // Speichert Lernstatus je Vokabel { latinWord: "known"/"unknown" }
let filterUnknown = false;    // Zeigt an, ob wir nur unbekannte Vokabeln filtern

// --------------------------------------------------------------
// DOM-Elemente referenzieren
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

// --------------------------------------------------------------
// 1) CSV laden und verarbeiten
// --------------------------------------------------------------
fetch("vokabeln.csv")
  .then(response => response.text())
  .then(csvText => {
    // CSV parsen, leere Zeilen und ### ignorieren
    vocabList = parseCSV(csvText);

    // Local Storage auslesen (falls vorhanden)
    const storedProgress = localStorage.getItem("vocabProgress");
    if (storedProgress) {
      progress = JSON.parse(storedProgress);
    } else {
      progress = {}; 
    }

    // HIER: Vokabeln mischen!
    shuffleArray(vocabList);

    // Erste Karte anzeigen
    showCard(currentIndex);

    // Fortschrittsanzeige aktualisieren
    updateProgressUI();
  })
  .catch(error => {
    console.error("Fehler beim Laden der CSV-Datei:", error);
  });

// --------------------------------------------------------------
// CSV parse-Funktion
//  - Splittet in Zeilen
//  - Ignoriert leere Zeilen und "###"
//  - Splittet am Semikolon in [latin, german]
// --------------------------------------------------------------
function parseCSV(csvString) {
  const lines = csvString
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith("###"));

  const result = [];
  for (const line of lines) {
    const parts = line.split(";");
    if (parts.length >= 2) {
      result.push({
        latin: parts[0],
        german: parts[1],
      });
    }
  }
  return result;
}

// --------------------------------------------------------------
// Funktion zum Mischen der Vokabeln (Fisher–Yates-Shuffle)
// --------------------------------------------------------------
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// --------------------------------------------------------------
// 2) Karten-Anzeige
// --------------------------------------------------------------
function showCard(index) {
  // Hole die aktuell relevante Liste (alle oder nur unbekannte)
  const currentList = getCurrentVocabList();

  // Edge-Case: Falls keine Vokabeln mehr in der gefilterten Liste sind
  if (currentList.length === 0) {
    cardFront.textContent = "Keine Vokabeln";
    cardBack.textContent = "im Filter!";
    flashcard.classList.remove("flipped");
    flashcard.style.border = "3px solid grey";
    return;
  }

  // Index validieren
  if (index < 0) {
    currentIndex = currentList.length - 1;
  } else if (index >= currentList.length) {
    currentIndex = 0;
  } else {
    currentIndex = index;
  }

  // Vokabel laden
  const vocab = currentList[currentIndex];
  cardFront.textContent = vocab.latin;
  cardBack.textContent = vocab.german;

  // Ggf. zurückdrehen
  flashcard.classList.remove("flipped");

  // Randfarbe je nach Fortschritt
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
// Liefert die Liste mit Vokabeln:
//  - Wenn filterUnknown = true, nur "unknown" Vokabeln
//  - Sonst alle
// --------------------------------------------------------------
function getCurrentVocabList() {
  if (!filterUnknown) {
    return vocabList;
  } else {
    // Nur unbekannte Vokabeln filtern
    return vocabList.filter(v => progress[v.latin] !== "known");
  }
}

// --------------------------------------------------------------
// 3) Lernstatus setzen (Gewusst / Nicht gewusst)
// --------------------------------------------------------------
function markAsKnown() {
  const currentList = getCurrentVocabList();
  if (currentList.length === 0) return; // Keine Vokabeln im Filter

  const vocab = currentList[currentIndex];
  progress[vocab.latin] = "known";

  // Speichern in localStorage
  localStorage.setItem("vocabProgress", JSON.stringify(progress));

  // UI updaten
  showCard(currentIndex);
  updateProgressUI();
}

function markAsUnknown() {
  const currentList = getCurrentVocabList();
  if (currentList.length === 0) return;

  const vocab = currentList[currentIndex];
  progress[vocab.latin] = "unknown";

  // Speichern in localStorage
  localStorage.setItem("vocabProgress", JSON.stringify(progress));

  // UI updaten
  showCard(currentIndex);
  updateProgressUI();
}

// --------------------------------------------------------------
// 4) Fortschritt anzeigen (z. B. X von Y bekannt)
// --------------------------------------------------------------
function updateProgressUI() {
  const total = vocabList.length;
  let knownCount = 0;
  let unknownCount = 0;
  for (const v of vocabList) {
    if (progress[v.latin] === "known") {
      knownCount++;
    } else if (progress[v.latin] === "unknown") {
      unknownCount++;
    }
  }

  // Text in progressInfo
  const msg = `Bekannte Vokabeln: ${knownCount} / ${total} | 
               Unbekannte: ${unknownCount} | 
               Unmarkiert: ${total - knownCount - unknownCount}`;
  progressInfo.textContent = msg;
}

// --------------------------------------------------------------
// 5) Event Listener
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

// Button, um Filter (nur unbekannte) ein-/auszuschalten
toggleFilterBtn.addEventListener("click", () => {
  filterUnknown = !filterUnknown;
  if (filterUnknown) {
    toggleFilterBtn.textContent = "Alle Vokabeln anzeigen";
  } else {
    toggleFilterBtn.textContent = "Nur unbekannte Vokabeln";
  }
  // Beim Umschalten fangen wir sicherheitshalber bei Index 0 an
  currentIndex = 0;
  showCard(currentIndex);
});
