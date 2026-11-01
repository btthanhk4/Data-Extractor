# Chrome Web Store listing

Fields marked `[…]` must be completed by the publisher. Do not add claims the extension cannot back up.

## Basics

- **Name:** Smart Web Data Extractor
- **Category:** Productivity → Tools (alternatively Workflow & Planning)
- **Language:** English
- **Support contact:** [SUPPORT EMAIL OR URL]
- **Homepage:** [HOMEPAGE URL]
- **Privacy policy URL:** [PUBLIC URL OF PRIVACY.md]

## Short description (≤ 132 characters)

> Detect tables and lists on any webpage, clean the data and export to CSV — no code, no selectors, processed on your device.

## Full description

> Smart Web Data Extractor turns webpages into clean spreadsheets.
>
> Open a page, click the extension and choose **Detect data**. It finds HTML tables and repeating layouts such as product grids, search results and directories, and shows what it found with row counts and a sample. Preview everything in a fast table, hide or rename columns, trim whitespace, remove empty and duplicate rows, then export a CSV that opens correctly in Excel, Google Sheets and Numbers.
>
> **Free**
> • Automatic detection of tables and lists
> • Preview with column controls
> • Remove duplicates, empty rows and extra whitespace
> • CSV export with Excel-friendly encoding and protection against spreadsheet formula injection
>
> **Pro (one-time purchase)**
> • Point-and-click selection of lists and individual fields
> • Saved presets you can re-run on the same site, plus import/export
> • Excel (XLSX) export with typed numbers and dates
> • Multi-page extraction that follows “Next” buttons and numbered pagination, with a page limit, delay and cancel button
> • Advanced cleaning: de-duplicate by columns, URL normalisation, tracking-parameter removal, required columns, text transformations, column ordering
>
> **Private by design**
> Pages are only read when you click. Extracted data is processed in your browser and never uploaded. No analytics or tracking.
>
> **Good to know**
> Automatic detection works on most common layouts but not every website; you can adjust columns or select elements manually (Pro). The extension does not bypass logins, CAPTCHAs, paywalls or rate limits. Please respect each website's terms of use.

## Permission justifications (Privacy practices tab)

- **activeTab:** Lets the extension read the page in the current tab only after the user clicks the extension, so it can detect and extract the tables or lists the user asked for.
- **scripting:** Injects the bundled extraction script into the current tab on demand (when the user clicks Detect/Preview/Export/Select). No script is injected automatically and no remote code is used.
- **storage:** Saves the user's settings, saved presets, optional export history (metadata only) and licence token locally.
- **Optional host permissions (`http://*/*`, `https://*/*`):** Requested at runtime for a single site, only when the user starts a multi-page extraction, so the extension can continue reading that site after its pages reload. Never requested at install.
- **Remote code:** No. All code is included in the package.

### Data usage disclosures

- Collected: _Website content_ is processed locally to perform the user-requested extraction; it is not transmitted. If Pro is activated: _licence key / device identifier_ sent to the licensing server for licence verification only.
- Not sold, not used for advertising, not used for creditworthiness or lending, not transferred except as described.

## Assets checklist

- [x] Icon 128×128 (`apps/extension/public/icons/icon-128.png`)
- [ ] Small promo tile 440×280
- [ ] Marquee 1400×560 (optional)
- [ ] 3–5 screenshots, 1280×800 or 640×400, **captured from real public websites you have permission to show**, not from test fixtures. Suggested shots:
  1. Popup with detected datasets on a product listing
  2. Dashboard preview with column controls
  3. Cleaning panel removing duplicates
  4. Multi-page extraction progress (Pro)
  5. Visual element selection (Pro)
- [ ] Optional short demo video (YouTube link)

## Release notes (v1.0.0)

First public release: automatic table/list detection, preview and cleaning, CSV export; Pro features (visual selection, presets, XLSX, multi-page extraction, advanced cleaning) behind a one-time licence.
