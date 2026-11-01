import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildFlags } from './build-flags';

const root = import.meta.dirname;

export default defineConfig(({ mode }) => {
  const flags = buildFlags(mode);
  const release = mode === 'production';
  return {
    root,
    base: '',
    plugins: [react()],
    define: flags.define,
    build: {
      outDir: process.env.SWDE_OUT_DIR ?? resolve(root, 'dist/dev'),
      emptyOutDir: true,
      target: 'chrome116',
      sourcemap: !release,
      minify: release || mode === 'e2e',
      // The modulepreload polyfill touches `document`, which does not exist in the service worker.
      modulePreload: { polyfill: false },
      rollupOptions: {
        input: {
          popup: resolve(root, 'popup.html'),
          dashboard: resolve(root, 'dashboard.html'),
          background: resolve(root, 'src/background/index.ts'),
        },
        output: {
          entryFileNames: (chunk) =>
            chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
});
