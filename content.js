const SAVE_BUTTON_HOST_ID = "flashcards-collector-save-button";
const SAVE_MESSAGE_TYPE = "SAVE_DETECTED_FLASHCARD";
const SAVE_ICON_URL = chrome.runtime.getURL("icons/icon-16.png");

let currentFlashcard = null;
let currentSignature = "";
let currentAnchorElement = null;
let updateTimer = null;

const observer = new MutationObserver(scheduleButtonUpdate);

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true
});

scheduleButtonUpdate();
window.addEventListener("scroll", positionSaveButton, true);
window.addEventListener("resize", positionSaveButton);

function scheduleButtonUpdate() {
  window.clearTimeout(updateTimer);
  updateTimer = window.setTimeout(updateSaveButton, 120);
}

function updateSaveButton() {
  const detectedFlashcard = readFlashcardFromPage();
  const flashcard = detectedFlashcard?.flashcard;

  if (!flashcard?.translation || !flashcard?.english) {
    currentFlashcard = null;
    currentSignature = "";
    currentAnchorElement = null;
    removeSaveButton();
    return;
  }

  const signature = `${flashcard.english}\n${flashcard.translation}`;

  currentFlashcard = flashcard;
  currentAnchorElement = detectedFlashcard.anchorElement;

  if (signature === currentSignature && getSaveButtonHost()) {
    positionSaveButton();
    return;
  }

  currentSignature = signature;
  renderSaveButton();
  positionSaveButton();
}

function renderSaveButton() {
  const existingHost = getSaveButtonHost();

  if (existingHost) {
    existingHost.remove();
  }

  const host = document.createElement("div");
  host.id = SAVE_BUTTON_HOST_ID;
  host.style.position = "fixed";
  host.style.zIndex = "2147483646";

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    button {
      align-items: center;
      background: #464646;
      border: 0;
      border-radius: 9px;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.24);
      color: #ffffff;
      cursor: pointer;
      display: inline-flex;
      font: 700 14px/1 Arial, sans-serif;
      gap: 8px;
      padding: 8px 12px;
      transition: background 120ms ease, transform 120ms ease;
      white-space: nowrap;
    }

    button:hover {
      background: #000;
      border: 1px;
      border-style: solid;
      border-color: white;
    }

    button:disabled {
      background: #6b7280;
      cursor: wait;
      transform: none;
    }

    img {
      display: block;
      height: 16px;
      width: 16px;
    }
  `;

  const button = document.createElement("button");
  button.type = "button";
  button.title = "Save this flashcard";
  renderReadyButtonContent(button);
  button.addEventListener("click", saveCurrentFlashcard);

  shadow.append(style, button);
  document.documentElement.appendChild(host);
}

function positionSaveButton() {
  const host = getSaveButtonHost();

  if (!host || !currentAnchorElement) {
    return;
  }

  const rect = currentAnchorElement.getBoundingClientRect();

  if (!isVisible(currentAnchorElement)) {
    host.hidden = true;
    return;
  }

  host.hidden = false;
  const buttonWidth = host.offsetWidth || 86;
  const left = Math.max(
    8,
    Math.min(rect.right - 90, window.innerWidth - buttonWidth - 8)
  );

  host.style.left = `${left}px`;
  host.style.top = `${Math.max(rect.top + rect.height / 2 - 16, 8)}px`;
}

function renderReadyButtonContent(button) {
  const icon = document.createElement("img");
  icon.alt = "";
  icon.src = SAVE_ICON_URL;

  button.replaceChildren(icon, "Save");
}

async function saveCurrentFlashcard(event) {
  const button = event.currentTarget;

  if (!currentFlashcard) {
    removeSaveButton();
    return;
  }

  button.disabled = true;
  button.textContent = "Saving";

  try {
    const response = await chrome.runtime.sendMessage({
      type: SAVE_MESSAGE_TYPE,
      flashcardData: currentFlashcard
    });

    if (response?.status === "DUP") {
      button.textContent = "Already saved";
    } else if (response?.ok) {
      button.textContent = "Saved";
    } else {
      button.textContent = "Error";
    }
  } catch (error) {
    console.error("Couldn't save flashcard:", error);
    button.textContent = "Error";
  }

  window.setTimeout(() => {
    button.disabled = false;
    renderReadyButtonContent(button);
  }, 1200);
}

function removeSaveButton() {
  const host = getSaveButtonHost();

  if (host) {
    host.remove();
  }
}

function getSaveButtonHost() {
  return document.getElementById(SAVE_BUTTON_HOST_ID);
}

function readFlashcardFromPage() {
  const elements = [
    ...document.querySelectorAll(
      "div.sentence.answered, div.translation"
    )
  ];

  const pairs = elements
    .map((element, index) => {
      if (!element.matches("div.sentence.answered")) {
        return null;
      }

      const translationElement = elements
        .slice(index + 1)
        .find((candidate) =>
          candidate.matches("div.translation")
        );

      if (!translationElement) {
        return null;
      }

      return {
        sentenceElement: element,
        translationElement
      };
    })
    .filter(Boolean);

  const pair = [...pairs]
    .reverse()
    .find(({ sentenceElement, translationElement }) =>
      isVisible(sentenceElement) && isVisible(translationElement)
    ) ?? pairs[pairs.length - 1];

  if (!pair) {
    return null;
  }

  return {
    anchorElement: pair.translationElement,
    flashcard: {
      translation: normalizeText(pair.sentenceElement.textContent),
      english: normalizeText(pair.translationElement.textContent)
    }
  };
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();

  return rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom >= 0 &&
    rect.top <= window.innerHeight;
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
