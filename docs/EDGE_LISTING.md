# Microsoft Edge Add-ons listing

Edge extensions are published through **Partner Center** → Microsoft Edge program (registration is free):
https://partner.microsoft.com/dashboard/microsoftedge/overview

Fields marked `[…]` must be completed by the publisher.

## Package

```bash
pnpm package:edge   # -> release/smart-web-data-extractor-<version>-edge.zip
```

The Edge package is the same Manifest V3 Chromium build as Chrome (identical manifest). It has been verified with the full Playwright end-to-end suite in Microsoft Edge 156:

```bash
pnpm --filter @swde/extension build:e2e:edge
SWDE_E2E_BROWSER=msedge pnpm exec playwright test
```

## Submission fields

| Partner Center section                     | Value                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Packages**                               | Upload `release/smart-web-data-extractor-<version>-edge.zip`                                                                                      |
| **Availability → Visibility**              | Public                                                                                                                                            |
| **Availability → Markets**                 | All markets                                                                                                                                       |
| **Properties → Category**                  | Productivity                                                                                                                                      |
| **Properties → Privacy policy**            | Required: yes (the extension processes webpage content). URL: [PUBLIC URL OF PRIVACY.md]                                                          |
| **Properties → Website**                   | [HOMEPAGE URL]                                                                                                                                    |
| **Properties → Support contact**           | [SUPPORT EMAIL OR URL]                                                                                                                            |
| **Properties → Mature content**            | No                                                                                                                                                |
| **Store listing → Language**               | English (United States)                                                                                                                           |
| **Store listing → Description**            | Use the full description in [STORE_LISTING.md](STORE_LISTING.md). For a Free-only first release, remove the Pro section or mark it "coming soon". |
| **Store listing → Short description**      | Same short description as Chrome                                                                                                                  |
| **Store listing → Extension store logo**   | `store-assets/logo-300.png` (300×300)                                                                                                             |
| **Store listing → Small promotional tile** | Optional, 440×280                                                                                                                                 |
| **Store listing → Screenshots**            | 1280×800 or 640×480, captured from real public websites (not the test fixtures)                                                                   |
| **Store listing → Search terms**           | `data extractor`, `web scraper`, `table to csv`, `export table`, `scrape list`, `csv export`, `excel export`                                      |

## Notes for certification (paste into "Notes for certification")

> No account or sign-in is required to test.
>
> 1. Open any page with an HTML table (for example a Wikipedia article with a table).
> 2. Click the extension icon, then **Detect data**.
> 3. Select a dataset and click **Export CSV** (downloads a file) or **Preview data** (opens the dashboard).
>
> Pro features are not available for purchase in this version; the License page states this.
>
> The extension uses activeTab + scripting to read the current page only after the user clicks, and storage for local settings. Optional host permissions are requested per site only when the user starts a multi-page extraction. No remote code; no data is sent to any server.

## After publishing

- Record the Edge extension id (different from the Chrome id) and add it to the licensing server's CORS allow-list when licensing goes live.
- Updates: bump the version in the root `package.json`, run `pnpm package:edge`, and upload the new zip under **Packages**.
