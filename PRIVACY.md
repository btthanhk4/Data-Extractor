# Privacy policy — Smart Web Data Extractor

_Last updated: [DATE OF PUBLICATION]_

This policy describes what the Smart Web Data Extractor browser extension ("the extension") does with data. It reflects the behaviour of the extension's source code. [PUBLISHER NAME] is responsible for the extension; contact: [SUPPORT CONTACT].

## Summary

- The extension reads a webpage **only when you ask it to** (Detect, Preview, Export, Select elements, or a multi-page run you start).
- Extracted data is processed **on your device** and is **never uploaded** by the extension.
- There are **no analytics, tracking, advertising or third-party scripts**.
- The only network requests the extension makes are to the licensing server, and only if you activate a Pro licence.

## Data processed

| Data                                                              | When                                                                        | Where it goes                            |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------- |
| Content of the current webpage (text, link and image URLs)        | When you click Detect, Preview, Export or use the picker / a multi-page run | Processed in your browser only           |
| Page URL and title                                                | Same as above                                                               | Shown in the UI; used for file names     |
| Licence key, a random per-install device ID and the licence token | Only when you activate or use Pro                                           | Sent to the licensing server (see below) |

## Data stored locally

Stored in your browser's extension storage (`chrome.storage`), never synced to a server by the extension:

- **Settings** (theme, export defaults).
- **Presets** you save: site origin (e.g. `https://example.com`), selectors, column names, cleaning and pagination settings. Presets do not contain extracted data.
- **Export history** (can be turned off): time, site origin, page path, page title, dataset name, row/column counts, pages, format. Query strings and extracted values are **not** stored.
- **Licence token and device ID** (Pro only).
- **Preview data**: extracted rows are kept in session memory (`chrome.storage.session`) while you work in the dashboard and are deleted automatically when the browser closes.

## Data transmitted externally

- **Webpage data:** never transmitted by the extension.
- **Licensing (Pro only):** when you activate, refresh or deactivate a licence, the extension sends your licence key (activation only), the device ID, the extension version and the current licence token to the licensing server over HTTPS. The server returns a signed token. No browsing data is sent.
- **Payments** are handled by the payment provider on its own website; the extension never sees payment details.

## Retention and deletion

- Preview data: deleted when the browser closes.
- History: up to the latest 200 entries; clear it any time in **Dashboard → History**, or disable it.
- Everything: **Dashboard → Settings → Delete all local data** removes presets, history and settings. Uninstalling the extension removes all of its storage.
- Licensing server records: [RETENTION PERIOD AND POLICY OF THE LICENSING SERVER — to be completed before enabling payments].

## Your controls

- Choose when pages are read (nothing runs automatically).
- Turn history off; clear history; delete all local data.
- Deactivate a licence on a device in **Dashboard → License**.
- Site access for multi-page runs is requested per site and can be revoked in the browser's extension settings.

## Permissions

- `activeTab` — read the current tab only after you click the extension.
- `scripting` — inject the extraction script into that tab when you ask.
- `storage` — save settings, presets, history and licence locally.
- Optional host access (requested per site, only for multi-page extraction) — keep reading a site after its pages reload.

## Children

The extension is not directed at children and does not knowingly collect personal data from anyone.

## Changes

Changes to this policy will be published with a new "Last updated" date. [PUBLICATION URL]
