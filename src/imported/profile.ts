import { buildEvidenceIndex, type EvidenceIndex } from './links';
import { buildFactMeta, type FactMeta } from './grouping';
import { epochOf } from './timestamps';
import { fieldOf, temporalDiagnostics, type TemporalDiagnostics } from './temporal';
import { convertNumeric, proposeTypes, type TypeProposal } from './typing';
import type { ImportedDataset, ImportedFact, TimestampSelection } from './types';

export type ImportedContext = {
  dataset: ImportedDataset;
  evidence: EvidenceIndex;
  diagnostics: TemporalDiagnostics;
  metas: FactMeta[];
  proposals: TypeProposal[];
};

/** Derived structures shared by profiling, grouping, recommendation and the UI. */
export function prepareImported(dataset: ImportedDataset): ImportedContext {
  const evidence = buildEvidenceIndex(dataset);
  const diagnostics = temporalDiagnostics(dataset.facts);
  const types = new Map(dataset.deductions.map((d) => [d.deductionId, d.objectType]));
  return {
    dataset,
    evidence,
    diagnostics,
    metas: buildFactMeta(
      dataset.facts,
      dataset.deductions,
      evidence,
      diagnostics,
      dataset.settings,
    ),
    proposals: proposeTypes(dataset.facts, dataset.settings, evidence, types),
  };
}

export type ImportedFieldProfile = {
  name: string;
  inferredType: 'id' | 'nominal' | 'temporal' | 'boolean' | 'mixed_value' | 'id_list';
  analyticRole: 'identifier' | 'dimension' | 'value' | 'temporal' | 'link';
  /** Types of imported fields are proposals unless the user reviewed them. */
  typeOrigin: 'inferred' | 'user_configured';
  analyticsReady: boolean;
  total: number;
  present: number;
  nullCount: number;
  missing: number;
  invalid: number;
  ambiguous: number;
  uniqueCount: number;
};

export type ImportedProfile = {
  dataset: 'imported';
  factCount: number;
  deductionCount: number;
  fields: ImportedFieldProfile[];
  validTimestampFields: TimestampSelection[];
  reviewedNumericPredicates: string[];
  unreviewedPredicates: string[];
  spatialFields: string[];
  linkedFactCount: number;
};

const TIMESTAMPS: TimestampSelection[] = ['as_of', 'valid_from', 'valid_to'];

export function profileImported(ctx: ImportedContext, facts: ImportedFact[]): ImportedProfile {
  const { settings } = ctx.dataset;
  const base = (name: string, over: Partial<ImportedFieldProfile>): ImportedFieldProfile => ({
    name,
    inferredType: 'nominal',
    analyticRole: 'dimension',
    typeOrigin: 'inferred',
    analyticsReady: false,
    total: facts.length,
    present: facts.length,
    nullCount: 0,
    missing: 0,
    invalid: 0,
    ambiguous: 0,
    uniqueCount: 0,
    ...over,
  });
  const unique = (values: unknown[]) => new Set(values.map((v) => JSON.stringify(v))).size;
  const fields: ImportedFieldProfile[] = [
    base('fact_id', {
      inferredType: 'id',
      analyticRole: 'identifier',
      uniqueCount: unique(facts.map((f) => f.factId)),
      analyticsReady: true,
    }),
    base('entity_id', {
      inferredType: 'id',
      analyticRole: 'identifier',
      uniqueCount: unique(facts.map((f) => f.entityId)),
      analyticsReady: true,
    }),
    base('predicate', { uniqueCount: unique(facts.map((f) => f.predicate)), analyticsReady: true }),
  ];
  const predicates = [...new Set(facts.map((f) => f.predicate))];
  const reviewed = predicates.filter((p) => settings.typeReview[p]);
  fields.push(
    base('object_value', {
      inferredType: 'mixed_value',
      analyticRole: 'value',
      typeOrigin:
        reviewed.length === predicates.length && predicates.length ? 'user_configured' : 'inferred',
      analyticsReady: facts.some(
        (f) =>
          settings.typeReview[f.predicate]?.type === 'numeric' &&
          convertNumeric(f.objectValue, f.predicate).ok,
      ),
      nullCount: facts.filter((f) => f.objectValue === null).length,
      uniqueCount: unique(facts.map((f) => f.objectValue)),
    }),
  );
  const validFields: TimestampSelection[] = [];
  for (const name of TIMESTAMPS) {
    const states = facts.map((f) => fieldOf(f, name));
    const valid = states.filter((s) => epochOf(s) !== null).length;
    if (valid) validFields.push(name);
    fields.push(
      base(name, {
        inferredType: 'temporal',
        analyticRole: 'temporal',
        analyticsReady: valid > 0,
        present: states.filter((s) => s.state === 'value').length,
        nullCount: states.filter((s) => s.state === 'null').length,
        missing: states.filter((s) => s.state === 'missing').length,
        invalid: states.filter(
          (s) =>
            s.state === 'invalid_type' || (s.state === 'value' && s.parsed.status === 'invalid'),
        ).length,
        ambiguous: states.filter(
          (s) => s.state === 'value' && s.parsed.status === 'ambiguous_timezone',
        ).length,
        uniqueCount: unique(states.map((s) => (s.state === 'value' ? s.raw : s.state))),
      }),
    );
  }
  fields.push(
    base('current', {
      inferredType: 'boolean',
      missing: facts.filter((f) => f.current === null).length,
      present: facts.filter((f) => f.current !== null).length,
      uniqueCount: unique(facts.map((f) => f.current)),
      analyticsReady: true,
    }),
    base('supersedes / superseded_by', {
      inferredType: 'id_list',
      analyticRole: 'link',
      present: facts.filter((f) => f.supersedes.length || f.supersededBy.length).length,
      missing: facts.filter((f) => !f.supersedes.length && !f.supersededBy.length).length,
      analyticsReady: true,
    }),
    base('supporting_deduction_ids', {
      inferredType: 'id_list',
      analyticRole: 'link',
      present: facts.filter((f) => f.supportingDeductionIds.length).length,
      missing: facts.filter((f) => !f.supportingDeductionIds.length).length,
      analyticsReady: true,
    }),
  );
  return {
    dataset: 'imported',
    factCount: facts.length,
    deductionCount: ctx.dataset.deductions.length,
    fields,
    validTimestampFields: validFields,
    reviewedNumericPredicates: predicates
      .filter((p) => settings.typeReview[p]?.type === 'numeric')
      .sort(),
    unreviewedPredicates: predicates.filter((p) => !settings.typeReview[p]).sort(),
    spatialFields: [],
    linkedFactCount: facts.filter((f) => (ctx.evidence.byFact.get(f.factId) ?? []).length).length,
  };
}

export type ImportedAnalysis = {
  byPredicate: { predicate: string; count: number }[];
  byEntity: { entityId: string; count: number }[];
  evidence: { linked: number; unlinked: number; conflicted: number; unlinkedDeductions: number };
  temporal: {
    withInterval: number;
    unresolvedWarnings: number;
    currentTrue: number;
    currentFalse: number;
    currentUnknown: number;
  };
};

const tally = <T extends string>(values: T[]) => {
  const map = new Map<T, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
};

/** Descriptive counts only; no fitted model, truth estimate or corroboration. */
export function analyzeImported(ctx: ImportedContext, facts: ImportedFact[]): ImportedAnalysis {
  const linked = facts.filter((f) => (ctx.evidence.byFact.get(f.factId) ?? []).length).length;
  return {
    byPredicate: tally(facts.map((f) => f.predicate)).map(([predicate, count]) => ({
      predicate,
      count,
    })),
    byEntity: tally(facts.map((f) => f.entityId)).map(([entityId, count]) => ({ entityId, count })),
    evidence: {
      linked,
      unlinked: facts.length - linked,
      conflicted: facts.filter((f) => ctx.evidence.conflictedFactIds.has(f.factId)).length,
      unlinkedDeductions: ctx.dataset.deductions.filter(
        (d) => !(ctx.evidence.byDeduction.get(d.deductionId) ?? []).length,
      ).length,
    },
    temporal: {
      withInterval: facts.filter(
        (f) => epochOf(f.validFrom) !== null || epochOf(f.validTo) !== null,
      ).length,
      unresolvedWarnings: facts.filter((f) =>
        ctx.diagnostics.byFact.get(f.factId)?.some((i) => i.severity === 'warning'),
      ).length,
      currentTrue: facts.filter((f) => f.current === true).length,
      currentFalse: facts.filter((f) => f.current === false).length,
      currentUnknown: facts.filter((f) => f.current === null).length,
    },
  };
}
