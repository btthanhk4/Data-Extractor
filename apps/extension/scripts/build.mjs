// Builds the extension for a target browser and mode, then writes the final manifest.
//   node scripts/build.mjs --target=chrome|firefox --mode=production|e2e|development
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'vite';

const appDir = resolve(import.meta.dirname, '..');
const repoDir = resolve(appDir, '../..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const target = args.target ?? 'chrome';
const mode = args.mode ?? 'production';
if (!['chrome', 'firefox'].includes(target)) throw new Error(`Unknown target ${target}`);
if (!['production', 'e2e', 'development'].includes(mode)) throw new Error(`Unknown mode ${mode}`);

const outDir = resolve(appDir, 'dist', mode === 'production' ? target : `${target}-${mode}`);
const rootPkg = JSON.parse(await readFile(join(repoDir, 'package.json'), 'utf8'));
process.env.SWDE_OUT_DIR = outDir;
process.env.SWDE_VERSION = rootPkg.version;

await build({ configFile: join(appDir, 'vite.config.ts'), mode, logLevel: 'warn' });
await build({ configFile: join(appDir, 'vite.content.config.ts'), mode, logLevel: 'warn' });

const manifest = JSON.parse(await readFile(join(appDir, 'manifest.json'), 'utf8'));
manifest.version = rootPkg.version;

if (mode === 'e2e') {
  // Tests cannot click the toolbar button (activeTab), so the e2e build is pre-granted the
  // local fixture server only. Production builds never get install-time host permissions.
  manifest.host_permissions = ['http://127.0.0.1/*', 'http://localhost/*'];
  manifest.name = `${manifest.name} (E2E)`;
}
if (mode === 'development') manifest.name = `${manifest.name} (Dev)`;

if (target === 'firefox') {
  manifest.background = { scripts: ['background.js'], type: 'module' };
  delete manifest.minimum_chrome_version;
  delete manifest.content_security_policy.extension_pages;
  manifest.content_security_policy.extension_pages = "script-src 'self'; object-src 'none'";
  manifest.browser_specific_settings = {
    gecko: {
      // Placeholder: replace with the add-on id assigned on addons.mozilla.org before publishing.
      id: process.env.SWDE_GECKO_ID ?? 'smart-web-data-extractor@example.invalid',
      strict_min_version: '121.0',
    },
  };
}

await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// Release guard: bundles must not contain dynamic code evaluation, and production bundles must
// not contain the development licensing mock.
async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}
const forbidden = [/\beval\s*\(/, /new Function\s*\(/];
if (mode === 'production')
  forbidden.push(/MockLicenseProvider/, /SWDE-DEV-/, /swde\.dev\.mockKeys/);
const problems = [];
for await (const file of walk(outDir)) {
  if (!/\.(js|html)$/.test(file)) continue;
  const text = await readFile(file, 'utf8');
  for (const re of forbidden) if (re.test(text)) problems.push(`${file}: matches ${re}`);
}
if (problems.length) {
  console.error('Build verification failed:\n' + problems.join('\n'));
  process.exit(1);
}
console.log(`Built ${target} (${mode}) -> ${outDir}`);
