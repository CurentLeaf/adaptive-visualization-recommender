/**
 * Dedicated types for browser-local imported temporal facts and extraction deductions.
 * These are intentionally separate from the Cedar Watch `Report` types: no Report field is
 * ever fabricated for imported data.
 */
export const IMPORT_SCHEMA_VERSION = 'avr-import/1';

export type RecordKind = 'fact' | 'deduction';
export type Origin = 'supplied' | 'inferred' | 'user_configured' | 'default';
export type IssueSeverity = 'error' | 'warning' | 'info';

export type SourceOccurrence = { batchId: string; filePath: string; location: string };

export type ImportIssue = {
  severity: IssueSeverity;
  code: string;
  message: string;
  filePath: string;
  location: string;
  recordId?: string;
  kind?: RecordKind;
};

export type ExcludedRecord = {
  kind?: RecordKind;
  id?: string;
  filePath: string;
  location: string;
  code: string;
  message: string;
};

export type ParsedTimestamp =
  | { status: 'valid'; epochMs: number; offset: string }
  | { status: 'ambiguous_timezone'; reason: 'no_offset' | 'date_only' }
  | { status: 'invalid'; reason: string };

/** A timestamp field keeps the original string and distinguishes missing from explicit null. */
export type TimestampField =
  | { state: 'missing' }
  | { state: 'null' }
  | { state: 'value'; raw: string; parsed: ParsedTimestamp }
  | { state: 'invalid_type'; raw: unknown };

export type ImportedFact = {
  kind: 'fact';
  factId: string;
  entityId: string;
  predicate: string;
  /** Exact supplied object_value; never coerced. */
  objectValue: unknown;
  asOf: TimestampField;
  validFrom: TimestampField;
  validTo: TimestampField;
  /** Upstream `current` flag; null when missing or not a boolean. */
  current: boolean | null;
  supersedes: string[];
  supersededBy: string[];
  supportingDeductionIds: string[];
  /** Optional local extensions; null means not supplied. */
  entityType: string | null;
  unit: string | null;
  currency: string | null;
  unknownFields: string[];
  /** Immutable original record. */
  raw: Readonly<Record<string, unknown>>;
  occurrences: SourceOccurrence[];
};

export type ImportedDeduction = {
  kind: 'deduction';
  deductionId: string;
  /** Inert provenance text; never fetched or opened. */
  sourceFilePath: string | null;
  chunkId: string | null;
  asOf: TimestampField;
  subjectEntity: string | null;
  subjectEntityType: string | null;
  predicate: string | null;
  hasObjectValue: boolean;
  objectValue: unknown;
  objectType: string | null;
  extractionMethod: string | null;
  /** Extraction confidence only; not reliability, truth or corroboration. */
  confidence: number | null;
  provenance: {
    extractionPath: string | null;
    modelUsed: string | null;
    rawText: string | null;
  } | null;
  metadata: Readonly<Record<string, unknown>> | null;
  factId: string | null;
  unknownFields: string[];
  raw: Readonly<Record<string, unknown>>;
  occurrences: SourceOccurrence[];
};

export type ImportedRecord = ImportedFact | ImportedDeduction;

export type ParsedRecord = {
  record: ImportedRecord;
  occurrence: SourceOccurrence;
};

export type FileStatus = 'processed' | 'unsupported' | 'skipped_limit' | 'error' | 'cancelled';

export type FileReport = {
  batchId: string;
  path: string;
  size: number;
  status: FileStatus;
  structure: 'envelope' | 'array' | 'record' | 'none';
  schemaVersion: string | null;
  envelopeExtras: Record<string, unknown>;
  recordsFound: number;
  recordsAccepted: number;
  note?: string;
};

export type ImportLimits = {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxRecords: number;
};

export const DEFAULT_LIMITS: ImportLimits = {
  maxFiles: 200,
  maxFileBytes: 5 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  maxRecords: 100_000,
};

export type InputFile = {
  /** Relative browser path when available (webkitRelativePath), otherwise the file name. */
  path: string;
  size: number;
  read: () => Promise<string>;
};

export type BatchCounts = {
  discovered: number;
  processed: number;
  supported: number;
  unsupported: number;
  skippedLimit: number;
  failed: number;
};

export type BatchResult = {
  batchId: string;
  label: string;
  files: FileReport[];
  records: ParsedRecord[];
  excluded: ExcludedRecord[];
  issues: ImportIssue[];
  counts: BatchCounts;
};

export type RecordVariant = {
  kind: RecordKind;
  id: string;
  contentKey: string;
  record: ImportedRecord;
};

export type Collision = {
  kind: RecordKind;
  id: string;
  variants: {
    contentKey: string;
    raw: Readonly<Record<string, unknown>>;
    occurrences: SourceOccurrence[];
  }[];
};

export type DuplicateReport = { kind: RecordKind; id: string; occurrences: SourceOccurrence[] };

export type BatchMeta = {
  batchId: string;
  label: string;
  fileCount: number;
  mode: 'replace' | 'append';
};

// ---- settings ----
export type EndpointConvention =
  | 'unspecified'
  | 'inclusive_start_exclusive_end'
  | 'inclusive_both'
  | 'exclusive_start_inclusive_end'
  | 'exclusive_both';
export type NullEndpointMeaning = 'unconfirmed' | 'open_ended' | 'unknown';
export type MissingEndpointPolicy = 'unresolved' | 'treat_as_open';
export type TimestampSelection = 'as_of' | 'valid_from' | 'valid_to';

export type TemporalConfig = {
  asOfMeaning: string;
  currentFlagMeaning: string;
  intervalsConfirmed: boolean;
  endpointConvention: EndpointConvention;
  nullValidTo: NullEndpointMeaning;
  nullValidFrom: NullEndpointMeaning;
  missingEndpointPolicy: MissingEndpointPolicy;
  referenceTime: string;
  timestampField: TimestampSelection;
  origins: Record<string, Origin>;
};

export type TypeReview = {
  /** Reviewed type for every value of the predicate. */
  type: 'numeric' | 'nonnumeric';
  origin: Origin;
};

export type ImportedSettings = {
  temporal: TemporalConfig;
  /** Predicate -> topic label. Empty by default; no invented classifications. */
  topicMap: Record<string, string>;
  typeReview: Record<string, TypeReview>;
  /** Predicate -> explicit user-configured unit label. */
  unitOverrides: Record<string, string>;
};

export type ImportedDataset = {
  dataset: 'imported';
  id: string;
  label: string;
  synthetic: boolean;
  batches: BatchMeta[];
  files: FileReport[];
  variants: RecordVariant[];
  facts: ImportedFact[];
  deductions: ImportedDeduction[];
  collisions: Collision[];
  duplicates: DuplicateReport[];
  excluded: ExcludedRecord[];
  issues: ImportIssue[];
  settings: ImportedSettings;
};
