import { compareCodepoint } from './json';
import { epochOf } from './timestamps';
import { fieldOf } from './temporal';
import type { EvidenceIndex } from './links';
import type { ImportedFact, ImportedSettings, TimestampSelection } from './types';

export type NumericConversion =
  | { ok: true; value: number; via: 'json_number' | 'strict_decimal_string' }
  | { ok: false; reason: string };

const STRICT_DECIMAL = /^-?(0|[1-9]\d*)(\.\d+)?$/;
const IDENTIFIER_PREDICATE = /(^|[_\s.-])id$/i;

/**
 * Type-aware, conservative conversion. object_value is never modified; this only produces a
 * separate normalized number. Null and empty values are never zero; ambiguous strings and
 * identifier-like predicates are rejected.
 */
export function convertNumeric(value: unknown, predicate: string): NumericConversion {
  if (IDENTIFIER_PREDICATE.test(predicate))
    return { ok: false, reason: 'Identifier-like predicate' };
  if (value === null) return { ok: false, reason: 'null is not zero' };
  if (typeof value === 'number')
    return Number.isFinite(value)
      ? { ok: true, value, via: 'json_number' }
      : { ok: false, reason: 'Not finite' };
  if (typeof value === 'string') {
    if (value.trim() === '') return { ok: false, reason: 'Empty value is not zero' };
    if (STRICT_DECIMAL.test(value))
      return { ok: true, value: Number(value), via: 'strict_decimal_string' };
    return {
      ok: false,
      reason:
        'Ambiguous string (no separators, units, symbols, leading zeros or exponents accepted)',
    };
  }
  return { ok: false, reason: `${Array.isArray(value) ? 'Array' : typeof value} is not a number` };
}

export type TypeProposal = {
  predicate: string;
  total: number;
  convertible: number;
  proposed: 'numeric' | 'nonnumeric' | 'mixed';
  review: 'unreviewed' | 'numeric' | 'nonnumeric';
  reviewOrigin: 'inferred' | 'user_configured';
  linkedObjectTypes: string[];
};

/** Inferred types are only proposals until a user reviews them in settings. */
export function proposeTypes(
  facts: ImportedFact[],
  settings: ImportedSettings,
  evidence: EvidenceIndex,
  deductionTypes: Map<string, string | null>,
): TypeProposal[] {
  const groups = new Map<string, ImportedFact[]>();
  for (const f of facts) groups.set(f.predicate, [...(groups.get(f.predicate) ?? []), f]);
  return [...groups.entries()]
    .sort(([a], [b]) => compareCodepoint(a, b))
    .map(([predicate, list]) => {
      const convertible = list.filter((f) => convertNumeric(f.objectValue, predicate).ok).length;
      const review = settings.typeReview[predicate];
      const linked = new Set<string>();
      for (const f of list)
        for (const l of evidence.byFact.get(f.factId) ?? []) {
          const t = deductionTypes.get(l.deductionId);
          if (t) linked.add(t);
        }
      return {
        predicate,
        total: list.length,
        convertible,
        proposed:
          convertible === list.length ? 'numeric' : convertible === 0 ? 'nonnumeric' : 'mixed',
        review: review ? review.type : 'unreviewed',
        reviewOrigin: review ? 'user_configured' : 'inferred',
        linkedObjectTypes: [...linked].sort(compareCodepoint),
      };
    });
}

export const UNKNOWN_UNIT = 'Unknown unit';
export type UnitInfo = {
  key: string;
  label: string;
  known: boolean;
  origin: 'supplied' | 'user_configured' | 'unknown';
};

/** Units come only from explicit fact fields or a user-configured predicate unit; never from predicates or values. */
export function unitOf(fact: ImportedFact, settings: ImportedSettings): UnitInfo {
  if (fact.unit || fact.currency) {
    const label = [fact.unit, fact.currency ? `currency ${fact.currency}` : null]
      .filter(Boolean)
      .join(' / ');
    return { key: label, label, known: true, origin: 'supplied' };
  }
  const override = settings.unitOverrides[fact.predicate]?.trim();
  if (override) return { key: override, label: override, known: true, origin: 'user_configured' };
  return { key: UNKNOWN_UNIT, label: UNKNOWN_UNIT, known: false, origin: 'unknown' };
}

export type NumericExclusionReason =
  | 'not_reviewed_numeric'
  | 'non_numeric_value'
  | 'missing_or_invalid_time'
  | 'unknown_unit'
  | 'evidence_conflict'
  | 'different_unit';

export type NumericRow = {
  fact_id: string;
  entity_id: string;
  predicate: string;
  series: string;
  value: number;
  original_value: string;
  unit: string;
  time_ms: number;
  time_raw: string;
  time_field: TimestampSelection;
};

export type NumericObservations = {
  rows: NumericRow[];
  exclusions: { fact: ImportedFact; reason: NumericExclusionReason; detail: string }[];
  unitGroups: { unit: string; count: number }[];
  selectedUnit: string | null;
};

export function numericObservations(
  facts: ImportedFact[],
  settings: ImportedSettings,
  evidence: EvidenceIndex,
  unitKey?: string,
): NumericObservations {
  const field = settings.temporal.timestampField;
  const exclusions: NumericObservations['exclusions'] = [];
  const candidates: (NumericRow & { unitKey: string })[] = [];
  for (const fact of facts) {
    const excl = (reason: NumericExclusionReason, detail: string) =>
      exclusions.push({ fact, reason, detail });
    if (settings.typeReview[fact.predicate]?.type !== 'numeric') {
      excl(
        'not_reviewed_numeric',
        `Predicate ${JSON.stringify(fact.predicate)} has no reviewed numeric type`,
      );
      continue;
    }
    const converted = convertNumeric(fact.objectValue, fact.predicate);
    if (!converted.ok) {
      excl('non_numeric_value', converted.reason);
      continue;
    }
    if (evidence.conflictedFactIds.has(fact.factId)) {
      excl('evidence_conflict', 'Linked evidence conflicts with this fact');
      continue;
    }
    const time = epochOf(fieldOf(fact, field));
    if (time === null) {
      excl('missing_or_invalid_time', `${field} is missing, invalid or timezone-ambiguous`);
      continue;
    }
    const unit = unitOf(fact, settings);
    if (!unit.known) {
      excl('unknown_unit', 'No explicit unit; unknown units are not assumed compatible');
      continue;
    }
    const timeField = fieldOf(fact, field);
    candidates.push({
      fact_id: fact.factId,
      entity_id: fact.entityId,
      predicate: fact.predicate,
      series: `${fact.entityId} · ${fact.predicate}`,
      value: converted.value,
      original_value: JSON.stringify(fact.objectValue),
      unit: unit.label,
      time_ms: time,
      time_raw: timeField.state === 'value' ? timeField.raw : '',
      time_field: field,
      unitKey: unit.key,
    });
  }
  const counts = new Map<string, number>();
  for (const row of candidates) counts.set(row.unitKey, (counts.get(row.unitKey) ?? 0) + 1);
  const unitGroups = [...counts.entries()]
    .map(([unit, count]) => ({ unit, count }))
    .sort((a, b) => b.count - a.count || compareCodepoint(a.unit, b.unit));
  const selectedUnit = unitKey && counts.has(unitKey) ? unitKey : (unitGroups[0]?.unit ?? null);
  const rows: NumericRow[] = [];
  for (const { unitKey: key, ...row } of candidates) {
    if (key === selectedUnit) rows.push(row);
    else {
      const fact = facts.find((f) => f.factId === row.fact_id)!;
      exclusions.push({
        fact,
        reason: 'different_unit',
        detail: `Unit ${JSON.stringify(key)} is not compatible with ${JSON.stringify(selectedUnit)}`,
      });
    }
  }
  rows.sort((a, b) => a.time_ms - b.time_ms || compareCodepoint(a.fact_id, b.fact_id));
  return { rows, exclusions, unitGroups, selectedUnit };
}
