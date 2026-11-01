import { z } from 'zod';
import { FEATURES } from '../entitlements';

/**
 * License token = base64url(JSON payload) + "." + base64url(ECDSA P-256 / SHA-256 signature).
 * Tokens are issued by the licensing server after it has verified the purchase. The extension
 * only holds the server's PUBLIC key, so it can verify but never mint tokens.
 */

export const TokenPayloadSchema = z.object({
  v: z.literal(1),
  /** Opaque license id (not the license key). */
  lid: z.string().min(1).max(100),
  plan: z.literal('pro'),
  ent: z.array(z.enum(FEATURES)).max(FEATURES.length),
  /** Device id this token is bound to. */
  dev: z.string().min(8).max(100),
  /** Issued-at / token-expiry in seconds since epoch. */
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
  /** License expiry (null for lifetime licenses). */
  lexp: z.number().int().nonnegative().nullable(),
  /** Last 4 characters of the license key, for display only. */
  hint: z.string().max(8),
});

export type TokenPayload = z.infer<typeof TokenPayloadSchema>;

export const SIGNING_ALGORITHM: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' };
export const KEY_ALGORITHM: EcKeyImportParams = { name: 'ECDSA', namedCurve: 'P-256' };

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error('Invalid base64url');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || jwk.d) {
    // Refuse anything that is not a P-256 public key (and never accept a private key here).
    throw new Error('License public key must be a P-256 public JWK');
  }
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y },
    KEY_ALGORITHM,
    false,
    ['verify'],
  );
}

export async function signToken(payload: TokenPayload, privateKey: CryptoKey): Promise<string> {
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = new Uint8Array(
    await crypto.subtle.sign(SIGNING_ALGORITHM, privateKey, new TextEncoder().encode(body)),
  );
  return `${body}.${base64UrlEncode(sig)}`;
}

export type VerifyFailure =
  | 'malformed'
  | 'bad-signature'
  | 'wrong-device'
  | 'expired'
  | 'license-expired';

export type VerifyResult =
  | { ok: true; payload: TokenPayload }
  | { ok: false; reason: VerifyFailure; payload?: TokenPayload };

const CLOCK_SKEW_SECONDS = 300;

export async function verifyToken(
  token: string,
  publicKey: CryptoKey,
  expected: { deviceId: string; nowMs?: number },
): Promise<VerifyResult> {
  const parts = token.split('.');
  if (parts.length !== 2 || token.length > 4_000) return { ok: false, reason: 'malformed' };
  const [body, sig] = parts as [string, string];
  let valid = false;
  try {
    // Signature is checked BEFORE the payload is parsed or trusted.
    valid = await crypto.subtle.verify(
      SIGNING_ALGORITHM,
      publicKey,
      base64UrlDecode(sig),
      new TextEncoder().encode(body),
    );
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!valid) return { ok: false, reason: 'bad-signature' };

  let payload: TokenPayload;
  try {
    const parsed = TokenPayloadSchema.safeParse(
      JSON.parse(new TextDecoder().decode(base64UrlDecode(body))),
    );
    if (!parsed.success) return { ok: false, reason: 'malformed' };
    payload = parsed.data;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const now = Math.floor((expected.nowMs ?? Date.now()) / 1000);
  if (payload.dev !== expected.deviceId) return { ok: false, reason: 'wrong-device', payload };
  if (payload.lexp !== null && payload.lexp < now - CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: 'license-expired', payload };
  }
  if (payload.exp < now - CLOCK_SKEW_SECONDS) return { ok: false, reason: 'expired', payload };
  return { ok: true, payload };
}
