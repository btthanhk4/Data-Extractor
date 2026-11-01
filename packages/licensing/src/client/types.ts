import type { Feature, Plan } from '../entitlements';

/** Storage abstraction so the client works with chrome.storage, memory (tests) or others. */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export type ProviderErrorCode =
  | 'invalid_key'
  | 'revoked'
  | 'device_limit'
  | 'expired'
  | 'network'
  | 'server'
  | 'not_configured';

export type ProviderResponse =
  | { ok: true; token: string }
  | { ok: false; code: ProviderErrorCode; message: string };

export interface ActivateRequest {
  licenseKey: string;
  deviceId: string;
  extensionVersion: string;
}

export interface TokenRequest {
  token: string;
  deviceId: string;
}

/**
 * Provider-independent licensing backend. Implementations talk to *our* licensing server, which
 * in turn integrates with a payment provider (Lemon Squeezy, Paddle, Stripe…) server-side.
 */
export interface LicenseProvider {
  readonly mode: 'mock' | 'production' | 'unconfigured';
  activate(request: ActivateRequest): Promise<ProviderResponse>;
  refresh(request: TokenRequest): Promise<ProviderResponse>;
  deactivate(request: TokenRequest): Promise<void>;
}

export type LicenseStatus =
  | 'free'
  | 'active'
  | 'expired'
  | 'revoked'
  | 'invalid'
  | 'device-mismatch';

export interface LicenseState {
  status: LicenseStatus;
  plan: Plan;
  /** Only populated from a signature-verified token. */
  features: Feature[];
  mode: LicenseProvider['mode'];
  keyHint: string | null;
  licenseExpiresAt: number | null;
  tokenExpiresAt: number | null;
  lastVerifiedAt: number | null;
  message: string | null;
}
