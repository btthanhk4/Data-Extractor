# Smart Web Data Extractor

A Manifest V3 browser extension that finds tables and repeating lists on a webpage, lets you preview and clean the data, and exports it to CSV — without writing selectors or code. All processing happens locally in the browser.

- **Free:** automatic detection of tables and lists, single-page extraction, preview, rename/hide columns, trim/empty-row/duplicate cleaning, CSV export.
- **Pro (one-time licence):** visual element picker, saved presets with import/export, Excel (XLSX) export, multi-page extraction, advanced cleaning and column ordering.

> Status: the codebase, tests and store materials are complete. Payments are **not** live: production builds ship with licensing in an "unconfigured" state until a licensing server and payment provider are set up (see [docs/LICENSING_BACKEND.md](docs/LICENSING_BACKEND.md)). Free features work fully without any backend.

## Repository layout

```
apps/extension/            Chrome/Edge/Firefox extension (React + Vite + Tailwind)
  src/popup/               Toolbar popup
  src/dashboard/           Full-page dashboard (preview, presets, history, licence, settings)
  src/background/          Service worker (tiny: install defaults + picker hand-off)
  src/content/             On-demand content script (detection, extraction, picker)
  src/services/            chrome.* wrappers: storage, tabs/messaging, export, licensing
  scripts/build.mjs        Builds pages + IIFE content script and writes the manifest
packages/extraction-core/  Browser-agnostic DOM heuristics, cleaning, CSV/XLSX, pagination
packages/shared/           Zod schemas (single source of types), constants, utilities
packages/licensing/        Entitlements, signed-token verification, licence client, providers
tests/                     unit/ integration/ e2e/ and HTML fixtures
docs/                      Architecture, user guide, licensing backend, store listing
```

## Requirements

- Node.js ≥ 20.10
- pnpm 9 (`npm i -g pnpm@9` or `corepack enable`)
- For E2E tests: Playwright's Chromium (`pnpm exec playwright install chromium`)

## Development

```bash
pnpm install
pnpm dev            # development build -> apps/extension/dist/chrome-development (mock licensing)
pnpm build          # production build  -> apps/extension/dist/chrome
pnpm build:firefox  # production build  -> apps/extension/dist/firefox
pnpm typecheck
pnpm lint
pnpm test           # unit + integration (Vitest, jsdom)
pnpm test:e2e       # builds the e2e variant and runs Playwright with the real extension
pnpm check          # typecheck + lint + test + build
pnpm package        # production build + release/smart-web-data-extractor-<version>-chrome.zip
```

`pnpm icons` regenerates the PNG icons from the vector logo definition.

### Load the unpacked extension in Chrome

1. Run `pnpm build` (or `pnpm dev`).
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select `apps/extension/dist/chrome` (or `dist/chrome-development`).
4. Pin the extension, open any webpage and click the icon (or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd>).

Edge: same steps at `edge://extensions`. Firefox: `about:debugging` → _This Firefox_ → _Load Temporary Add-on_ → select `apps/extension/dist/firefox/manifest.json`. The Firefox build is produced and packaged but has not been verified by automated tests.

### Build modes

| Mode          | Command          | Licensing                                  | Notes                                               |
| ------------- | ---------------- | ------------------------------------------ | --------------------------------------------------- |
| `development` | `pnpm dev`       | Local mock provider (test keys below)      | Source maps, "(Dev)" suffix                         |
| `e2e`         | `pnpm build:e2e` | Local mock provider                        | Pre-granted `127.0.0.1` only; `?tabId=` test hook   |
| `production`  | `pnpm build`     | HTTP provider if configured, else disabled | Build fails if mock code or `eval` is in the output |

Production licensing is configured with environment variables at build time:

```bash
SWDE_LICENSE_API_URL=https://licensing.example.com      # your licensing server (HTTPS)
SWDE_LICENSE_PUBLIC_KEY_JWK='{"kty":"EC","crv":"P-256","x":"…","y":"…"}'  # public key only
SWDE_PURCHASE_URL=https://…                              # checkout page (optional)
SWDE_SUPPORT_URL=mailto:…                                # support link (optional)
```

Development test keys: `SWDE-DEV-PRO` (valid), `SWDE-DEV-REVOKED`, `SWDE-DEV-LIMIT`, `SWDE-DEV-EXPIRED`.

## Testing

- **Unit** (`tests/unit`): table/list detection on fixtures, column inference, number/date parsing, CSV escaping and formula-injection protection, XLSX structure, cleaning, de-duplication, pagination runner (limits, backoff, cancellation, timeouts), next-button detection, schemas and prototype-pollution defence, entitlements, licence token verification and the licence client.
- **Integration** (`tests/integration`): storage services against an in-memory `chrome.*`, content-script messaging and sender validation, background message validation, on-demand injection and error mapping, permission requests, detect→clean→export pipeline.
- **End-to-end** (`tests/e2e`): real Chromium with the extension loaded; covers detection, CSV/XLSX downloads, dashboard editing, dynamic content, 2,500-row virtualised preview, empty/unsupported states, hostile markup, Free/Pro gating, mock licence activation, link and client-side pagination with cancellation, the visual picker, and presets surviving a browser restart.

## Release process

1. Bump `version` in the root `package.json` (the manifest version is taken from it) and update [CHANGELOG.md](CHANGELOG.md).
2. `pnpm check && pnpm test:e2e`.
3. `pnpm package` → upload `release/*.zip` in the Chrome Web Store developer dashboard.
4. Work through [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) and [docs/STORE_LISTING.md](docs/STORE_LISTING.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [User guide](docs/USER_GUIDE.md)
- [Licensing backend design](docs/LICENSING_BACKEND.md)
- [Store listing & permission justifications](docs/STORE_LISTING.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
- [Privacy policy](PRIVACY.md) · [Security](SECURITY.md) · [Licence](LICENSE.md)
