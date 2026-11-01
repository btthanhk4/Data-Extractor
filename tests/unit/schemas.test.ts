import { describe, expect, it } from 'vitest';
import {
  ContentRequestSchema,
  PresetFileSchema,
  PresetSchema,
  SettingsSchema,
  formatFilename,
  safeHttpUrl,
  safeJsonParse,
  sanitizeFilename,
} from '@swde/shared';
import { validPreset } from '../helpers';

describe('preset validation', () => {
  it('accepts a valid preset and fills defaults', () => {
    const parsed = PresetSchema.parse(validPreset);
    expect(parsed.cleaning.trimWhitespace).toBe(true);
    expect(parsed.pagination.maxPages).toBe(10);
  });

  it('rejects script-like selectors and bad origins', () => {
    const bad = structuredClone(validPreset);
    bad.descriptor.containerSelector = 'div{}</style><script>';
    expect(PresetSchema.safeParse(bad).success).toBe(false);
    const badPath = structuredClone(validPreset);
    badPath.descriptor.columns[0]!.source.path = 'javascript:alert(1)';
    expect(PresetSchema.safeParse(badPath).success).toBe(false);
    expect(PresetSchema.safeParse({ ...validPreset, origin: 'javascript:alert(1)' }).success).toBe(
      false,
    );
    expect(
      PresetSchema.safeParse({ ...validPreset, origin: 'https://a.example/path' }).success,
    ).toBe(false);
  });

  it('rejects out-of-range pagination settings', () => {
    expect(PresetSchema.safeParse({ ...validPreset, pagination: { maxPages: 5000 } }).success).toBe(
      false,
    );
    expect(PresetSchema.safeParse({ ...validPreset, pagination: { delayMs: 10 } }).success).toBe(
      false,
    );
  });

  it('strips unknown keys (no executable payloads survive)', () => {
    const parsed = PresetSchema.parse({
      ...validPreset,
      onLoad: 'alert(1)',
      script: 'x',
    }) as Record<string, unknown>;
    expect(parsed.onLoad).toBeUndefined();
    expect(parsed.script).toBeUndefined();
  });

  it('validates preset files', () => {
    expect(
      PresetFileSchema.safeParse({
        format: 'swde-presets',
        version: 1,
        exportedAt: 0,
        presets: [validPreset],
      }).success,
    ).toBe(true);
    expect(
      PresetFileSchema.safeParse({ format: 'other', version: 1, exportedAt: 0, presets: [] })
        .success,
    ).toBe(false);
  });
});

describe('safeJsonParse', () => {
  it('drops prototype-pollution keys at every depth', () => {
    const parsed = safeJsonParse(
      '{"a":1,"__proto__":{"polluted":true},"nested":{"constructor":{"prototype":{"x":1}},"ok":2}}',
    ) as Record<string, unknown>;
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(false);
    expect(parsed.nested).toEqual({ ok: 2 });
  });
});

describe('runtime message validation', () => {
  it('accepts known requests only', () => {
    expect(ContentRequestSchema.safeParse({ type: 'swde:detect' }).success).toBe(true);
    expect(ContentRequestSchema.safeParse({ type: 'swde:eval', code: '1' }).success).toBe(false);
    expect(ContentRequestSchema.safeParse({ type: 'swde:extract' }).success).toBe(false);
    expect(ContentRequestSchema.safeParse('swde:detect').success).toBe(false);
  });
});

describe('settings', () => {
  it('has privacy-friendly defaults', () => {
    const s = SettingsSchema.parse({});
    expect(s).toMatchObject({ csvBom: true, formulaProtection: true, theme: 'system' });
  });
});

describe('utils', () => {
  it('sanitizes filenames', () => {
    expect(sanitizeFilename('a/b:c*?"<>|.csv')).toBe('a-b-c-.csv');
    expect(sanitizeFilename('CON')).toBe('data');
    expect(sanitizeFilename('...')).toBe('data');
  });

  it('formats filename patterns', () => {
    const date = new Date(2026, 9, 5, 7, 8, 9);
    expect(
      formatFilename('{site}-{dataset}-{date}', {
        url: 'https://www.shop.example.com/x',
        dataset: 'Top Products',
        date,
      }),
    ).toBe('shop.example.com-top-products-2026-10-05');
    expect(formatFilename('{time}', { url: 'nope', dataset: 'x', date })).toBe('070809');
  });

  it('accepts only http(s) URLs', () => {
    expect(safeHttpUrl('/a', 'https://b.example/c')).toBe('https://b.example/a');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,x')).toBeNull();
    expect(safeHttpUrl('not a url')).toBeNull();
  });
});
