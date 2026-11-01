# Release checklist

## Code and build

- [ ] Version bumped in root `package.json`; `CHANGELOG.md` updated.
- [ ] `pnpm check` passes (typecheck, lint, unit + integration tests, production build).
- [ ] `pnpm test:e2e` passes.
- [ ] Production build verification passed (no mock licensing, no `eval`) — enforced by `apps/extension/scripts/build.mjs`.
- [ ] `apps/extension/dist/chrome/manifest.json` reviewed: MV3, permissions `activeTab`, `scripting`, `storage`; only optional host permissions; no `content_scripts`; CSP present.
- [ ] Manual smoke test of the packaged build (`pnpm package`, load unpacked) on 3–5 real websites: a Wikipedia table, a product listing, a search results page, a directory, a site with pagination. Note any failures honestly in the listing's "Good to know".
- [ ] Light and dark mode, keyboard navigation of popup and dashboard checked.
- [ ] Edge: load the Chrome build in Edge and smoke test.
- [ ] Firefox (if publishing there): `pnpm build:firefox`, load temporarily, smoke test; set a real `SWDE_GECKO_ID`.

## Licensing and payments (skip for a Free-only first release)

- [ ] Licensing server deployed per `docs/LICENSING_BACKEND.md`; webhook signature verification and idempotency tested.
- [ ] Extension built with `SWDE_LICENSE_API_URL`, `SWDE_LICENSE_PUBLIC_KEY_JWK`, `SWDE_PURCHASE_URL`, `SWDE_SUPPORT_URL`.
- [ ] Real live-mode purchase → activation → refund → revocation verified.
- [ ] If payments are not ready, the License screen shows "Pro purchases are not open yet" and the listing does not promise Pro availability.

## Legal and listing

- [ ] `PRIVACY.md` placeholders completed and published at a public URL.
- [ ] `LICENSE.md` copyright holder and end-user terms completed.
- [ ] `SECURITY.md` contact filled in.
- [ ] Store listing text, permission justifications and data disclosures from `docs/STORE_LISTING.md` entered.
- [ ] Screenshots from real sites (not fixtures), promo tile.
- [ ] Description matches behaviour; no guarantees of compatibility with every site.

## After submission

- [ ] Track review status; respond to reviewer questions about permissions using the justifications above.
- [ ] After approval, record the extension id; update licensing server CORS.
- [ ] Tag the release in git.
