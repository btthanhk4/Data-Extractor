import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { buildFlags } from './build-flags';

const root = import.meta.dirname;

/**
 * Content scripts injected with chrome.scripting.executeScript({ files }) cannot be ES modules,
 * so the content script is built separately as a single self-contained IIFE.
 */
export default defineConfig(({ mode }) => {
  const release = mode === 'production';
  return {
    root,
    define: buildFlags(mode).define,
    publicDir: false,
    build: {
      outDir: process.env.SWDE_OUT_DIR ?? resolve(root, 'dist/dev'),
      emptyOutDir: false,
      target: 'chrome116',
      sourcemap: !release,
      minify: release || mode === 'e2e',
      lib: {
        entry: resolve(root, 'src/content/index.ts'),
        formats: ['iife'],
        name: 'SWDEContent',
        fileName: () => 'content.js',
      },
    },
  };
});
