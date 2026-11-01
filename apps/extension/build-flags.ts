/**
 * Build-time configuration. Every value here is compiled into the bundle as a constant, so
 * code behind `__LICENSE_MODE__ === 'mock'` is removed from production builds entirely.
 */
export type LicenseMode = 'mock' | 'production' | 'unconfigured';

export interface BuildFlags {
  licenseMode: LicenseMode;
  define: Record<string, string>;
}

export function buildFlags(mode: string): BuildFlags {
  const env = process.env;
  const apiUrl = env.SWDE_LICENSE_API_URL ?? '';
  const publicKey = env.SWDE_LICENSE_PUBLIC_KEY_JWK ?? '';
  let licenseMode: LicenseMode;
  if (mode === 'production') {
    licenseMode = apiUrl && publicKey ? 'production' : 'unconfigured';
  } else {
    licenseMode = env.SWDE_LICENSE_MODE === 'unconfigured' ? 'unconfigured' : 'mock';
  }
  if (mode === 'production' && licenseMode === 'mock') {
    throw new Error('The mock licensing provider must never be enabled in production builds.');
  }
  if (publicKey) {
    const jwk = JSON.parse(publicKey) as { kty?: string; crv?: string; d?: string };
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || jwk.d) {
      throw new Error('SWDE_LICENSE_PUBLIC_KEY_JWK must be a P-256 PUBLIC key (no "d" field).');
    }
  }
  return {
    licenseMode,
    define: {
      __E2E__: JSON.stringify(mode === 'e2e'),
      __DEV_BUILD__: JSON.stringify(mode !== 'production'),
      __LICENSE_MODE__: JSON.stringify(licenseMode),
      __LICENSE_API_URL__: JSON.stringify(apiUrl),
      __LICENSE_PUBLIC_KEY__: JSON.stringify(publicKey),
      __PURCHASE_URL__: JSON.stringify(env.SWDE_PURCHASE_URL ?? ''),
      __SUPPORT_URL__: JSON.stringify(env.SWDE_SUPPORT_URL ?? ''),
      __APP_VERSION__: JSON.stringify(env.SWDE_VERSION ?? '0.0.0'),
    },
  };
}
