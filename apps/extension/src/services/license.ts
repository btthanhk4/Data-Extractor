import { HttpLicenseProvider, LicenseClient, UnconfiguredLicenseProvider } from '@swde/licensing';
import type { LicenseProvider } from '@swde/licensing';
import { STORAGE_KEYS } from '@swde/shared';
import { localStore } from './storage';

async function deviceId(): Promise<string> {
  const existing = await localStore.get(STORAGE_KEYS.deviceId);
  if (typeof existing === 'string' && /^[a-f0-9-]{36}$/.test(existing)) return existing;
  // Random, per-install identifier. Not derived from hardware or browsing data.
  const id = crypto.randomUUID();
  await localStore.set(STORAGE_KEYS.deviceId, id);
  return id;
}

let clientPromise: Promise<LicenseClient> | null = null;

async function createClient(): Promise<LicenseClient> {
  const common = {
    store: localStore,
    deviceId,
    extensionVersion: __APP_VERSION__,
    isOnline: () => navigator.onLine,
  };
  // __LICENSE_MODE__ is a build-time constant, so the unused branches (and the mock module)
  // are dropped from the bundle. Production builds can never select the mock.
  if (__LICENSE_MODE__ === 'mock') {
    const { MockLicenseProvider } = await import('@swde/licensing/mock');
    const mock = new MockLicenseProvider(localStore, { latencyMs: __E2E__ ? 50 : 350 });
    return new LicenseClient({ ...common, provider: mock, publicKey: () => mock.publicKey() });
  }
  if (__LICENSE_MODE__ === 'production') {
    const provider: LicenseProvider = new HttpLicenseProvider(__LICENSE_API_URL__);
    const jwk = JSON.parse(__LICENSE_PUBLIC_KEY__) as JsonWebKey;
    return new LicenseClient({ ...common, provider, publicKey: async () => jwk });
  }
  return new LicenseClient({
    ...common,
    provider: new UnconfiguredLicenseProvider(),
    publicKey: async () => null,
  });
}

export function getLicenseClient(): Promise<LicenseClient> {
  clientPromise ??= createClient();
  return clientPromise;
}

export const PURCHASE_URL: string | null = /^https:\/\//.test(__PURCHASE_URL__)
  ? __PURCHASE_URL__
  : null;
export const SUPPORT_URL: string | null = /^(https:\/\/|mailto:)/.test(__SUPPORT_URL__)
  ? __SUPPORT_URL__
  : null;
