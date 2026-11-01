# Security

## Threat model

| Threat                                                         | Mitigation                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malicious webpage content (script injection into extension UI) | Only text and http(s) URLs are extracted; React renders text only; `dangerouslySetInnerHTML`/`innerHTML` are banned by lint; strict extension CSP (`script-src 'self'`).                                                           |
| Webpage impersonating the extension / sending commands         | No `externally_connectable` or `postMessage` channels. Content and background listeners verify `sender.id` and validate every message with Zod schemas. Background uses the browser's tab URL, not page-reported values.           |
| Webpage tampering with the content script                      | Content scripts run in an isolated world; the picker UI uses a closed shadow root; injected-once flag lives in the isolated world.                                                                                                 |
| Spreadsheet formula injection via exported data                | CSV formula-trigger prefixing (OWASP guidance, incl. full-width variants); XLSX text always written as inline strings.                                                                                                             |
| Malicious preset files                                         | Size limit, prototype-pollution-safe parsing, strict schema (selectors/paths only, length-limited, no markup), nothing executed, fresh ids on import.                                                                              |
| Resource exhaustion on huge/hostile pages                      | Element scan cap, sampling, per-item node/depth caps, 10,000-char cells, 50,000-row cap, windowed preview, bounded pagination (≤ 100 pages, ≥ 1 s delay, 20 s page timeout).                                                       |
| Remote code                                                    | All code bundled; no remote scripts; build fails if `eval(`/`new Function(` appear.                                                                                                                                                |
| Licence forgery                                                | Server-signed ECDSA P-256 tokens bound to a device ID; only the public key ships in the extension; local flags are ignored; tokens expire and are refreshed so revocations propagate. Mock provider is compiled out of production. |
| Licensing transport                                            | HTTPS required, `credentials: 'omit'`, `redirect: 'error'`, timeouts, response schema validation.                                                                                                                                  |
| Over-broad permissions                                         | `activeTab` + `scripting` + `storage`; host access only optional and per-origin, requested on a user gesture.                                                                                                                      |
| Payment secrets                                                | None in the extension. Server-side webhook signature verification and idempotent processing (see `docs/LICENSING_BACKEND.md`).                                                                                                     |

## Known limitations

- Anyone can modify their own installed copy of a client-side extension to bypass feature checks; licensing protects unmodified builds and the server-side licence records, not a determined local attacker.
- Extraction reads the DOM as rendered; content in cross-origin iframes, canvas, closed shadow DOM or images (text in images) is not extracted.
- Very unusual layouts may be detected incorrectly; users can correct columns or use the picker.
- The Firefox build is produced but not covered by automated tests.
- The licensing server described in the docs is a design, not deployed code.

## Reporting a vulnerability

Please report security issues privately to **[SECURITY CONTACT EMAIL]** with steps to reproduce and the extension version. Do not open public issues for vulnerabilities. We aim to acknowledge reports within 5 business days.
