# DOM Change Recorder

A Chrome extension (Manifest V3) for web developers who prototype changes
directly on a live page. It records every HTML/CSS change you make — including
edits in the **DevTools Elements panel** — notes **where** each change happened
(a stable snapshot line number plus a unique CSS selector), and lets you export
the result as a change log, a text file, or a **unified diff** you can apply back
to your real source later.

## Why

Tweaking a page in the browser is fast, but those edits vanish on reload and
there's no easy way to carry them into your actual files. This extension keeps a
running log of what you changed and where, so you can reproduce it in source.

## Features

- **Auto-capture** of live DOM changes via a `MutationObserver` (structure,
  text, attributes, and inline `style`/CSS).
- **Location for every change**: a CSS selector path and a line number within a
  deterministic, pretty-printed snapshot of the page.
- **Exports**: copy the change log to the clipboard, download it as `.txt`,
  download a unified `.patch` diff, or download the full formatted HTML snapshot.

## Install (load unpacked)

1. Go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this repository's root folder.
4. Pin the extension if you like.

## Usage

1. Open the page you want to work on (use `test/sample.html` to try it out).
   > Note: the recorder can't run on `chrome://` pages, the Web Store, or pages
   > that were already open before install — just reload normal pages.
2. Click the extension icon → **Start capture**. This takes a baseline snapshot.
3. Edit the page: change text/attributes/styles in the **DevTools Elements
   panel**, use `contenteditable`, or run scripts. Each change is recorded.
4. Reopen the popup to review the list (newest first). Each entry shows the
   change type, the snapshot line, the CSS selector, and the old → new values.
5. Export with **Copy log**, **Download .txt**, **Download diff**, or
   **Download snapshot**.

Reloading the page ends the current session (state lives in the page). Use
**Clear** to reset the log and re-baseline without reloading.

## How line numbers work

The browser discards original source line numbers when it parses HTML into the
DOM, so a change can't reliably point at a line in your served `.html` file.
Instead, the extension serializes the page into its own clean, pretty-printed
snapshot with stable line numbers and reports each change against that snapshot.
You can download the snapshot itself (**Download snapshot**) so the line numbers
are meaningful and self-contained, and the **diff** export is computed against
the baseline snapshot taken at capture-start.

## Project layout

```
manifest.json          MV3 config, permissions, content scripts, popup
src/selector.js        Unique CSS selector path for a node
src/serializer.js      Deterministic DOM pretty-printer + node→line map
src/diff.js            LCS-based unified diff between two snapshots
src/content.js         MutationObserver, baseline capture, change log, messaging
src/popup.{html,css,js} Popup UI + exports (clipboard, downloads)
scripts/gen-icons.js   Regenerates icons/ (no dependencies)
test/sample.html       Page to exercise the extension manually
test/unit.js           Browser-free tests for diff.js — `node test/unit.js`
```

## Development

- Run the diff unit tests: `node test/unit.js`
- Regenerate icons: `node scripts/gen-icons.js`
- No build step or dependencies — edit and reload the extension.
