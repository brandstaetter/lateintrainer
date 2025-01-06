// Globale Variablen für die Vokabeln und den aktuellen Index
let vocabList = [];
let currentIndex = 0;

// Referenzen auf die HTML-Elemente
const cardFront = document.getElementById("card-front");
const cardBack = document.getElementById("card-back");
const flashcard = document.getElementById("flashcard");
const prevBtn = document.getElementById("prev-btn");
const flipBtn = document.getElementById("flip-btn");
const nextBtn = document.getElementById("next-btn");

// Beim Laden der Seite wird die CSV-Datei eingelesen und verarbeitet
fetch("vokabeln.csv")
  .then((response) => response.text())
  .then((csvText) => {
    // CSV parsen, dabei Leerzeilen und Zeilen, die mit ### beginnen, ignorieren
    vocabList = parseCSV(csvText);

    // Vokabelliste zufällig mischen
    shuffleArray(vocabList);

    // Erste Karte anzeigen
    showCard(currentIndex);
  })
  .catch((error) => {
    console.error("Fehler beim Laden der CSV-Datei:", error);
  });

/**
 * CSV-Parser-Funktion
 * - Splittet den Text in Zeilen
 * - Entfernt Leerzeichen am Anfang/Ende (trim)
 * - Filtert leere Zeilen und Zeilen, die mit ### beginnen
 * - Splittet jede Zeile am Semikolon
 * - Gibt ein Array von Objekten zurück ({ latin, german })
 */
function parseCSV(csvString) {
  const lines = csvString
    .split("\n")
    .map((line) => line.trim())
    // Nur Zeilen behalten, die nicht leer sind und nicht mit '###' beginnen
    .filter((line) => line.length > 0 && !line.startsWith("###"));

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

/**
 * Fisher–Yates-/Durstenfeld-Shuffle, um ein Array in-place zu mischen
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // Elemente tauschen
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * Zeigt die Vokabelkarte an, die durch 'index' bestimmt wird.
 * - Wenn index < 0, springe ans Ende der Liste.
 * - Wenn index >= vocabList.length, springe an den Anfang der Liste.
 */
function showCard(index) {
  if (index < 0) {
    currentIndex = vocabList.length - 1;
  } else if (index >= vocabList.length) {
    currentIndex = 0;
  } else {
    currentIndex = index;
  }

  const vocab = vocabList[currentIndex];
  cardFront.textContent = vocab.latin;
  cardBack.textContent = vocab.german;

  // Falls die Karte gerade umgedreht ist, wieder zurückdrehen
  flashcard.classList.remove("flipped");
}

// Buttons zum Navigieren und Umdrehen
prevBtn.addEventListener("click", () => {
  showCard(currentIndex - 1);
});

nextBtn.addEventListener("click", () => {
  showCard(currentIndex + 1);
});

flipBtn.addEventListener("click", () => {
  flashcard.classList.toggle("flipped");
});
