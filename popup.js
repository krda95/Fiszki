const counterElement = document.querySelector("#counter");
const copyButton = document.querySelector("#copy-button");
const translateButton = document.querySelector("#translate-button");
const clearButton = document.querySelector("#clear-button");
const messageElement = document.querySelector("#message");
const latestFlashcardElement = document.querySelector("#latest-flashcard");
const latestEnglishElement = document.querySelector("#latest-english");
const latestTranslationElement = document.querySelector("#latest-translation");
const latestPolishRowElement = document.querySelector("#latest-polish-row");
const latestPolishElement = document.querySelector("#latest-polish");

document.addEventListener("DOMContentLoaded", loadPopupState);
copyButton.addEventListener("click", copyFlashcardsToClipboard);
translateButton.addEventListener("click", translateFlashcardsToPolish);
clearButton.addEventListener("click", clearFlashcards);

async function loadPopupState() {
  try {
    const { flashcards = [] } = await chrome.storage.local.get("flashcards");

    renderFlashcardsState(flashcards);
  } catch (error) {
    console.error("Couldn't load flashcards:", error);

    counterElement.textContent = "Couldn't load flashcards.";
    copyButton.disabled = true;
    translateButton.disabled = true;
    clearButton.disabled = true;
    hideLatestFlashcard();
  }
}

async function copyFlashcardsToClipboard() {
  try {
    clearMessage();

    const { flashcards = [] } = await chrome.storage.local.get("flashcards");

    if (flashcards.length === 0) {
      showMessage("You don't have any flashcards yet.");
      return;
    }

    const text = flashcards
      .map((flashcard) => {
        const front = getExportFront(flashcard);
        const translation = normalizeText(flashcard.translation);

        return `${front};${translation}`;
      })
      .join("\n");

    await navigator.clipboard.writeText(text);

    showMessage(`Copied ${flashcards.length} flashcards.`);
  } catch (error) {
    console.error("Couldn't copy flashcards:", error);
    showMessage("Couldn't copy flashcards.");
  }
}

async function translateFlashcardsToPolish() {
  try {
    clearMessage();
    setTranslationInProgress(true);

    const apiKey = getGoogleTranslateApiKey();

    if (!apiKey) {
      showMessage("Set Google Translate API key in config.js first.");
      return;
    }

    const { flashcards = [] } = await chrome.storage.local.get("flashcards");
    const flashcardsToTranslate = flashcards.filter(needsPolishTranslation);

    if (flashcardsToTranslate.length === 0) {
      showMessage("All English texts already have Polish translations.");
      return;
    }

    const translatedTexts = await translateTextsToPolish(
      flashcardsToTranslate.map((flashcard) => flashcard.english),
      apiKey
    );

    const translationsById = new Map(
      flashcardsToTranslate.map((flashcard, index) => [
        flashcard.id,
        normalizeText(translatedTexts[index])
      ])
    );

    const translatedFlashcards = flashcards.map((flashcard) => {
      const polishEnglish = translationsById.get(flashcard.id);

      if (!polishEnglish) {
        return flashcard;
      }

      return {
        ...flashcard,
        polishEnglish,
        translatedAt: new Date().toISOString()
      };
    });

    await chrome.storage.local.set({
      flashcards: translatedFlashcards
    });

    renderFlashcardsState(translatedFlashcards);
    showMessage(`Translated ${translatedTexts.length} flashcards.`);
  } catch (error) {
    console.error("Couldn't translate flashcards:", error);
    showMessage("Couldn't translate flashcards.");
  } finally {
    setTranslationInProgress(false);
    await refreshFlashcardsState();
  }
}

async function clearFlashcards() {
    try {
        await chrome.storage.local.remove("flashcards");

        renderFlashcardsState([]);

        showMessage("All flashcards removed.");

    } catch (error) {
        console.error(error);

        showMessage("Failed to remove flashcards.");
    }
}

async function refreshFlashcardsState() {
  const { flashcards = [] } = await chrome.storage.local.get("flashcards");

  renderFlashcardsState(flashcards);
}

function renderFlashcardsState(flashcards) {
  const count = flashcards.length;

  counterElement.textContent = formatCounter(count);
  copyButton.disabled = count === 0;
  translateButton.disabled = count === 0;
  clearButton.disabled = count === 0;

  if (count === 0) {
    hideLatestFlashcard();
    return;
  }

  showLatestFlashcard(flashcards[count - 1]);
}

function showLatestFlashcard(flashcard) {
  latestEnglishElement.textContent = normalizeText(flashcard.english);
  latestTranslationElement.textContent = normalizeText(flashcard.translation);

  const polishEnglish = normalizeText(flashcard.polishEnglish);
  latestPolishElement.textContent = polishEnglish;
  latestPolishRowElement.hidden = !polishEnglish;

  latestFlashcardElement.hidden = false;
}

function hideLatestFlashcard() {
  latestEnglishElement.textContent = "";
  latestTranslationElement.textContent = "";
  latestPolishElement.textContent = "";
  latestPolishRowElement.hidden = true;
  latestFlashcardElement.hidden = true;
}

function needsPolishTranslation(flashcard) {
  return normalizeText(flashcard.english) &&
    !normalizeText(flashcard.polishEnglish);
}

async function translateTextsToPolish(texts, apiKey) {
  const translatedTexts = [];

  for (let index = 0; index < texts.length; index += 128) {
    const chunk = texts.slice(index, index + 128);
    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${
        encodeURIComponent(apiKey)
      }`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify({
          q: chunk,
          source: "en",
          target: "pl",
          format: "text"
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Google Translate failed: ${response.status}`);
    }

    const body = await response.json();
    const translations = body?.data?.translations ?? [];

    translatedTexts.push(
      ...translations.map((translation) =>
        decodeHtmlEntities(translation.translatedText)
      )
    );
  }

  return translatedTexts;
}

function getExportFront(flashcard) {
  return normalizeText(flashcard.polishEnglish) ||
    normalizeText(flashcard.english);
}

function setTranslationInProgress(isInProgress) {
  translateButton.disabled = isInProgress;
  copyButton.disabled = isInProgress;
  clearButton.disabled = isInProgress;
  translateButton.textContent = isInProgress
    ? "Translating..."
    : "Translate English to Polish";
}

function decodeHtmlEntities(value) {
  const parser = new DOMParser();
  const document = parser.parseFromString(value, "text/html");

  return document.documentElement.textContent ?? "";
}

function normalizeApiKey(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getGoogleTranslateApiKey() {
  return normalizeApiKey(
    window.FLASHCARDS_CONFIG?.googleTranslateApiKey
  );
}

function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim();
}

function formatCounter(count) {
    return `Flashcards: ${count}`;
}

function showMessage(text) {
  messageElement.textContent = text;
}

function clearMessage() {
  messageElement.textContent = "";
}
