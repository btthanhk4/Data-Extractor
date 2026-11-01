import type { CleaningRules } from '@swde/shared';

export const FEATURES = [
  'detect',
  'single-page',
  'csv-export',
  'basic-dedupe',
  'basic-columns',
  'visual-select',
  'presets',
  'preset-io',
  'xlsx-export',
  'multi-page',
  'advanced-cleaning',
] as const;

export type Feature = (typeof FEATURES)[number];
export type Plan = 'free' | 'pro';

export const FREE_FEATURES: readonly Feature[] = [
  'detect',
  'single-page',
  'csv-export',
  'basic-dedupe',
  'basic-columns',
];

export const PRO_FEATURES: readonly Feature[] = [
  'visual-select',
  'presets',
  'preset-io',
  'xlsx-export',
  'multi-page',
  'advanced-cleaning',
];

export const FEATURE_LABELS: Record<Feature, string> = {
  detect: 'Automatic dataset detection',
  'single-page': 'Single-page extraction',
  'csv-export': 'CSV export',
  'basic-dedupe': 'Remove duplicate rows',
  'basic-columns': 'Rename and hide columns',
  'visual-select': 'Visual element selection',
  presets: 'Saved extraction presets',
  'preset-io': 'Preset import & export',
  'xlsx-export': 'Excel (XLSX) export',
  'multi-page': 'Multi-page extraction',
  'advanced-cleaning': 'Advanced cleaning & column ordering',
};

export function isFeature(value: unknown): value is Feature {
  return typeof value === 'string' && (FEATURES as readonly string[]).includes(value);
}

export interface Entitlements {
  plan: Plan;
  features: ReadonlySet<Feature>;
  has(feature: Feature): boolean;
}

/**
 * The only place that turns license data into feature access. `verifiedFeatures` must come from
 * a signature-verified license token (see LicenseClient); never from a stored flag.
 */
export function resolveEntitlements(verifiedFeatures: readonly Feature[] | null): Entitlements {
  const features = new Set<Feature>(FREE_FEATURES);
  if (verifiedFeatures) for (const f of verifiedFeatures) if (isFeature(f)) features.add(f);
  const plan: Plan = PRO_FEATURES.some((f) => features.has(f)) ? 'pro' : 'free';
  return { plan, features, has: (f) => features.has(f) };
}

export const FREE_ENTITLEMENTS = resolveEntitlements(null);

/**
 * Strips Pro-only cleaning options when the user is not entitled, so a preset or stale UI state
 * can never apply paid rules for free users. Basic dedupe (whole-row) stays available.
 */
export function enforceCleaningRules(rules: CleaningRules, ent: Entitlements): CleaningRules {
  if (ent.has('advanced-cleaning')) return rules;
  return {
    ...rules,
    dedupe: { enabled: rules.dedupe.enabled && ent.has('basic-dedupe'), columns: [] },
    normalizeUrls: false,
    removeTrackingParams: false,
    requireColumns: [],
    transforms: [],
  };
}

export type ExportFormat = 'csv' | 'xlsx';

export function canExport(format: ExportFormat, ent: Entitlements): boolean {
  return format === 'csv' ? ent.has('csv-export') : ent.has('xlsx-export');
}
