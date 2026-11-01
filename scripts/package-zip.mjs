// Zips a built extension for store upload: release/smart-web-data-extractor-<version>-<target>.zip
//   node scripts/package-zip.mjs chrome|firefox
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { zipSync } from 'fflate';

const target = process.argv[2] ?? 'chrome';
const root = resolve(import.meta.dirname, '..');
const dir = join(root, 'apps/extension/dist', target);
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));

const files = {};
(function walk(d) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    // Source maps are not shipped in release builds.
    else if (!p.endsWith('.map'))
      files[relative(dir, p).split(sep).join('/')] = new Uint8Array(readFileSync(p));
  }
})(dir);

if (!files['manifest.json']) throw new Error(`No manifest in ${dir}; run the build first.`);
mkdirSync(join(root, 'release'), { recursive: true });
const out = join(root, 'release', `smart-web-data-extractor-${manifest.version}-${target}.zip`);
writeFileSync(out, zipSync(files, { level: 9 }));
console.log(`${out} (${Object.keys(files).length} files)`);
