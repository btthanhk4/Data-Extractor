import { STORAGE_KEYS, errorMessage } from '@swde/shared';
import type { Feature } from '../entitlements';
import { importPublicKey, verifyToken } from '../validation/token';
import type { TokenPayload, VerifyFailure } from '../validation/token';
import type { KeyValueStore, LicenseProvider, LicenseState, ProviderResponse } from './types';

/** Refresh the token when it is older than this, if online. */
const REFRESH_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export interface LicenseClientOptions {
  provider: LicenseProvider;
  store: KeyValueStore;
  /** Server public key. In production this is a build-time constant, never fetched at runtime. */
  publicKey: () => Promise<JsonWebKey | null>;
  deviceId: () => Promise<string>;
  extensionVersion: string;
  isOnline?: () => boolean;
  now?: () => number;
}

export type ActivationResult =
  | { ok: true; state: LicenseState }
  | { ok: false; message: string; state: LicenseState };

const LICENSE_KEY_RE = /^[A-Za-z0-9-]{8,64}$/;

function freeState(
  mode: LicenseProvider['mode'],
  status: LicenseState['status'] = 'free',
  message: string | null = null,
): LicenseState {
  return {
    status,
    plan: 'free',
    features: [],
    mode,
    keyHint: null,
    licenseExpiresAt: null,
    tokenExpiresAt: null,
    lastVerifiedAt: null,
    message,
  };
}

const FAILURE_STATUS: Record<VerifyFailure, LicenseState['status']> = {
  malformed: 'invalid',
  'bad-signature': 'invalid',
  'wrong-device': 'device-mismatch',
  expired: 'expired',
  'license-expired': 'expired',
};

const FAILURE_MESSAGE: Record<VerifyFailure, string> = {
  malformed: 'The stored license could not be read. Please activate again.',
  'bad-signature': 'The stored license failed verification. Please activate again.',
  'wrong-device': 'This license token belongs to another device. Please activate again.',
  expired: 'Your license needs to be re-verified. Connect to the internet and open License.',
  'license-expired': 'Your license has expired.',
};

const PROVIDER_MESSAGES: Record<string, string> = {
  invalid_key: 'That license key was not recognised.',
  revoked: 'This license has been revoked. Contact support if you think this is a mistake.',
  device_limit: 'This license is already active on the maximum number of devices.',
  expired: 'This license has expired.',
  network: 'Could not reach the licensing server. Check your connection and try again.',
  server: 'The licensing server returned an error. Please try again later.',
  not_configured: 'License activation is not available in this build yet.',
};

export class LicenseClient {
  private readonly opts: LicenseClientOptions;
  private keyPromise: Promise<CryptoKey | null> | null = null;

  constructor(options: LicenseClientOptions) {
    this.opts = options;
  }

  get mode(): LicenseProvider['mode'] {
    return this.opts.provider.mode;
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  private online(): boolean {
    return this.opts.isOnline?.() ?? true;
  }

  private async key(): Promise<CryptoKey | null> {
    this.keyPromise ??= (async () => {
      const jwk = await this.opts.publicKey();
      return jwk ? importPublicKey(jwk) : null;
    })();
    return this.keyPromise;
  }

  private stateFrom(payload: TokenPayload): LicenseState {
    return {
      status: 'active',
      plan: 'pro',
      features: [...payload.ent] as Feature[],
      mode: this.mode,
      keyHint: payload.hint || null,
      licenseExpiresAt: payload.lexp === null ? null : payload.lexp * 1000,
      tokenExpiresAt: payload.exp * 1000,
      lastVerifiedAt: payload.iat * 1000,
      message: null,
    };
  }

  private async verifyStored(): Promise<{
    state: LicenseState;
    token: string | null;
    payload: TokenPayload | null;
  }> {
    const raw = await this.opts.store.get(STORAGE_KEYS.licenseToken);
    if (typeof raw !== 'string' || raw === '')
      return { state: freeState(this.mode), token: null, payload: null };
    const key = await this.key();
    if (!key)
      return {
        state: freeState(this.mode, 'invalid', PROVIDER_MESSAGES.not_configured!),
        token: raw,
        payload: null,
      };
    const result = await verifyToken(raw, key, {
      deviceId: await this.opts.deviceId(),
      nowMs: this.now(),
    });
    if (result.ok)
      return { state: this.stateFrom(result.payload), token: raw, payload: result.payload };
    return {
      state: freeState(this.mode, FAILURE_STATUS[result.reason], FAILURE_MESSAGE[result.reason]),
      token: raw,
      payload: result.payload ?? null,
    };
  }

  /**
   * Current license state. Verifies the stored token's signature every call and refreshes it
   * opportunistically when online, so revocations propagate within the token lifetime.
   */
  async getState(): Promise<LicenseState> {
    const { state, token, payload } = await this.verifyStored();
    if (!token) return state;
    const stale = payload ? this.now() - payload.iat * 1000 > REFRESH_AFTER_MS : false;
    const needsRefresh = state.status === 'expired' || (state.status === 'active' && stale);
    if (needsRefresh && this.online() && state.status !== 'device-mismatch') {
      const refreshed = await this.handleResponse(
        await this.safeCall(async () =>
          this.opts.provider.refresh({ token, deviceId: await this.opts.deviceId() }),
        ),
        token,
      );
      if (refreshed) return refreshed;
    }
    if (state.status === 'invalid') await this.opts.store.remove(STORAGE_KEYS.licenseToken);
    return state;
  }

  private async safeCall(fn: () => Promise<ProviderResponse>): Promise<ProviderResponse> {
    try {
      return await fn();
    } catch (error) {
      return { ok: false, code: 'network', message: errorMessage(error) };
    }
  }

  private async handleResponse(
    response: ProviderResponse,
    previousToken: string | null,
  ): Promise<LicenseState | null> {
    if (response.ok) {
      await this.opts.store.set(STORAGE_KEYS.licenseToken, response.token);
      const { state } = await this.verifyStored();
      if (state.status !== 'active') {
        // Server returned something we cannot verify: do not keep it.
        if (previousToken) await this.opts.store.set(STORAGE_KEYS.licenseToken, previousToken);
        else await this.opts.store.remove(STORAGE_KEYS.licenseToken);
        return freeState(
          this.mode,
          'invalid',
          'The licensing server response could not be verified.',
        );
      }
      return state;
    }
    if (response.code === 'revoked' || response.code === 'expired') {
      await this.opts.store.remove(STORAGE_KEYS.licenseToken);
      return freeState(
        this.mode,
        response.code === 'revoked' ? 'revoked' : 'expired',
        PROVIDER_MESSAGES[response.code]!,
      );
    }
    // Network/server errors keep the existing (still signature-valid) token for offline grace.
    return null;
  }

  async activate(licenseKey: string): Promise<ActivationResult> {
    const key = licenseKey.trim();
    if (!LICENSE_KEY_RE.test(key)) {
      return {
        ok: false,
        message: 'Enter a valid license key (letters, numbers and dashes).',
        state: await this.getState(),
      };
    }
    if (this.mode === 'unconfigured') {
      return {
        ok: false,
        message: PROVIDER_MESSAGES.not_configured!,
        state: await this.getState(),
      };
    }
    if (!this.online()) {
      return {
        ok: false,
        message: 'You are offline. Connect to the internet to activate.',
        state: await this.getState(),
      };
    }
    const response = await this.safeCall(async () =>
      this.opts.provider.activate({
        licenseKey: key,
        deviceId: await this.opts.deviceId(),
        extensionVersion: this.opts.extensionVersion,
      }),
    );
    if (response.ok) {
      const state = await this.handleResponse(response, null);
      if (state && state.status === 'active') return { ok: true, state };
      return {
        ok: false,
        message: state?.message ?? 'Activation failed.',
        state: state ?? (await this.getState()),
      };
    }
    return {
      ok: false,
      message: PROVIDER_MESSAGES[response.code] ?? response.message,
      state: await this.getState(),
    };
  }

  async deactivate(): Promise<LicenseState> {
    const raw = await this.opts.store.get(STORAGE_KEYS.licenseToken);
    if (typeof raw === 'string' && raw && this.online()) {
      try {
        await this.opts.provider.deactivate({ token: raw, deviceId: await this.opts.deviceId() });
      } catch {
        // Local removal still happens; the server slot frees up when the token expires.
      }
    }
    await this.opts.store.remove(STORAGE_KEYS.licenseToken);
    return freeState(this.mode);
  }
}
