# Licensing backend — minimal secure design

The extension is fully usable without this server (Free plan). The server is needed only to sell and verify Pro licences. **Nothing in this document is deployed yet**, and payments must not be advertised as working until a real end-to-end purchase has been tested.

## Components

```
Customer ──checkout──▶ Payment provider (Lemon Squeezy / Paddle / Stripe …)
                               │ signed webhook
                               ▼
                       Licensing server ──▶ Database (licences, activations, webhook events)
                               ▲
Extension ──HTTPS JSON─────────┘  /v1/licenses/activate | refresh | deactivate
```

Choose a provider that acts as merchant of record if you want it to handle VAT/sales tax. The extension is provider-independent: it only talks to _your_ licensing server.

## Keys and secrets

| Secret                                           | Lives in                                                       | Never in              |
| ------------------------------------------------ | -------------------------------------------------------------- | --------------------- |
| Payment provider API key, webhook signing secret | Server environment / secret manager                            | Extension, repo, logs |
| Token signing **private** key (ECDSA P-256)      | Server secret manager                                          | Extension, repo       |
| Token signing **public** key (JWK)               | Build env `SWDE_LICENSE_PUBLIC_KEY_JWK` → bundled in extension | —                     |

Generate the key pair once (e.g. WebCrypto `generateKey({name:'ECDSA',namedCurve:'P-256'})`, export both as JWK). Rotating keys requires shipping an extension update with the new public key; plan an overlap period where the server signs with the new key only after the update is live.

## Data model

```
licenses(id PK, key_hash UNIQUE, key_hint, status ENUM(active,revoked,refunded,expired),
         plan, max_devices DEFAULT 3, expires_at NULL, order_id UNIQUE, customer_ref, created_at)
activations(id PK, license_id FK, device_id, first_seen, last_seen, deactivated_at NULL,
            UNIQUE(license_id, device_id))
webhook_events(provider_event_id PK, type, received_at, processed_at, payload_hash)
```

- Store licence keys **hashed** (e.g. SHA-256 with a server-side pepper); keep only the last 4 characters for display.
- Licence keys: ≥ 128 bits of randomness, formatted for humans (e.g. `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX` base32). Show once on the receipt page and email.

## Webhook handling

1. Read the **raw** request body; verify the provider signature header with the webhook secret using a constant-time comparison. Reject on failure (HTTP 400) without processing.
2. Reject events older than the provider's tolerance window (timestamp check) to limit replays.
3. Idempotency: `INSERT INTO webhook_events (provider_event_id …) ON CONFLICT DO NOTHING`; if the row already existed, return 200 and stop.
4. Re-fetch the order from the provider API (or trust the verified payload) and check **server-side** that product id, currency and amount match the configured Pro product. Never trust prices sent by a client.
5. `order_paid` → create licence (in the same transaction as marking the event processed) and email the key. `refund`/`chargeback` → set `status = revoked`. Subscription products (if ever added) → update `expires_at`.
6. Return 2xx quickly; do slow work (email) asynchronously with retries.

## Extension API

All endpoints: `POST`, JSON, HTTPS only, CORS allowing `chrome-extension://<published id>` (and the Edge/Firefox ids), no cookies, rate limited per IP and per licence key (e.g. 10/min), request bodies ≤ 4 KB.

| Endpoint                  | Request                                      | Success                  | Errors (`{ "error": code, "message"? }`)                            |
| ------------------------- | -------------------------------------------- | ------------------------ | ------------------------------------------------------------------- |
| `/v1/licenses/activate`   | `{ licenseKey, deviceId, extensionVersion }` | `{ token }`              | `invalid_key` 404, `revoked` 403, `expired` 403, `device_limit` 409 |
| `/v1/licenses/refresh`    | `{ token, deviceId }`                        | `{ token }`              | `invalid_key`, `revoked`, `expired`                                 |
| `/v1/licenses/deactivate` | `{ token, deviceId }`                        | `{ ok: true }` (any 2xx) | —                                                                   |

Rules:

- **Activate:** look up `key_hash`; check status/expiry; upsert activation for `deviceId`; if this would exceed `max_devices` active activations → `device_limit`. Issue a token.
- **Refresh:** verify the token signature with the server's own public key (the token may be expired — accept up to e.g. 90 days old), check the licence is still active and the activation is not deactivated, update `last_seen`, issue a new token. Revoked → `revoked` (the client then drops to Free).
- **Deactivate:** mark the activation deactivated so the device slot frees up.
- Use generic error messages; do not reveal whether a key exists beyond `invalid_key`.

## Token format (implemented in `packages/licensing/src/validation/token.ts`)

`base64url(JSON payload) + "." + base64url(ECDSA P-256 SHA-256 signature over the first segment)`; signature in IEEE P1363 (raw r‖s) form, which is what WebCrypto produces and verifies.

```json
{
  "v": 1,
  "lid": "lic_…",
  "plan": "pro",
  "ent": [
    "visual-select",
    "presets",
    "preset-io",
    "xlsx-export",
    "multi-page",
    "advanced-cleaning"
  ],
  "dev": "<deviceId>",
  "iat": 1767225600,
  "exp": 1769817600,
  "lexp": null,
  "hint": "7KQ2"
}
```

- `exp` = now + 30 days (offline grace). The client refreshes after 3 days when online.
- `lexp` = licence expiry or `null` for lifetime.
- `ent` lists entitlements explicitly so plans can change server-side without an extension update.

## Logging and privacy

- Never log licence keys, tokens, webhook secrets or full request bodies. Log licence id, event type, outcome, coarse IP-derived rate-limit keys.
- Device ids are random per install and carry no browsing data. Define a retention period for inactive activations (e.g. delete after 24 months) and document it in `PRIVACY.md`.

## Remaining steps before selling

1. Confirm merchant eligibility with the chosen payment provider and create the Pro product ($9.99 one-time).
2. Implement and deploy this server (any stack; a small serverless function + Postgres is enough), with automated tests for webhook signature verification and idempotency.
3. Publish the extension once to obtain its permanent id; configure CORS for it.
4. Build the extension with `SWDE_LICENSE_API_URL`, `SWDE_LICENSE_PUBLIC_KEY_JWK`, `SWDE_PURCHASE_URL`, `SWDE_SUPPORT_URL`.
5. Run a **real** purchase in the provider's live mode, activate in the store build, refund it, and confirm the licence is revoked after the next refresh.
6. Complete the licensing sections of `PRIVACY.md` and the store listing.
