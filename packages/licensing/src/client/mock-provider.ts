import { PRO_FEATURES } from '../entitlements';
import { KEY_ALGORITHM, SIGNING_ALGORITHM, base64UrlDecode, signToken } from '../validation/token';
import type { TokenPayload } from '../validation/token';
import type {
  ActivateRequest,
  KeyValueStore,
  LicenseProvider,
  ProviderResponse,
  TokenRequest,
} from './types';

/**
 * DEVELOPMENT-ONLY licensing provider. It simulates the licensing server locally by generating
 * its own signing key pair and storing it in extension storage. It is excluded from production
 * builds (see apps/extension/src/services/license.ts and vite.config.ts) and must never ship.
 *
 * Test keys:
 *   SWDE-DEV-PRO            → valid lifetime Pro license
 *   SWDE-DEV-XXXX-XXXX      → valid (any 4+4 alphanumerics)
 *   SWDE-DEV-REVOKED        → revoked
 *   SWDE-DEV-LIMIT          → device limit reached
 *   SWDE-DEV-EXPIRED        → license expired
 */

const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const VALID_KEY = /^SWDE-DEV-(PRO|[A-Z0-9]{4}-[A-Z0-9]{4})$/;
const MAX_DEVICES = 3;
/** Lives here (not in @swde/shared) so production bundles never reference it. */
const MOCK_KEYS_STORAGE = 'swde.dev.mockKeys';

interface MockKeys {
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
  revoked: string[];
  devices: Record<string, string[]>;
}

export class MockLicenseProvider implements LicenseProvider {
  readonly mode = 'mock' as const;
  private readonly store: KeyValueStore;
  private readonly latencyMs: number;
  private keysPromise: Promise<MockKeys> | null = null;

  constructor(store: KeyValueStore, options: { latencyMs?: number } = {}) {
    this.store = store;
    this.latencyMs = options.latencyMs ?? 350;
  }

  private async keys(): Promise<MockKeys> {
    this.keysPromise ??= (async () => {
      const existing = (await this.store.get(MOCK_KEYS_STORAGE)) as MockKeys | undefined;
      if (existing?.publicJwk && existing.privateJwk) return existing;
      const pair = (await crypto.subtle.generateKey(KEY_ALGORITHM, true, [
        'sign',
        'verify',
      ])) as CryptoKeyPair;
      const keys: MockKeys = {
        publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey),
        privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
        revoked: [],
        devices: {},
      };
      await this.store.set(MOCK_KEYS_STORAGE, keys);
      return keys;
    })();
    return this.keysPromise;
  }

  private async save(keys: MockKeys): Promise<void> {
    await this.store.set(MOCK_KEYS_STORAGE, keys);
  }

  async publicKey(): Promise<JsonWebKey> {
    const { publicJwk } = await this.keys();
    return { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y };
  }

  private delay(): Promise<void> {
    return new Promise((r) => setTimeout(r, this.latencyMs));
  }

  private async issue(licenseKey: string, deviceId: string): Promise<string> {
    const keys = await this.keys();
    const privateKey = await crypto.subtle.importKey('jwk', keys.privateJwk, KEY_ALGORITHM, false, [
      'sign',
    ]);
    const now = Math.floor(Date.now() / 1000);
    const payload: TokenPayload = {
      v: 1,
      lid: `mock_${licenseKey.slice(-8).toLowerCase()}`,
      plan: 'pro',
      ent: [...PRO_FEATURES],
      dev: deviceId,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
      lexp: null,
      hint: licenseKey.slice(-4),
    };
    return signToken(payload, privateKey);
  }

  async activate(request: ActivateRequest): Promise<ProviderResponse> {
    await this.delay();
    const key = request.licenseKey.toUpperCase();
    if (key === 'SWDE-DEV-REVOKED') return { ok: false, code: 'revoked', message: 'revoked' };
    if (key === 'SWDE-DEV-LIMIT')
      return { ok: false, code: 'device_limit', message: 'device limit' };
    if (key === 'SWDE-DEV-EXPIRED') return { ok: false, code: 'expired', message: 'expired' };
    if (!VALID_KEY.test(key)) return { ok: false, code: 'invalid_key', message: 'invalid key' };
    const keys = await this.keys();
    if (keys.revoked.includes(key)) return { ok: false, code: 'revoked', message: 'revoked' };
    const devices = keys.devices[key] ?? [];
    if (!devices.includes(request.deviceId)) {
      if (devices.length >= MAX_DEVICES)
        return { ok: false, code: 'device_limit', message: 'device limit' };
      devices.push(request.deviceId);
      keys.devices[key] = devices;
      await this.save(keys);
    }
    return { ok: true, token: await this.issue(key, request.deviceId) };
  }

  private async keyForToken(token: string): Promise<string | null> {
    try {
      const body = token.split('.')[0] ?? '';
      const payload = JSON.parse(
        new TextDecoder().decode(base64UrlDecode(body)),
      ) as Partial<TokenPayload>;
      const keys = await this.keys();
      return (
        Object.keys(keys.devices).find(
          (k) => `mock_${k.slice(-8).toLowerCase()}` === payload.lid,
        ) ?? null
      );
    } catch {
      return null;
    }
  }

  async refresh(request: TokenRequest): Promise<ProviderResponse> {
    await this.delay();
    const keys = await this.keys();
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      await this.publicKey(),
      KEY_ALGORITHM,
      false,
      ['verify'],
    );
    const [body, sig] = request.token.split('.');
    const valid =
      !!body &&
      !!sig &&
      (await crypto.subtle.verify(
        SIGNING_ALGORITHM,
        publicKey,
        base64UrlDecode(sig),
        new TextEncoder().encode(body),
      ));
    if (!valid) return { ok: false, code: 'invalid_key', message: 'bad token' };
    const key = await this.keyForToken(request.token);
    if (!key) return { ok: false, code: 'invalid_key', message: 'unknown license' };
    if (keys.revoked.includes(key)) return { ok: false, code: 'revoked', message: 'revoked' };
    return { ok: true, token: await this.issue(key, request.deviceId) };
  }

  async deactivate(request: TokenRequest): Promise<void> {
    const key = await this.keyForToken(request.token);
    if (!key) return;
    const keys = await this.keys();
    keys.devices[key] = (keys.devices[key] ?? []).filter((d) => d !== request.deviceId);
    await this.save(keys);
  }

  /** Test helper: simulates a refund/chargeback revocation on the server. */
  async revoke(licenseKey: string): Promise<void> {
    const keys = await this.keys();
    keys.revoked.push(licenseKey.toUpperCase());
    await this.save(keys);
  }
}
