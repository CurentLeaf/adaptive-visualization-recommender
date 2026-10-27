import { compareCodepoint, stableStringify } from './json';
import { parseJsonContent } from './parse';
import { defaultSettings } from './settings';
import {
  DEFAULT_LIMITS,
  type BatchCounts,
  type BatchResult,
  type Collision,
  type DuplicateReport,
  type ExcludedRecord,
  type FileReport,
  type ImportIssue,
  type ImportLimits,
  type ImportedDataset,
  type InputFile,
  type ParsedRecord,
  type RecordVariant,
  type SourceOccurrence,
} from './types';

export type CancelToken = { cancelled: boolean };
export type ImportProgress = { done: number; total: number; path: string };

const SUPPORTED = ['.json', '.txt'];
export const isSupportedPath = (path: string) =>
  SUPPORTED.some((ext) => path.toLowerCase().endsWith(ext));

const byPath = (a: { path: string }, b: { path: string }) => compareCodepoint(a.path, b.path);

export function normalizeLimits(limits: Partial<ImportLimits> | undefined): ImportLimits {
  const out = { ...DEFAULT_LIMITS };
  for (const key of Object.keys(out) as (keyof ImportLimits)[]) {
    const value = limits?.[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 1)
      out[key] = Math.floor(value);
  }
  return out;
}

const textBytes = (text: string) => new TextEncoder().encode(text).length;

/**
 * Reads and validates files in a deterministic (path-sorted) order, so limits and results do not
 * depend on the order in which the browser supplied files. Returns null when cancelled; nothing
 * is activated by this function.
 */
export async function processFiles(
  inputs: InputFile[],
  options: {
    batchId: string;
    label: string;
    limits?: Partial<ImportLimits>;
    token?: CancelToken;
    onProgress?: (progress: ImportProgress) => void;
  },
): Promise<BatchResult | null> {
  const { batchId, token, onProgress } = options;
  const limits = normalizeLimits(options.limits);
  const files: FileReport[] = [];
  const records: ParsedRecord[] = [];
  const excluded: ExcludedRecord[] = [];
  const issues: ImportIssue[] = [];
  const sorted = [...inputs].sort((a, b) => byPath(a, b) || a.size - b.size);
  const counts: BatchCounts = {
    discovered: sorted.length,
    processed: 0,
    supported: 0,
    unsupported: 0,
    skippedLimit: 0,
    failed: 0,
  };
  const base = {
    batchId,
    structure: 'none' as const,
    schemaVersion: null,
    envelopeExtras: {},
    recordsFound: 0,
    recordsAccepted: 0,
  };
  let supportedSeen = 0;
  let totalBytes = 0;
  let recordCount = 0;
  let done = 0;

  for (const input of sorted) {
    if (token?.cancelled) return null;
    onProgress?.({ done, total: sorted.length, path: input.path });
    const skip = (status: 'unsupported' | 'skipped_limit', code: string, note: string) => {
      files.push({ ...base, path: input.path, size: input.size, status, note });
      issues.push({
        severity: status === 'unsupported' ? 'info' : 'warning',
        code,
        message: note,
        filePath: input.path,
        location: '$',
      });
    };
    if (!isSupportedPath(input.path)) {
      counts.unsupported += 1;
      skip(
        'unsupported',
        'unsupported_file',
        'Unsupported file type skipped without being read (only .json and .txt containing JSON are supported).',
      );
    } else if (++supportedSeen > limits.maxFiles) {
      counts.supported += 1;
      counts.skippedLimit += 1;
      skip(
        'skipped_limit',
        'file_count_limit',
        `Skipped: more than ${limits.maxFiles} supported files.`,
      );
    } else if (input.size > limits.maxFileBytes) {
      counts.supported += 1;
      counts.skippedLimit += 1;
      skip(
        'skipped_limit',
        'file_size_limit',
        `Skipped: ${input.size} bytes exceeds the ${limits.maxFileBytes}-byte per-file limit.`,
      );
    } else if (totalBytes + input.size > limits.maxTotalBytes) {
      counts.supported += 1;
      counts.skippedLimit += 1;
      skip(
        'skipped_limit',
        'total_size_limit',
        `Skipped: would exceed the ${limits.maxTotalBytes}-byte total limit.`,
      );
    } else {
      counts.supported += 1;
      let text: string;
      try {
        text = await input.read();
      } catch (error) {
        if (token?.cancelled) return null;
        counts.failed += 1;
        files.push({
          ...base,
          path: input.path,
          size: input.size,
          status: 'error',
          note: 'File could not be read.',
        });
        issues.push({
          severity: 'error',
          code: 'read_failed',
          message: `File could not be read: ${(error as Error).message}`,
          filePath: input.path,
          location: '$',
        });
        done += 1;
        continue;
      }
      if (token?.cancelled) return null;
      totalBytes += input.size;
      if (textBytes(text) > limits.maxFileBytes) {
        counts.skippedLimit += 1;
        skip(
          'skipped_limit',
          'file_size_limit',
          `Skipped: content exceeds the ${limits.maxFileBytes}-byte per-file limit.`,
        );
      } else {
        const parsed = parseJsonContent(batchId, input.path, text);
        let accepted = parsed.records;
        const room = limits.maxRecords - recordCount;
        let note: string | undefined;
        if (accepted.length > room) {
          note = `Record limit ${limits.maxRecords} reached; ${accepted.length - room} record(s) not imported.`;
          for (const item of accepted.slice(room))
            excluded.push({
              kind: item.record.kind,
              id: item.record.kind === 'fact' ? item.record.factId : item.record.deductionId,
              filePath: item.occurrence.filePath,
              location: item.occurrence.location,
              code: 'record_limit',
              message: note,
            });
          issues.push({
            severity: 'warning',
            code: 'record_limit',
            message: note,
            filePath: input.path,
            location: '$',
          });
          accepted = accepted.slice(0, room);
        }
        recordCount += accepted.length;
        records.push(...accepted);
        excluded.push(...parsed.excluded);
        issues.push(...parsed.issues);
        if (parsed.report.status === 'error') counts.failed += 1;
        else counts.processed += 1;
        files.push({
          ...parsed.report,
          batchId,
          path: input.path,
          size: input.size,
          recordsAccepted: accepted.length,
          note,
        });
      }
    }
    done += 1;
  }
  onProgress?.({ done, total: sorted.length, path: '' });
  if (token?.cancelled) return null;
  return { batchId, label: options.label, files, records, excluded, issues, counts };
}

let counter = 0;

const occurrenceKey = (o: SourceOccurrence) => `${o.filePath}\u0000${o.location}\u0000${o.batchId}`;
const compareOccurrence = (a: SourceOccurrence, b: SourceOccurrence) =>
  compareCodepoint(a.filePath, b.filePath) ||
  compareCodepoint(a.location, b.location) ||
  compareCodepoint(a.batchId, b.batchId);

const idOf = (record: ParsedRecord['record']) =>
  record.kind === 'fact' ? record.factId : record.deductionId;

/**
 * Deterministic merge: records are grouped by (kind, id). Identical content collapses into one
 * variant with every source occurrence preserved. Differing content under one id quarantines every
 * variant (none is chosen by file order, batch order or append order).
 */
export function mergeRecords(
  existing: RecordVariant[],
  incoming: ParsedRecord[],
): { variants: RecordVariant[]; collisions: Collision[]; duplicates: DuplicateReport[] } {
  const map = new Map<string, RecordVariant>();
  const add = (record: ParsedRecord['record'], occurrences: SourceOccurrence[]) => {
    const contentKey = stableStringify(record.raw);
    const key = `${record.kind}\u0000${idOf(record)}\u0000${contentKey}`;
    const found = map.get(key);
    if (found) {
      const seen = new Set(found.record.occurrences.map(occurrenceKey));
      for (const o of occurrences)
        if (!seen.has(occurrenceKey(o))) found.record.occurrences.push(o);
    } else {
      map.set(key, {
        kind: record.kind,
        id: idOf(record),
        contentKey,
        record: { ...record, occurrences: [...occurrences] } as ParsedRecord['record'],
      });
    }
  };
  for (const variant of existing) add(variant.record, variant.record.occurrences);
  for (const item of incoming) add(item.record, [item.occurrence]);
  const variants = [...map.values()].sort(
    (a, b) =>
      compareCodepoint(a.kind, b.kind) ||
      compareCodepoint(a.id, b.id) ||
      compareCodepoint(a.contentKey, b.contentKey),
  );
  for (const variant of variants) variant.record.occurrences.sort(compareOccurrence);
  const groups = new Map<string, RecordVariant[]>();
  for (const variant of variants) {
    const key = `${variant.kind}\u0000${variant.id}`;
    groups.set(key, [...(groups.get(key) ?? []), variant]);
  }
  const collisions: Collision[] = [];
  const duplicates: DuplicateReport[] = [];
  for (const group of groups.values()) {
    if (group.length > 1)
      collisions.push({
        kind: group[0].kind,
        id: group[0].id,
        variants: group.map((v) => ({
          contentKey: v.contentKey,
          raw: v.record.raw,
          occurrences: v.record.occurrences,
        })),
      });
    else if (group[0].record.occurrences.length > 1)
      duplicates.push({
        kind: group[0].kind,
        id: group[0].id,
        occurrences: group[0].record.occurrences,
      });
  }
  return { variants, collisions, duplicates };
}

/** Pure: builds the dataset that activation would produce, without touching any active dataset. */
export function buildDataset(options: {
  base?: ImportedDataset | null;
  mode: 'append' | 'replace';
  batch: BatchResult;
  synthetic?: boolean;
  label?: string;
}): ImportedDataset {
  const { base, mode, batch } = options;
  const append = mode === 'append' && !!base;
  const prior = append ? base : null;
  const { variants, collisions, duplicates } = mergeRecords(prior?.variants ?? [], batch.records);
  const colliding = new Set(collisions.map((c) => `${c.kind}\u0000${c.id}`));
  const active = variants.filter((v) => !colliding.has(`${v.kind}\u0000${v.id}`));
  const files = [...(prior?.files ?? []), ...batch.files].sort(
    (a, b) => compareCodepoint(a.batchId, b.batchId) || byPath(a, b),
  );
  return {
    dataset: 'imported',
    id: prior ? prior.id : `imported-${++counter}`,
    label: options.label ?? batch.label,
    synthetic: (prior?.synthetic ?? true) && (options.synthetic ?? false),
    batches: [
      ...(prior?.batches ?? []),
      {
        batchId: batch.batchId,
        label: batch.label,
        fileCount: batch.files.length,
        mode: append ? 'append' : 'replace',
      },
    ],
    files,
    variants,
    facts: active.filter((v) => v.kind === 'fact').map((v) => v.record as never),
    deductions: active.filter((v) => v.kind === 'deduction').map((v) => v.record as never),
    collisions,
    duplicates,
    excluded: [...(prior?.excluded ?? []), ...batch.excluded],
    issues: [...(prior?.issues ?? []), ...batch.issues],
    settings: prior ? prior.settings : defaultSettings(),
  };
}

export const nextBatchId = (base: ImportedDataset | null | undefined) =>
  `batch-${(base?.batches.length ?? 0) + 1}`;

/** A batch is synthetic only when every processed file's envelope declares `synthetic: true`. */
export const isSyntheticBatch = (batch: BatchResult) => {
  const processed = batch.files.filter((f) => f.status === 'processed');
  return processed.length > 0 && processed.every((f) => f.envelopeExtras.synthetic === true);
};

/** Wraps in-memory text (editor/templates) as an input file with a pseudo path. */
export function textInput(path: string, text: string): InputFile {
  return { path, size: textBytes(text), read: () => Promise.resolve(text) };
}
