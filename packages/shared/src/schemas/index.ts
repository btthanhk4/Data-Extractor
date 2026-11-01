import { z } from 'zod';
import { LIMITS, PAGINATION_LIMITS } from '../constants';

/**
 * Every object that crosses a trust boundary (content script <-> extension, storage,
 * imported preset files) is validated with these schemas. Zod rebuilds objects with only
 * the declared keys, which also drops `__proto__`/`constructor` payloads.
 */

const shortText = (max: number) => z.string().max(max);

export const SelectorSchema = z
  .string()
  .min(1)
  .max(LIMITS.maxSelectorLength)
  // Selectors are only ever passed to querySelector; still refuse obvious non-selector junk.
  .refine((s) => !/[<{};]/.test(s) && !/javascript:/i.test(s), 'Invalid selector');

/** Relative path from an item to a field. Empty string means "the item itself". */
export const FieldPathSchema = z
  .string()
  .max(LIMITS.maxSelectorLength)
  .refine((s) => !/[<{};]/.test(s) && !/javascript:/i.test(s), 'Invalid field path');

export const FieldAttrSchema = z.enum(['text', 'href', 'src', 'alt', 'title', 'datetime', 'value']);

export const ColumnSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('cell'),
    index: z.number().int().min(0).max(500),
    attr: FieldAttrSchema,
  }),
  z.object({
    type: z.literal('path'),
    path: FieldPathSchema,
    attr: FieldAttrSchema,
    /** Join every match (e.g. a tag list inside a card) instead of reading the first. */
    multi: z.boolean().optional(),
  }),
]);

export const ColumnIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export const ColumnDefSchema = z.object({
  id: ColumnIdSchema,
  name: shortText(200).min(1),
  source: ColumnSourceSchema,
});

export const DatasetKindSchema = z.enum(['table', 'list', 'custom']);

export const DatasetDescriptorSchema = z.object({
  kind: DatasetKindSchema,
  containerSelector: SelectorSchema,
  itemSelector: SelectorSchema,
  skipLeadingItems: z.number().int().min(0).max(50).default(0),
  /** Structural fingerprint used to re-find the dataset when the container selector breaks. */
  itemSignature: shortText(500),
  columns: z.array(ColumnDefSchema).min(1).max(LIMITS.maxColumns),
});

export const CellSchema = z.string().max(LIMITS.maxCellLength);

export const DetectedDatasetSchema = z.object({
  id: shortText(64).min(1),
  label: shortText(200),
  descriptor: DatasetDescriptorSchema,
  rowCount: z.number().int().min(0),
  columnCount: z.number().int().min(0),
  score: z.number(),
  preview: z.array(z.array(CellSchema)).max(LIMITS.previewRows),
});

export const ColumnTypeSchema = z.enum([
  'empty',
  'text',
  'number',
  'currency',
  'percent',
  'date',
  'url',
  'email',
]);

export const DataColumnSchema = z.object({
  id: ColumnIdSchema,
  name: shortText(200).min(1),
});

export const PageInfoSchema = z.object({
  url: z.string().max(4_000),
  title: shortText(1_000),
});

export const ExtractedDataSchema = z.object({
  columns: z.array(DataColumnSchema).max(LIMITS.maxColumns),
  rows: z.array(z.array(CellSchema)).max(LIMITS.maxRows),
  truncated: z.boolean().default(false),
});

export const NextControlSchema = z.object({
  strategy: z.enum(['rel-next', 'text', 'numbered', 'selector']),
  selector: SelectorSchema,
  label: shortText(200),
});

export const TransformOpSchema = z.enum([
  'uppercase',
  'lowercase',
  'titlecase',
  'collapseWhitespace',
  'numbersOnly',
  'stripCurrency',
]);

export const CleaningRulesSchema = z.object({
  trimWhitespace: z.boolean().default(true),
  removeEmptyRows: z.boolean().default(true),
  dedupe: z
    .object({
      enabled: z.boolean().default(false),
      /** Empty = compare entire visible row (Free). Specific columns = Pro. */
      columns: z.array(ColumnIdSchema).max(LIMITS.maxColumns).default([]),
    })
    .default({}),
  normalizeUrls: z.boolean().default(false),
  removeTrackingParams: z.boolean().default(false),
  requireColumns: z.array(ColumnIdSchema).max(LIMITS.maxColumns).default([]),
  transforms: z
    .array(z.object({ columnId: ColumnIdSchema, op: TransformOpSchema }))
    .max(200)
    .default([]),
});

export const ColumnStateSchema = z.object({
  id: ColumnIdSchema,
  name: shortText(200).min(1),
  visible: z.boolean(),
});

export const PaginationSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  maxPages: z
    .number()
    .int()
    .min(PAGINATION_LIMITS.minPages)
    .max(PAGINATION_LIMITS.maxPages)
    .default(PAGINATION_LIMITS.defaultMaxPages),
  delayMs: z
    .number()
    .int()
    .min(PAGINATION_LIMITS.minDelayMs)
    .max(PAGINATION_LIMITS.maxDelayMs)
    .default(PAGINATION_LIMITS.defaultDelayMs),
  next: NextControlSchema.nullable().default(null),
});

export const PresetSchema = z.object({
  id: shortText(64).min(1),
  name: shortText(120).min(1),
  /** Origin only (scheme + host + port). Never full URLs, which may contain personal data. */
  origin: z
    .string()
    .max(300)
    .refine((o) => /^https?:\/\/[^/\s]+$/.test(o), 'Origin must look like https://example.com'),
  descriptor: DatasetDescriptorSchema,
  columns: z.array(ColumnStateSchema).max(LIMITS.maxColumns),
  cleaning: CleaningRulesSchema,
  pagination: PaginationSettingsSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const PresetFileSchema = z.object({
  format: z.literal('swde-presets'),
  version: z.literal(1),
  exportedAt: z.number().int().nonnegative(),
  presets: z.array(PresetSchema).max(LIMITS.maxPresets),
});

export const ThemeSchema = z.enum(['system', 'light', 'dark']);

export const SettingsSchema = z.object({
  theme: ThemeSchema.default('system'),
  csvBom: z.boolean().default(true),
  csvDelimiter: z.enum([',', ';', '\t']).default(','),
  formulaProtection: z.boolean().default(true),
  filenamePattern: shortText(120).min(1).default('{site}-{dataset}-{date}'),
  historyEnabled: z.boolean().default(true),
  defaultTrimWhitespace: z.boolean().default(true),
  defaultRemoveEmptyRows: z.boolean().default(true),
});

export const HistoryEntrySchema = z.object({
  id: shortText(64).min(1),
  at: z.number().int().nonnegative(),
  origin: shortText(300),
  path: shortText(1_000),
  title: shortText(300),
  dataset: shortText(200),
  rows: z.number().int().nonnegative(),
  columns: z.number().int().nonnegative(),
  pages: z.number().int().min(1),
  format: z.enum(['csv', 'xlsx']),
});

/* ----------------------------- Runtime messages ----------------------------- */

export const ContentRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('swde:ping') }),
  z.object({ type: z.literal('swde:detect') }),
  z.object({ type: z.literal('swde:extract'), descriptor: DatasetDescriptorSchema }),
  z.object({ type: z.literal('swde:findNext') }),
  z.object({ type: z.literal('swde:clickNext'), next: NextControlSchema }),
  z.object({ type: z.literal('swde:pickerStart') }),
  z.object({ type: z.literal('swde:pickerStop') }),
]);

export const ErrorResponseSchema = z.object({ ok: z.literal(false), error: shortText(500) });

export const PingResponseSchema = z.object({ ok: z.literal(true), version: shortText(20) });

export const DetectResponseSchema = z.object({
  ok: z.literal(true),
  page: PageInfoSchema,
  datasets: z.array(DetectedDatasetSchema).max(LIMITS.maxDetectedDatasets),
});

export const ExtractResponseSchema = z.object({
  ok: z.literal(true),
  page: PageInfoSchema,
  data: ExtractedDataSchema,
  fingerprint: shortText(128),
  /** True if the container selector failed and the dataset was re-found structurally. */
  resolvedByFallback: z.boolean(),
});

export const FindNextResponseSchema = z.object({
  ok: z.literal(true),
  next: NextControlSchema.nullable(),
});

export const ClickNextResponseSchema = z.object({ ok: z.literal(true), clicked: z.boolean() });

export const AckResponseSchema = z.object({ ok: z.literal(true) });

/** Messages sent from the content script to the background service worker. */
export const BackgroundRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('swde:pickerResult'),
    descriptor: DatasetDescriptorSchema,
    page: PageInfoSchema,
  }),
  z.object({ type: z.literal('swde:pickerCancelled') }),
]);

/** Small hand-off record from popup/background to the dashboard (stored in storage.session). */
export const SessionRecordSchema = z.object({
  id: shortText(64).min(1),
  createdAt: z.number().int().nonnegative(),
  tabId: z.number().int().nonnegative(),
  page: PageInfoSchema,
  label: shortText(200),
  descriptor: DatasetDescriptorSchema,
  presetId: shortText(64).nullable().default(null),
  data: ExtractedDataSchema.nullable().default(null),
  pages: z.number().int().min(1).default(1),
});
