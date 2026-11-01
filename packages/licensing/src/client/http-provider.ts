import { z } from 'zod';
import type {
  ActivateRequest,
  LicenseProvider,
  ProviderErrorCode,
  ProviderResponse,
  TokenRequest,
} from './types';

const SuccessSchema = z.object({ token: z.string().min(10).max(4_000) });
const ErrorSchema = z.object({
  error: z.enum(['invalid_key', 'revoked', 'device_limit', 'expired', 'server']),
  message: z.string().max(500).optional(),
});

const TIMEOUT_MS = 15_000;

/**
 * Talks to the licensing server described in docs/LICENSING_BACKEND.md. The server owns all
 * payment-provider secrets; this client only ever sends the license key, device id and token.
 */
export class HttpLicenseProvider implements LicenseProvider {
  readonly mode = 'production' as const;
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      throw new Error('Licensing API must use HTTPS');
    }
    this.baseUrl = url.href.replace(/\/$/, '');
  }

  private async post(path: string, body: object): Promise<ProviderResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
      });
    } catch {
      return { ok: false, code: 'network', message: 'Network error' };
    } finally {
      clearTimeout(timer);
    }
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      // handled below
    }
    if (response.ok) {
      const parsed = SuccessSchema.safeParse(json);
      return parsed.success
        ? { ok: true, token: parsed.data.token }
        : { ok: false, code: 'server', message: 'Malformed server response' };
    }
    const err = ErrorSchema.safeParse(json);
    const code: ProviderErrorCode = err.success ? err.data.error : 'server';
    return {
      ok: false,
      code,
      message: err.success ? (err.data.message ?? code) : `HTTP ${response.status}`,
    };
  }

  activate(request: ActivateRequest): Promise<ProviderResponse> {
    return this.post('/v1/licenses/activate', request);
  }

  refresh(request: TokenRequest): Promise<ProviderResponse> {
    return this.post('/v1/licenses/refresh', request);
  }

  async deactivate(request: TokenRequest): Promise<void> {
    await this.post('/v1/licenses/deactivate', request);
  }
}

/** Used when no licensing server is configured: Free works, activation explains why it can't. */
export class UnconfiguredLicenseProvider implements LicenseProvider {
  readonly mode = 'unconfigured' as const;

  async activate(): Promise<ProviderResponse> {
    return { ok: false, code: 'not_configured', message: 'Licensing server not configured' };
  }

  async refresh(): Promise<ProviderResponse> {
    return { ok: false, code: 'not_configured', message: 'Licensing server not configured' };
  }

  async deactivate(): Promise<void> {}
}
