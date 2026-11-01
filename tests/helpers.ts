import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

// Vitest runs from the repo root; jsdom replaces the global URL so avoid import.meta.url here.
const FIXTURES = resolve(process.cwd(), 'tests/fixtures') + '/';

/** Loads a fixture into a jsdom Document. Page scripts are NOT executed. */
export function loadFixture(name: string): Document {
  const html = readFileSync(FIXTURES + name, 'utf8');
  return new JSDOM(html, { url: `https://fixtures.test/${name}` }).window.document;
}

export function htmlDocument(body: string, url = 'https://example.test/page'): Document {
  return new JSDOM(
    `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`,
    {
      url,
    },
  ).window.document;
}

/** A minimal valid preset (raw, pre-schema) shared by tests. */
export const validPreset = {
  id: 'preset_1',
  name: 'Jobs',
  origin: 'https://jobs.example.com',
  descriptor: {
    kind: 'list',
    containerSelector: 'body > ul',
    itemSelector: ':scope > li.job',
    skipLeadingItems: 0,
    itemSignature: 'li.job|H3,SPAN',
    columns: [
      { id: 'c0', name: 'Title', source: { type: 'path', path: ':scope > h3 > a', attr: 'text' } },
    ],
  },
  columns: [{ id: 'c0', name: 'Title', visible: true }],
  cleaning: {},
  pagination: {},
  createdAt: 1,
  updatedAt: 2,
};
