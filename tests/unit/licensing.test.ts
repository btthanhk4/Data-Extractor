// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KeyValueStore, LicenseProvider, TokenPayload } from '@swde/licensing';
import {
  HttpLicenseProvider,
  KEY_ALGORITHM,
  LicenseClient,
  UnconfiguredLicenseProvider,
  importPublicKey,
  signToken,
  verifyToken,
} from '@swde/licensing';
import { MockLicenseProvider } from '@swde/licensing/mock';
import { STORAGE_KEYS } from '@swde/shared';

function memoryStore(): KeyValueStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (k) => structuredClone(data.get(k)),
    set: async (k, v) => void data.set(k, structuredClone(v)),
    remove: async (k) => void data.delete(k),
  };
}

const DAY = 24 * 60 * 60 * 1000;

function setup(options: { device?: string; online?: boolean; now?: () => number } = {}) {
  const store = memoryStore();
  const mock = new MockLicenseProvider(store, { latencyMs: 0 });
  const state = {
    online: options.online ?? true,
    now: options.now ?? (() => Date.now()),
    device: options.device ?? 'device-aaaaaaaa',
  };
  const client = new LicenseClient({
    provider: mock,
    store,
    publicKey: () => mock.publicKey(),
    deviceId: async () => state.device,
    extensionVersion: '1.0.0',
    isOnline: () => state.online,
    now: () => state.now(),
  });
  return { store, mock, client, state };
}

describe('license tokens', () => {
  it('verifies signatures and rejects tampering', async () => {
    const pair = (await crypto.subtle.generateKey(KEY_ALGORITHM, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const pub = await importPublicKey(await crypto.subtle.exportKey('jwk', pair.publicKey));
    const now = Math.floor(Date.now() / 1000);
    const payload: TokenPayload = {
      v: 1,
      lid: 'lic_1',
      plan: 'pro',
      ent: ['xlsx-export'],
      dev: 'device-aaaaaaaa',
      iat: now,
      exp: now + 3600,
      lexp: null,
      hint: 'ABCD',
    };
    const token = await signToken(payload, pair.privateKey);
    expect((await verifyToken(token, pub, { deviceId: 'device-aaaaaaaa' })).ok).toBe(true);

    const [body, sig] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...payload, ent: ['xlsx-export', 'multi-page'] }),
    ).toString('base64url');
    expect(
      await verifyToken(`${forged}.${sig}`, pub, { deviceId: 'device-aaaaaaaa' }),
    ).toMatchObject({ ok: false, reason: 'bad-signature' });
    expect(await verifyToken(`${body}`, pub, { deviceId: 'device-aaaaaaaa' })).toMatchObject({
      ok: false,
      reason: 'malformed',
    });
    expect(await verifyToken(token, pub, { deviceId: 'device-bbbbbbbb' })).toMatchObject({
      ok: false,
      reason: 'wrong-device',
    });
    expect(
      await verifyToken(token, pub, {
        deviceId: 'device-aaaaaaaa',
        nowMs: Date.now() + 2 * 3600_000,
      }),
    ).toMatchObject({
      ok: false,
      reason: 'expired',
    });
  });

  it('refuses private keys as verification keys', async () => {
    const pair = (await crypto.subtle.generateKey(KEY_ALGORITHM, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    await expect(
      importPublicKey(await crypto.subtle.exportKey('jwk', pair.privateKey)),
    ).rejects.toThrow(/public/);
  });
});

describe('LicenseClient with the development mock provider', () => {
  it('starts on the free plan', async () => {
    const { client } = setup();
    expect(await client.getState()).toMatchObject({ status: 'free', plan: 'free', features: [] });
  });

  it('activates a valid key and derives features from the verified token', async () => {
    const { client, store } = setup();
    const result = await client.activate('SWDE-DEV-PRO');
    expect(result.ok).toBe(true);
    expect(result.state).toMatchObject({ status: 'active', plan: 'pro', keyHint: '-PRO' });
    expect(result.state.features).toContain('xlsx-export');
    expect(typeof store.data.get(STORAGE_KEYS.licenseToken)).toBe('string');
    expect(await client.getState()).toMatchObject({ status: 'active' });
  });

  it.each([
    ['bad key!', /valid license key/],
    ['SWDE-NOPE-1234', /not recognised/],
    ['SWDE-DEV-REVOKED', /revoked/],
    ['SWDE-DEV-LIMIT', /maximum number of devices/],
    ['SWDE-DEV-EXPIRED', /expired/],
  ])('rejects %s', async (key, message) => {
    const { client } = setup();
    const result = await client.activate(key);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(message);
    expect(result.state.plan).toBe('free');
  });

  it('does not activate while offline', async () => {
    const { client } = setup({ online: false });
    const result = await client.activate('SWDE-DEV-PRO');
    expect(result.ok).toBe(false);
  });

  it('enforces the device limit', async () => {
    const shared = memoryStore();
    for (let i = 0; i < 4; i++) {
      const mock = new MockLicenseProvider(shared, { latencyMs: 0 });
      const res = await mock.activate({
        licenseKey: 'SWDE-DEV-AAAA-BBBB',
        deviceId: `device-${i}xxxxxxx`,
        extensionVersion: '1',
      });
      expect(res.ok).toBe(i < 3);
    }
  });

  it('treats a locally edited token as invalid and removes it', async () => {
    const { client, store } = setup();
    await client.activate('SWDE-DEV-PRO');
    const token = store.data.get(STORAGE_KEYS.licenseToken) as string;
    store.data.set(STORAGE_KEYS.licenseToken, token.slice(0, -4) + 'AAAA');
    expect(await client.getState()).toMatchObject({ status: 'invalid', plan: 'free' });
    expect(store.data.has(STORAGE_KEYS.licenseToken)).toBe(false);
  });

  it('never trusts a stored boolean or forged plan flag', async () => {
    const { client, store } = setup();
    store.data.set(STORAGE_KEYS.licenseToken, 'true');
    store.data.set('isPro', true);
    expect((await client.getState()).plan).toBe('free');
  });

  it('rejects a token copied from another device', async () => {
    const { client, state } = setup();
    await client.activate('SWDE-DEV-PRO');
    state.device = 'device-other000';
    expect(await client.getState()).toMatchObject({ status: 'device-mismatch', plan: 'free' });
  });

  it('keeps Pro offline until the token expires, then asks to re-verify', async () => {
    let now = Date.now();
    const { client, state } = setup({ now: () => now });
    await client.activate('SWDE-DEV-PRO');
    state.online = false;
    now += 10 * DAY;
    expect((await client.getState()).status).toBe('active');
    now += 25 * DAY;
    expect(await client.getState()).toMatchObject({ status: 'expired', plan: 'free' });
  });

  it('refreshes stale tokens and propagates revocations', async () => {
    let now = Date.now();
    const { client, mock } = setup({ now: () => now });
    await client.activate('SWDE-DEV-PRO');
    await mock.revoke('SWDE-DEV-PRO');
    now += 4 * DAY;
    expect(await client.getState()).toMatchObject({ status: 'revoked', plan: 'free' });
  });

  it('survives a licensing outage during refresh', async () => {
    let now = Date.now();
    const { client, mock } = setup({ now: () => now });
    await client.activate('SWDE-DEV-PRO');
    vi.spyOn(mock, 'refresh').mockRejectedValue(new Error('ECONNRESET'));
    now += 4 * DAY;
    expect((await client.getState()).status).toBe('active');
  });

  it('deactivates locally', async () => {
    const { client } = setup();
    await client.activate('SWDE-DEV-PRO');
    expect((await client.deactivate()).plan).toBe('free');
    expect((await client.getState()).plan).toBe('free');
  });

  it('rejects tokens signed by a different key', async () => {
    const store = memoryStore();
    const mockA = new MockLicenseProvider(memoryStore(), { latencyMs: 0 });
    const mockB = new MockLicenseProvider(memoryStore(), { latencyMs: 0 });
    const client = new LicenseClient({
      provider: mockA,
      store,
      publicKey: () => mockB.publicKey(),
      deviceId: async () => 'device-aaaaaaaa',
      extensionVersion: '1',
    });
    const result = await client.activate('SWDE-DEV-PRO');
    expect(result.ok).toBe(false);
    expect((await client.getState()).plan).toBe('free');
  });
});

describe('unconfigured and HTTP providers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('explains that activation is unavailable when no server is configured', async () => {
    const provider: LicenseProvider = new UnconfiguredLicenseProvider();
    const client = new LicenseClient({
      provider,
      store: memoryStore(),
      publicKey: async () => null,
      deviceId: async () => 'device-aaaaaaaa',
      extensionVersion: '1',
    });
    const result = await client.activate('ABCD-EFGH-IJKL');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/not available/);
  });

  it('requires HTTPS for remote licensing servers', () => {
    expect(() => new HttpLicenseProvider('http://licensing.example.com')).toThrow(/HTTPS/);
    expect(() => new HttpLicenseProvider('https://licensing.example.com')).not.toThrow();
  });

  it('maps server responses and never sends cookies', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'abc.defghijkl' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'device_limit' }), { status: 409 }),
      )
      .mockResolvedValueOnce(new Response('<html>oops</html>', { status: 502 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new HttpLicenseProvider('https://licensing.example.com/');
    const req = { licenseKey: 'KEY-1234-5678', deviceId: 'device-aaaaaaaa', extensionVersion: '1' };
    expect(await provider.activate(req)).toEqual({ ok: true, token: 'abc.defghijkl' });
    expect(await provider.activate(req)).toMatchObject({ ok: false, code: 'device_limit' });
    expect(await provider.activate(req)).toMatchObject({ ok: false, code: 'server' });
    expect(await provider.activate(req)).toMatchObject({ ok: false, code: 'network' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://licensing.example.com/v1/licenses/activate');
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error' });
  });
});
