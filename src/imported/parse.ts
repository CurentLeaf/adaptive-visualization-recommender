import { z } from 'zod';
import { deepFreeze, isPlainObject } from './json';
import { timestampField } from './timestamps';
import {
  IMPORT_SCHEMA_VERSION,
  type ExcludedRecord,
  type FileReport,
  type ImportIssue,
  type ImportedDeduction,
  type ImportedFact,
  type ParsedRecord,
  type RecordKind,
} from './types';

const FACT_FIELDS = [
  'fact_id',
  'entity_id',
  'predicate',
  'object_value',
  'as_of',
  'current',
  'valid_from',
  'valid_to',
  'supersedes',
  'superseded_by',
  'supporting_deduction_ids',
  'entity_type',
  'unit',
  'currency',
];
const DEDUCTION_FIELDS = [
  'deduction_id',
  'source_file_path',
  'chunk_id',
  'as_of',
  'subject_entity',
  'subject_entity_type',
  'predicate',
  'object_value',
  'object_type',
  'extraction_method',
  'confidence',
  'provenance',
  'metadata',
  'fact_id',
];

const nonEmptyString = z.string().min(1);
const factRequired = z.looseObject({
  fact_id: nonEmptyString,
  entity_id: nonEmptyString,
  predicate: nonEmptyString,
});
const deductionRequired = z.looseObject({ deduction_id: nonEmptyString });
const stringList = z.union([nonEmptyString, z.array(nonEmptyString)]);
const optional = {
  boolean: z.boolean(),
  string: z.string(),
  number: z.number().finite(),
  ids: stringList,
};

export type ParsedFile = {
  report: Omit<FileReport, 'batchId' | 'path' | 'size' | 'status'> & {
    status: 'processed' | 'error';
  };
  records: ParsedRecord[];
  excluded: ExcludedRecord[];
  issues: ImportIssue[];
};

function toList(value: unknown): string[] {
  if (typeof value === 'string') return value ? [value] : [];
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === 'string' && v !== '');
  return [];
}

const stringOrNull = (value: unknown) => (typeof value === 'string' ? value : null);

/** Normalize one validated raw fact. Raw remains the frozen original. */
function normalizeFact(raw: Record<string, unknown>): ImportedFact {
  const has = (key: string) => Object.hasOwn(raw, key);
  return {
    kind: 'fact',
    factId: raw.fact_id as string,
    entityId: raw.entity_id as string,
    predicate: raw.predicate as string,
    objectValue: raw.object_value,
    asOf: timestampField(has('as_of'), raw.as_of),
    validFrom: timestampField(has('valid_from'), raw.valid_from),
    validTo: timestampField(has('valid_to'), raw.valid_to),
    current: typeof raw.current === 'boolean' ? raw.current : null,
    supersedes: toList(raw.supersedes),
    supersededBy: toList(raw.superseded_by),
    supportingDeductionIds: toList(raw.supporting_deduction_ids),
    entityType: typeof raw.entity_type === 'string' && raw.entity_type ? raw.entity_type : null,
    unit: typeof raw.unit === 'string' && raw.unit.trim() ? raw.unit : null,
    currency: typeof raw.currency === 'string' && raw.currency.trim() ? raw.currency : null,
    unknownFields: Object.keys(raw)
      .filter((key) => !FACT_FIELDS.includes(key))
      .sort(),
    raw,
    occurrences: [],
  };
}

function normalizeDeduction(raw: Record<string, unknown>): ImportedDeduction {
  const provenance = isPlainObject(raw.provenance) ? raw.provenance : null;
  return {
    kind: 'deduction',
    deductionId: raw.deduction_id as string,
    sourceFilePath: stringOrNull(raw.source_file_path),
    chunkId: stringOrNull(raw.chunk_id),
    asOf: timestampField(Object.hasOwn(raw, 'as_of'), raw.as_of),
    subjectEntity: stringOrNull(raw.subject_entity),
    subjectEntityType: stringOrNull(raw.subject_entity_type),
    predicate: stringOrNull(raw.predicate),
    hasObjectValue: Object.hasOwn(raw, 'object_value'),
    objectValue: raw.object_value,
    objectType: stringOrNull(raw.object_type),
    extractionMethod: stringOrNull(raw.extraction_method),
    confidence:
      typeof raw.confidence === 'number' && Number.isFinite(raw.confidence) ? raw.confidence : null,
    provenance: provenance
      ? {
          extractionPath: stringOrNull(provenance.extraction_path),
          modelUsed: stringOrNull(provenance.model_used),
          rawText: stringOrNull(provenance.raw_text),
        }
      : null,
    metadata: isPlainObject(raw.metadata) ? raw.metadata : null,
    factId: typeof raw.fact_id === 'string' && raw.fact_id ? raw.fact_id : null,
    unknownFields: Object.keys(raw)
      .filter((key) => !DEDUCTION_FIELDS.includes(key))
      .sort(),
    raw,
    occurrences: [],
  };
}

/** Records are classified by structure (identifying field), never by file name. */
export function classifyRecord(value: unknown): RecordKind | 'ambiguous' | null {
  if (!isPlainObject(value)) return null;
  const hasFact = Object.hasOwn(value, 'fact_id');
  const hasDeduction = Object.hasOwn(value, 'deduction_id');
  // fact_id on a deduction is the optional evidence extension; a fact record with entity_id
  // that also carries deduction_id cannot be classified safely.
  if (hasFact && hasDeduction) return Object.hasOwn(value, 'entity_id') ? 'ambiguous' : 'deduction';
  return hasFact ? 'fact' : hasDeduction ? 'deduction' : null;
}

function validateOptional(
  raw: Record<string, unknown>,
  kind: RecordKind,
  push: (severity: ImportIssue['severity'], code: string, message: string, field: string) => void,
) {
  const check = (field: string, schema: z.ZodType, expect: string) => {
    if (Object.hasOwn(raw, field) && raw[field] !== null && !schema.safeParse(raw[field]).success)
      push(
        'warning',
        'unexpected_field_type',
        `${field} should be ${expect}; value kept unknown.`,
        field,
      );
  };
  check('as_of', optional.string, 'a string');
  if (kind === 'fact') {
    check('current', optional.boolean, 'a boolean');
    for (const f of ['valid_from', 'valid_to']) check(f, optional.string, 'a string');
    for (const f of ['supersedes', 'superseded_by', 'supporting_deduction_ids'])
      check(f, optional.ids, 'a string or array of strings');
    for (const f of ['entity_type', 'unit', 'currency']) check(f, optional.string, 'a string');
    if (!Object.hasOwn(raw, 'object_value'))
      push(
        'error',
        'missing_object_value',
        'object_value is required (null is allowed).',
        'object_value',
      );
  } else {
    check('confidence', optional.number, 'a finite number');
    for (const f of [
      'source_file_path',
      'chunk_id',
      'subject_entity',
      'subject_entity_type',
      'predicate',
      'object_type',
      'extraction_method',
      'fact_id',
    ])
      check(f, optional.string, 'a string');
    for (const f of ['provenance', 'metadata'])
      if (Object.hasOwn(raw, f) && raw[f] !== null && !isPlainObject(raw[f]))
        push(
          'warning',
          'unexpected_field_type',
          `${f} should be an object; value kept unknown.`,
          f,
        );
  }
}

export function parseJsonContent(batchId: string, filePath: string, text: string): ParsedFile {
  const issues: ImportIssue[] = [];
  const excluded: ExcludedRecord[] = [];
  const records: ParsedRecord[] = [];
  const report: ParsedFile['report'] = {
    status: 'processed',
    structure: 'none',
    schemaVersion: null,
    envelopeExtras: {},
    recordsFound: 0,
    recordsAccepted: 0,
  };
  const fail = (code: string, message: string): ParsedFile => {
    report.status = 'error';
    issues.push({ severity: 'error', code, message, filePath, location: '$' });
    return { report, records, excluded, issues };
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (error) {
    const hint = filePath.toLowerCase().endsWith('.txt')
      ? ' TXT files must contain supported JSON; prose is not converted into records.'
      : '';
    return fail('malformed_json', `Not valid JSON (${(error as Error).message}).${hint}`);
  }

  let candidates: { value: unknown; location: string }[] = [];
  if (Array.isArray(parsed)) {
    report.structure = 'array';
    candidates = parsed.map((value, index) => ({ value, location: `$[${index}]` }));
  } else if (isPlainObject(parsed)) {
    const hasLists = Array.isArray(parsed.facts) || Array.isArray(parsed.deductions);
    const looksLikeEnvelope =
      Object.hasOwn(parsed, 'facts') ||
      Object.hasOwn(parsed, 'deductions') ||
      Object.hasOwn(parsed, 'schema_version');
    if (looksLikeEnvelope && classifyRecord(parsed) === null) {
      report.structure = 'envelope';
      const version = parsed.schema_version;
      report.schemaVersion = typeof version === 'string' ? version : null;
      if (version === undefined)
        issues.push({
          severity: 'warning',
          code: 'unversioned_envelope',
          message: `Envelope has no schema_version; expected "${IMPORT_SCHEMA_VERSION}".`,
          filePath,
          location: '$',
        });
      else if (version !== IMPORT_SCHEMA_VERSION)
        return fail(
          'unsupported_schema_version',
          `schema_version ${JSON.stringify(version)} is not supported; expected "${IMPORT_SCHEMA_VERSION}".`,
        );
      for (const [key, value] of Object.entries(parsed))
        if (key !== 'facts' && key !== 'deductions') report.envelopeExtras[key] = value;
      if (!hasLists) return fail('empty_envelope', 'Envelope has no facts or deductions array.');
      for (const list of ['facts', 'deductions'] as const) {
        if (!Object.hasOwn(parsed, list)) continue;
        const items = parsed[list];
        if (!Array.isArray(items)) {
          issues.push({
            severity: 'error',
            code: 'invalid_list',
            message: `${list} must be an array.`,
            filePath,
            location: `$.${list}`,
          });
          continue;
        }
        items.forEach((value, index) =>
          candidates.push({ value, location: `$.${list}[${index}]` }),
        );
      }
    } else {
      report.structure = 'record';
      candidates = [{ value: parsed, location: '$' }];
    }
  } else {
    return fail(
      'unrecognized_structure',
      'JSON must be an object, an array of records, or an envelope.',
    );
  }

  report.recordsFound = candidates.length;
  for (const { value, location } of candidates) {
    const kind = classifyRecord(value);
    const reject = (code: string, message: string, id?: string, k?: RecordKind) => {
      excluded.push({ kind: k, id, filePath, location, code, message });
      issues.push({ severity: 'error', code, message, filePath, location, recordId: id, kind: k });
    };
    if (kind === null || kind === 'ambiguous') {
      reject(
        kind === 'ambiguous' ? 'ambiguous_record_type' : 'unrecognized_record',
        kind === 'ambiguous'
          ? 'Record has both fact_id and deduction_id with entity_id; type cannot be determined.'
          : 'Record has neither fact_id nor deduction_id.',
      );
      continue;
    }
    const raw = value as Record<string, unknown>;
    const required = (kind === 'fact' ? factRequired : deductionRequired).safeParse(raw);
    if (!required.success) {
      const detail = required.error.issues
        .map((issue) => `${issue.path.join('.') || '(record)'}: ${issue.message}`)
        .join('; ');
      reject(
        'invalid_record',
        `Missing or invalid required field(s) — ${detail}`,
        typeof raw[`${kind}_id`] === 'string' ? (raw[`${kind}_id`] as string) : undefined,
        kind,
      );
      continue;
    }
    const id = raw[`${kind}_id`] as string;
    let rejected = false;
    validateOptional(raw, kind, (severity, code, message, field) => {
      issues.push({
        severity,
        code,
        message,
        filePath,
        location: `${location}.${field}`,
        recordId: id,
        kind,
      });
      if (severity === 'error') {
        rejected = true;
        excluded.push({ kind, id, filePath, location, code, message });
      }
    });
    if (rejected) continue;
    const frozen = deepFreeze(structuredClone(raw));
    const record = kind === 'fact' ? normalizeFact(frozen) : normalizeDeduction(frozen);
    const occurrence = { batchId, filePath, location };
    record.occurrences = [occurrence];
    records.push({ record, occurrence });
    report.recordsAccepted += 1;
  }
  return { report, records, excluded, issues };
}
