# Changelog

## 1.0.0 — unreleased

- Automatic detection of HTML/ARIA tables (colspan/rowspan, multi-row headers) and repeating lists (cards, search results, directories) with inferred, named columns.
- Popup with page status, dataset list, preview and one-click CSV export; explicit states for unsupported pages, missing access, empty pages and errors.
- Dashboard with a virtualised preview, column visibility/renaming, cleaning (trim, empty rows, duplicates), export panel, presets, history, licence and settings; light/dark themes.
- CSV export (RFC 4180, UTF-8, optional BOM, delimiter choice, formula-injection protection).
- Pro: visual element picker, presets with import/export, XLSX export, multi-page extraction (next/numbered/manual) with limits, delay, backoff, de-duplication and cancellation, advanced cleaning and column ordering.
- Centralised entitlements; signed-token licence client with development mock provider; production licensing ships unconfigured until a server exists.
- Unit, integration and Playwright end-to-end test suites; Chrome and Firefox builds; release packaging.
