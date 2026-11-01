# Architecture

## Goals that shaped the design

1. **Local-first.** Detection, extraction, cleaning and export run in the browser. The Free product needs no server.
2. **Minimal permissions.** `activeTab`, `scripting`, `storage` at install time; host access is requested per-origin only for multi-page runs.
3. **Testable core.** All extraction logic uses standard DOM APIs only, so it runs unchanged in jsdom (unit tests) and in the page (content script).
4. **One trust model.** Every object crossing a boundary — page ↔ extension messages, storage, imported files, licence server responses — is validated with Zod schemas from `@swde/shared`.

## Modules

| Package / folder                        | Responsibility                                                                                                                                                                     | Browser APIs     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `packages/shared`                       | Zod schemas (types are inferred from them), limits, storage keys, safe JSON, filename/url helpers                                                                                  | none             |
| `packages/extraction-core`              | Table grid builder, repeating-list detection, column inference, extraction by descriptor, value typing, cleaning, de-dup, CSV, XLSX writer, next-page detection, pagination runner | DOM only         |
| `packages/licensing`                    | Feature list and entitlements, ECDSA token format/verification, `LicenseClient`, HTTP/unconfigured providers, dev-only mock provider                                               | WebCrypto, fetch |
| `apps/extension/src/content`            | Message handler + visual picker; injected on demand                                                                                                                                | `chrome.runtime` |
| `apps/extension/src/background`         | Install defaults; receives picker results and opens the dashboard                                                                                                                  | `chrome.*`       |
| `apps/extension/src/services`           | Thin wrappers over `chrome.storage`, `chrome.tabs`, `chrome.scripting`, `chrome.permissions`, downloads, licence client factory                                                    | `chrome.*`       |
| `apps/extension/src/popup`, `dashboard` | React UI; state in Zustand stores                                                                                                                                                  | via services     |

### Detection heuristics (extraction-core)

- **Tables:** `<table>` and ARIA `table/grid/treegrid`. Layout tables (`role=presentation`, nested tables) are skipped. `colspan`/`rowspan` are expanded into a rectangular grid; multi-row headers become `Group / Sub`; `tfoot` and repeated header rows are excluded. Columns that mostly contain links/images get extra `… link`/`… image` columns.
- **Repeating lists:** a bounded `TreeWalker` scan (≤ 40,000 elements) finds parents with ≥ 3 same-tag children whose two-level tag "shape" is similar (Jaccard ≥ 0.5). Groups are scored by item count, text density, structural similarity, and link/image/price signals; navigation/header/footer regions are penalised.
- **Column inference:** sampled items are walked (bounded nodes/depth); candidate fields are elements with their own text, links and images. Paths use tag + stable classes (hashed/state classes are ignored) and `:nth-of-type` only when needed. Fields inside a repeated sub-structure (tag chips, nested lists) collapse into one joined column. Fields present in ≥ 30 % of items are kept; names come from `itemprop`/class hints, tag semantics or value types (price, date, email…).
- **De-duplication of candidates:** nested lists inside items of a better candidate, wrappers around a better candidate, and lists inside accepted tables are dropped; wrappers whose rows would contain long joined lists are penalised.
- **Descriptors:** a detected dataset is serialised as a `DatasetDescriptor` (container selector, item selector, columns, structural signature). Extraction re-resolves it by selector and falls back to structural signature matching, which is what makes presets and pagination robust to small DOM changes.

## Data flow

```
Popup ──(executeScript content.js, on click)──▶ Tab
Popup ──swde:detect──▶ content ──▶ detectDatasets(document) ──▶ DetectResponse (validated)
Popup ── Export CSV: swde:extract ─▶ rows ─▶ cleanData ─▶ toCsv ─▶ Blob download
Popup ── Preview: createSession({tabId, descriptor}) in storage.session ─▶ open dashboard.html#/preview?s=…
Dashboard ── swde:extract (same tab) ─▶ data cached in storage.session ─▶ clean ─▶ grid / export
Picker (content) ──swde:pickerResult──▶ background (sender checked) ─▶ session ─▶ dashboard
Pagination (dashboard) ─▶ runPagination(adapter) ─▶ clickNext / extract via messages, re-injecting after navigations
```

The content script is never declared in the manifest; it is injected only when the user acts. It installs one `onMessage` listener, guarded against double injection, and performs no background scanning (no MutationObservers, no timers).

## Browser messaging

- Extension → content: `chrome.tabs.sendMessage` with `ContentRequest` (`swde:ping|detect|extract|findNext|clickNext|pickerStart|pickerStop`). The content script checks `sender.id === chrome.runtime.id` and validates the request with `ContentRequestSchema`; responses are validated again on the extension side with the matching response schema before use.
- Content → background: only `swde:pickerResult` / `swde:pickerCancelled`. The background accepts them only from this extension's content scripts in a real tab, validates the payload, and trusts `sender.tab.url` over the page-reported URL.
- No `externally_connectable`, no `window.postMessage` channel: web pages cannot talk to the extension.

## Storage

| Data                                     | Area                     | Lifetime                                   |
| ---------------------------------------- | ------------------------ | ------------------------------------------ |
| Settings                                 | `chrome.storage.local`   | Until changed / "Delete all local data"    |
| Presets                                  | `chrome.storage.local`   | Until deleted                              |
| Export history (metadata only, ≤ 200)    | `chrome.storage.local`   | Until cleared; can be disabled             |
| Licence token, device id                 | `chrome.storage.local`   | Until deactivated                          |
| Preview sessions + cached extracted data | `chrome.storage.session` | In memory; cleared when the browser closes |

All reads are schema-validated; invalid entries are dropped rather than trusted.

## Licensing

- `@swde/licensing/entitlements` is the **only** place that maps a licence to features (`resolveEntitlements`, `enforceCleaningRules`, `canExport`). UI components read `useLicense().entitlements`; no component inspects licence state directly.
- A Pro licence is represented by a token `base64url(payload).base64url(ECDSA P-256 signature)` issued by the licensing server. The extension embeds only the server's **public** key and verifies the signature, device binding and expiry on every load. A stored boolean or edited token yields the Free plan.
- Tokens are short-lived relative to the licence (30 days) and refreshed every ~3 days when online, so refunds/revocations propagate; offline users keep Pro until the token expires.
- Providers: `HttpLicenseProvider` (production), `UnconfiguredLicenseProvider` (production build without a server), `MockLicenseProvider` (development/e2e only; excluded from production bundles by a compile-time constant and verified by `scripts/build.mjs`).
- Server design: [LICENSING_BACKEND.md](LICENSING_BACKEND.md).

Client-side checks can always be patched out by someone modifying their own installed copy; the design goal is that no _unmodified_ build can be unlocked without a server-signed token.

## Security boundaries

1. **Web page → content script.** Page DOM is untrusted. Only text and http(s) URLs are read (`javascript:`, `data:` etc. are dropped); script/style contents are skipped; cell sizes and row counts are capped. The picker UI lives in a closed shadow root and is built with DOM APIs (no `innerHTML`).
2. **Content script → extension pages.** Responses are schema-validated; rendered as text by React (no `dangerouslySetInnerHTML`, enforced by ESLint). Links are clickable only for http(s), with `rel="noopener noreferrer"`.
3. **Imported presets.** Size-limited, parsed with prototype-pollution stripping, validated by schema; selectors are only ever passed to `querySelector` inside `try/catch`. Nothing in a preset is executed.
4. **Exports.** CSV values that start with `= + - @ \t \r` (and full-width variants) are prefixed with `'` unless they are plain numbers; XLSX text is always written as inline strings, never formulas.
5. **Extension pages.** CSP `script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`. All code is bundled; the build fails if `eval(` or `new Function(` appears in output.
6. **Licensing server.** Only HTTPS, no cookies (`credentials: 'omit'`), no redirects, 15 s timeout, response schema validation.

## Performance

- Popup bundle is small (React + UI); detection runs only on click.
- Detection is bounded (element scan cap, max candidates inferred, sampled items, node/depth caps per item).
- The preview grid is windowed (only visible rows are in the DOM) and handles the 50,000-row cap.
- XLSX is generated with pre-sized string chunks and `fflate` (no DOM, no large intermediate objects); 20,000 rows build in well under a second in tests.
- The service worker holds no state and runs no timers.
