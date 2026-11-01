import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Build-time constants used by extension code under test (see apps/extension/build-flags.ts).
  define: {
    __E2E__: 'false',
    __DEV_BUILD__: 'true',
    __LICENSE_MODE__: JSON.stringify('mock'),
    __LICENSE_API_URL__: JSON.stringify(''),
    __LICENSE_PUBLIC_KEY__: JSON.stringify(''),
    __PURCHASE_URL__: JSON.stringify(''),
    __SUPPORT_URL__: JSON.stringify(''),
    __APP_VERSION__: JSON.stringify('test'),
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'jsdom',
    globals: false,
    restoreMocks: true,
    testTimeout: 20_000,
  },
});
