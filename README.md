# Flashcards Collector

A Chrome extension that collects flashcards from language-learning pages
(a foreign-language sentence plus its English translation), translates the
English side into Polish, and copies everything to the clipboard in a CSV format
ready for import (e.g. into Anki).

## Features

- A **Save** button appears next to the detected sentence on the page.
- Context menu (right-click): *Add current sentence as flashcard* and
  *Clear current flashcard*.
- Popup with a counter and a preview of the latest flashcard (EN / PL / Foreign).
- Optional English-to-Polish translation via the Google Translate API.
- Copy to clipboard in `front;back` format, one flashcard per line.
  After copying, the flashcard list is cleared automatically.
- Duplicate detection.
- Dark popup interface.
- Works with any foreign language (Spanish, Russian, German, etc.).

## Installation (developer mode)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top-right corner).
3. Click **Load unpacked** and select the project folder (the one containing `manifest.json`).
4. After any code change, click the refresh icon ⟳ on the extension's card.

## Translation setup (optional)

Create a `config.js` file in the project root:

```js
window.FLASHCARDS_CONFIG = {
  googleTranslateApiKey: "YOUR_API_KEY"
};
```

Without a key everything works except the *Translate English to Polish*
button, which will show a "missing API key" message.

## Usage

1. Open a lesson page and answer a sentence.
2. Click **Save** next to the translation (or use the context menu).
3. Open the extension popup.
4. Optionally click **Translate English to Polish**.
5. Click **Copy to Clipboard** and paste into Anki or another app.
   The flashcards are then removed from the extension (this cannot be undone).

## Export format

```
polish_or_english_front;foreign_text
```

The front is the Polish translation if available, otherwise the original
English text.

## Project structure

| File            | Purpose                                            |
|-----------------|----------------------------------------------------|
| `manifest.json` | Extension configuration (Manifest V3)              |
| `background.js` | Context menu, saving flashcards, toasts and badge  |
| `content.js`    | Sentence detection on the page and the Save button |
| `popup.html/js` | Popup UI, translation, copying                     |
| `config.js`     | API key (local only, not in the repository)        |
| `icons/`        | Extension icons                                    |

## Permissions

`storage`, `contextMenus`, `clipboardWrite`, `activeTab`, `scripting`,
plus access to all sites (`<all_urls>`) to detect sentences on pages.
