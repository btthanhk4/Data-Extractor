import { describe, expect, it } from 'vitest';
import {
  FEATURES,
  FREE_FEATURES,
  PRO_FEATURES,
  canExport,
  enforceCleaningRules,
  resolveEntitlements,
} from '@swde/licensing';
import { defaultCleaningRules } from '@swde/extraction-core';

describe('entitlements', () => {
  it('covers every feature exactly once across plans', () => {
    expect([...FREE_FEATURES, ...PRO_FEATURES].sort()).toEqual([...FEATURES].sort());
  });

  it('gives free users only free features', () => {
    const ent = resolveEntitlements(null);
    expect(ent.plan).toBe('free');
    for (const f of FREE_FEATURES) expect(ent.has(f)).toBe(true);
    for (const f of PRO_FEATURES) expect(ent.has(f)).toBe(false);
  });

  it('grants verified pro features', () => {
    const ent = resolveEntitlements([...PRO_FEATURES]);
    expect(ent.plan).toBe('pro');
    expect(ent.has('xlsx-export')).toBe(true);
    expect(ent.has('csv-export')).toBe(true);
  });

  it('ignores unknown feature names', () => {
    const ent = resolveEntitlements(['everything' as never]);
    expect(ent.plan).toBe('free');
  });

  it('gates export formats', () => {
    expect(canExport('csv', resolveEntitlements(null))).toBe(true);
    expect(canExport('xlsx', resolveEntitlements(null))).toBe(false);
    expect(canExport('xlsx', resolveEntitlements(['xlsx-export']))).toBe(true);
  });

  it('strips pro cleaning rules for free users but keeps basic dedupe', () => {
    const rules = defaultCleaningRules({
      dedupe: { enabled: true, columns: ['c1'] },
      normalizeUrls: true,
      removeTrackingParams: true,
      requireColumns: ['c0'],
      transforms: [{ columnId: 'c0', op: 'uppercase' }],
    });
    const free = enforceCleaningRules(rules, resolveEntitlements(null));
    expect(free.dedupe).toEqual({ enabled: true, columns: [] });
    expect(free.normalizeUrls).toBe(false);
    expect(free.removeTrackingParams).toBe(false);
    expect(free.requireColumns).toEqual([]);
    expect(free.transforms).toEqual([]);
    expect(enforceCleaningRules(rules, resolveEntitlements([...PRO_FEATURES]))).toEqual(rules);
  });
});
