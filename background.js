const MENU_IDS = {
  SAVE_FROM_PAGE: "save-flashcard-from-page",
  CLEAR_DRAFT: "clear-current-flashcard"
};

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();

    chrome.contextMenus.create({
        id: MENU_IDS.SAVE_FROM_PAGE,
        title: "Add current sentence as flashcard",
        contexts: ["page", "selection"]
    });

    chrome.contextMenus.create({
        id: MENU_IDS.CLEAR_DRAFT,
        title: "Clear current flashcard",
        contexts: ["page", "selection"]
    });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    switch (info.menuItemId) {
        case MENU_IDS.SAVE_FROM_PAGE:
            await saveFlashcardFromPage(tab);
        break;

      case MENU_IDS.CLEAR_DRAFT:
        await clearDraft();
        await showBadge(tab?.id, "×");
        break;

      default:
        break;
    }
  } catch (error) {
    console.error("Error:", error);
    await showBadge(tab?.id, "!");
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "SAVE_DETECTED_FLASHCARD") {
    return false;
  }

  saveDetectedFlashcard(message.flashcardData, sender.tab)
    .then((status) => {
      sendResponse({ ok: true, status });
    })
    .catch(async (error) => {
      console.error("Error:", error);
      await showBadge(sender.tab?.id, "!");
      sendResponse({ ok: false, status: "!" });
    });

  return true;
});

async function clearDraft() {
  await chrome.storage.local.remove("currentFlashcard");
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

function normalizeForComparison(value) {
  return normalizeText(value)
    .toLocaleLowerCase()
    .normalize("NFKC");
}

async function showBadge(tabId, text) {
  if (typeof tabId !== "number") {
    return;
  }

  const message = getFeedbackMessage(text);

  await Promise.all([
    showToolbarBadge(tabId, text),
    showPageToast(tabId, message, text)
  ]);
}

async function showToolbarBadge(tabId, text) {
  try {
    await chrome.action.setBadgeText({
      tabId,
      text
    });
  } catch (error) {
    console.error("Couldn't show toolbar badge:", error);
  }

  setTimeout(() => {
    chrome.action
      .setBadgeText({
        tabId,
        text: ""
      })
      .catch(console.error);
  }, 1500);
}

async function showPageToast(tabId, message, status) {
  try {
    await chrome.scripting.executeScript({
      target: {
        tabId
      },
      func: createToast,
      args: [message, status]
    });
  } catch (error) {
    // Some browser pages block script injection. The toolbar badge is still shown.
    console.error("Couldn't show page toast:", error);
  }
}

function getFeedbackMessage(text) {
  const messages = {
    "DUP": "This flashcard already exists.",
    "✓": "Flashcard saved.",
    "×": "Draft flashcard cleared.",
    "!": "Failed to process flashcard."
  };

  return messages[text] ?? text;
}

function createToast(message, status) {
  const backgrounds = {
    "!": "#dc2626",
    "DUP": "#facc15",
    "✓": "#16a34a",
    "×": "#16a34a"
  };
  const background = backgrounds[status] ?? "#16a34a";
  const color = status === "DUP" ? "#1f2937" : "#ffffff";
  const existingToast = document.querySelector(
    "[data-flashcards-collector-toast]"
  );

  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement("div");
  toast.dataset.flashcardsCollectorToast = "true";
  toast.textContent = message;
  toast.style.position = "fixed";
  toast.style.top = "18px";
  toast.style.right = "18px";
  toast.style.zIndex = "2147483647";
  toast.style.maxWidth = "320px";
  toast.style.padding = "12px 14px";
  toast.style.borderRadius = "8px";
  toast.style.background = background;
  toast.style.color = color;
  toast.style.font = "14px/1.4 Arial, sans-serif";
  toast.style.boxShadow = "0 10px 24px rgba(0, 0, 0, 0.24)";
  toast.style.opacity = "0";
  toast.style.transform = "translateY(-8px)";
  toast.style.transition = "opacity 160ms ease, transform 160ms ease";

  document.documentElement.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-8px)";

    setTimeout(() => {
      toast.remove();
    }, 180);
  }, 2400);
}

async function saveFlashcardFromPage(tab) {
  if (!tab?.id) {
    throw new Error("No active tab found.");
  }

  const results = await chrome.scripting.executeScript({
    target: {
      tabId: tab.id
    },
    func: readFlashcardFromPage
  });

  const flashcardData = results[0]?.result;

  if (!flashcardData?.translation) {
    console.warn('No "div.sentence.answered" element found.');
    await showBadge(tab.id, "!");
    return;
  }

  if (!flashcardData?.english) {
    console.warn(
      'No "div.translation" element found after the sentence.'
    );
    await showBadge(tab.id, "!");
    return;
  }

  await saveFlashcardData(flashcardData, tab);
}

async function saveDetectedFlashcard(flashcardData, tab) {
  if (!tab?.id) {
    throw new Error("No active tab found.");
  }

  if (!flashcardData?.translation || !flashcardData?.english) {
    await showBadge(tab.id, "!");
    return "!";
  }

  return saveFlashcardData(flashcardData, tab);
}

async function saveFlashcardData(flashcardData, tab) {
  const { flashcards = [] } =
    await chrome.storage.local.get("flashcards");

  const flashcard = {
    id: crypto.randomUUID(),
    english: normalizeText(flashcardData.english),
    translation: normalizeText(flashcardData.translation),
    sourceUrl: tab.url ?? "",
    sourceTitle: tab.title ?? "",
    createdAt: new Date().toISOString()
  };

  const duplicateExists = flashcards.some(
    (item) =>
      normalizeForComparison(item.english) ===
        normalizeForComparison(flashcard.english) &&
      normalizeForComparison(item.translation) ===
        normalizeForComparison(flashcard.translation)
  );

  if (duplicateExists) {
    console.warn("This flashcard already exists:", flashcard);
    await showBadge(tab.id, "DUP");
    return "DUP";
  }

  flashcards.push(flashcard);

  await chrome.storage.local.set({
    flashcards
  });

  console.log("Flashcard saved:", flashcard);

  await showBadge(tab.id, "✓");
  return "✓";
}

function readFlashcardFromPage() {
  function isVisible(element) {
    const rect = element.getBoundingClientRect();

    return rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom >= 0 &&
      rect.top <= window.innerHeight;
  }

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
    translation: pair.sentenceElement.textContent?.trim() ?? "",
    english: pair.translationElement.textContent?.trim() ?? ""
  };
}
