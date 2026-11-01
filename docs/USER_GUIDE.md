# User guide

## Detect data on a page

1. Open the page that contains the data (a table, product grid, search results, a directory…). Wait until the content you want is visible.
2. Click the **Smart Web Data Extractor** icon in the toolbar (or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd>).
3. Click **Detect data**. The popup lists every dataset it found, with its row and column counts and a sample of the first row.
4. Select the dataset you want.

If nothing is found, the page may still be loading — scroll to load more and click **Scan again**. Some layouts are not recognised automatically; Pro users can select them with **Select elements on page**.

## Preview and edit the data

Click **Preview data** to open the dashboard. Here you can:

- Scroll through all rows (large datasets stay fast).
- **Columns** tab: show/hide columns with the eye icon and rename them. Pro: reorder columns.
- **Cleaning** tab: trim whitespace, remove empty rows, remove duplicate rows. Pro: compare duplicates by chosen columns, normalise URLs, strip tracking parameters, require values in certain columns, and apply text transformations (UPPERCASE, Title Case, numbers only…).
- **Re-extract** reads the page again if it changed.

## Export CSV

- From the popup: **Export CSV** downloads the selected dataset immediately with your default cleaning settings.
- From the dashboard: choose a file name, delimiter (comma, semicolon for European Excel, or tab), and whether to add the Excel-friendly UTF-8 marker, then click **Export**.

Values that a spreadsheet would treat as a formula (for example text starting with `=`) are prefixed with an apostrophe so they open as plain text. You can turn this off in **Settings**, but it is recommended to keep it on.

## Pro features

Activate a licence in **Dashboard → License** by pasting your key.

- **Select elements on page:** click the option in the popup, hover the page until the list you want is outlined, then click one item. Use **Wider/Narrower** (or ↑/↓) to change how much is selected. Optionally click values inside an item to choose exactly which columns to extract, then press **Done** (or Enter). **Exit** or Esc leaves selection mode.
- **Excel export:** choose **Excel** in the export panel. The workbook has a data sheet (numbers and dates typed) and a _Source_ sheet describing where the data came from.
- **Multiple pages:** in the **Pages** tab click **Find “Next” button**, set a page limit and delay, and click **Start**. Progress is shown and you can **Cancel** at any time. Keep the source tab open while it runs. If the site's pages fully reload, the browser asks you to allow access to that site once. Alternatively, navigate yourself and use **Capture current page** to append each page. Duplicate rows across pages are skipped automatically.
- **Presets:** after setting up columns and cleaning, save a preset. Next time, open the extension on any page of the same site and pick the preset under **Presets for this site**. Presets can be exported to and imported from a JSON file in **Dashboard → Presets**.

## Troubleshooting

| Problem                            | What to do                                                                                                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "This page can't be read"          | Browser pages (settings, new tab, extension stores, PDF viewer) cannot be read by any extension.                                                                                          |
| "Access needed"                    | Click the extension icon on the page again (this grants access for that tab). For local files, enable _Allow access to file URLs_ for the extension in `chrome://extensions`.             |
| Some rows are missing              | Lazy-loading pages only render what you have scrolled to. Scroll to the end, then detect again — or use multi-page extraction.                                                            |
| Wrong columns                      | Hide/rename columns in the dashboard, or use the visual picker to choose fields explicitly.                                                                                               |
| "This preview has expired"         | Previews are kept in memory only and are cleared when the browser closes. Detect again.                                                                                                   |
| Pagination stops early             | The run stops when there is no enabled "Next" control, when a page only repeats earlier rows, at the page limit, or if a page does not load within 20 s. The result panel explains which. |
| Excel shows garbled accents in CSV | Enable _Excel-friendly encoding_ (UTF-8 BOM), or use the Excel export.                                                                                                                    |

The extension does not bypass logins, CAPTCHAs, paywalls or rate limits, and only reads pages you open yourself. Make sure your use of extracted data complies with the website's terms and applicable law.
