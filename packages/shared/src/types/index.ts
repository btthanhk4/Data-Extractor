import type { z } from 'zod';
import type {
  BackgroundRequestSchema,
  CleaningRulesSchema,
  ColumnDefSchema,
  ColumnSourceSchema,
  ColumnStateSchema,
  ColumnTypeSchema,
  ContentRequestSchema,
  DataColumnSchema,
  DatasetDescriptorSchema,
  DatasetKindSchema,
  DetectedDatasetSchema,
  ExtractedDataSchema,
  FieldAttrSchema,
  HistoryEntrySchema,
  NextControlSchema,
  PageInfoSchema,
  PaginationSettingsSchema,
  PresetFileSchema,
  PresetSchema,
  SessionRecordSchema,
  SettingsSchema,
  ThemeSchema,
  TransformOpSchema,
} from '../schemas';

export type FieldAttr = z.infer<typeof FieldAttrSchema>;
export type ColumnSource = z.infer<typeof ColumnSourceSchema>;
export type ColumnDef = z.infer<typeof ColumnDefSchema>;
export type DatasetKind = z.infer<typeof DatasetKindSchema>;
export type DatasetDescriptor = z.infer<typeof DatasetDescriptorSchema>;
export type DetectedDataset = z.infer<typeof DetectedDatasetSchema>;
export type ColumnType = z.infer<typeof ColumnTypeSchema>;
export type DataColumn = z.infer<typeof DataColumnSchema>;
export type PageInfo = z.infer<typeof PageInfoSchema>;
export type ExtractedData = z.infer<typeof ExtractedDataSchema>;
export type NextControl = z.infer<typeof NextControlSchema>;
export type TransformOp = z.infer<typeof TransformOpSchema>;
export type CleaningRules = z.infer<typeof CleaningRulesSchema>;
export type ColumnState = z.infer<typeof ColumnStateSchema>;
export type PaginationSettings = z.infer<typeof PaginationSettingsSchema>;
export type Preset = z.infer<typeof PresetSchema>;
export type PresetFile = z.infer<typeof PresetFileSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export type ContentRequest = z.infer<typeof ContentRequestSchema>;
export type BackgroundRequest = z.infer<typeof BackgroundRequestSchema>;
export type SessionRecord = z.infer<typeof SessionRecordSchema>;

export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };
