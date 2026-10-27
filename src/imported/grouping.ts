import { compareCodepoint } from './json';
import type { EvidenceIndex } from './links';
import type { TemporalDiagnostics } from './temporal';
import { unitOf } from './typing';
import type { ImportedDeduction, ImportedFact, ImportedSettings } from './types';

export const UNKNOWN_ENTITY_TYPE = 'Unknown entity type';
export const UNMAPPED_TOPIC = 'Unmapped predicate';

export type FacetKey =
  | 'entityType'
  | 'topic'
  | 'predicate'
  | 'valueType'
  | 'unit'
  | 'entityId'
  | 'currentFlag'
  | 'temporal'
  | 'evidence';

export const FACETS: { key: FacetKey; label: string }[] = [
  { key: 'topic', label: 'Topic' },
  { key: 'predicate', label: 'Predicate' },
  { key: 'entityType', label: 'Entity type' },
  { key: 'entityId', label: 'Entity ID' },
  { key: 'valueType', label: 'Value type' },
  { key: 'unit', label: 'Unit' },
  { key: 'currentFlag', label: 'Upstream current flag' },
  { key: 'temporal', label: 'Temporal status' },
  { key: 'evidence', label: 'Evidence' },
];

export type FactMeta = {
  fact: ImportedFact;
  values: Record<FacetKey, string[]>;
  unitOrigin: string;
  evidenceConflict: boolean;
};

/**
 * Per-fact facet values from supplied metadata and explicit evidence links only. A fact can carry
 * several values in one facet (for example conflicting entity types) yet is counted once overall.
 */
export function buildFactMeta(
  facts: ImportedFact[],
  deductions: ImportedDeduction[],
  evidence: EvidenceIndex,
  diagnostics: TemporalDiagnostics,
  settings: ImportedSettings,
): FactMeta[] {
  const byId = new Map(deductions.map((d) => [d.deductionId, d]));
  return facts.map((fact) => {
    const types = new Set<string>();
    if (fact.entityType) types.add(fact.entityType);
    for (const link of evidence.byFact.get(fact.factId) ?? []) {
      const t = byId.get(link.deductionId)?.subjectEntityType;
      if (t) types.add(t);
    }
    const unit = unitOf(fact, settings);
    const review = settings.typeReview[fact.predicate]?.type;
    const warnings =
      diagnostics.byFact.get(fact.factId)?.filter((i) => i.severity === 'warning').length ?? 0;
    const linked = (evidence.byFact.get(fact.factId) ?? []).length;
    return {
      fact,
      unitOrigin: unit.origin,
      evidenceConflict: evidence.conflictedFactIds.has(fact.factId),
      values: {
        entityType: types.size ? [...types].sort(compareCodepoint) : [UNKNOWN_ENTITY_TYPE],
        topic: [settings.topicMap[fact.predicate]?.trim() || UNMAPPED_TOPIC],
        predicate: [fact.predicate],
        valueType: [
          review === 'numeric'
            ? 'Numeric (reviewed)'
            : review === 'nonnumeric'
              ? 'Non-numeric (reviewed)'
              : 'Unreviewed',
        ],
        unit: [unit.label],
        entityId: [fact.entityId],
        currentFlag: [fact.current === null ? 'Not supplied' : `current=${fact.current}`],
        temporal: [warnings ? 'Has temporal warnings' : 'No temporal warnings'],
        evidence: [
          linked
            ? evidence.conflictedFactIds.has(fact.factId)
              ? 'Linked, conflicting'
              : 'Linked deductions'
            : 'Supporting extraction not linked',
        ],
      },
    };
  });
}

export type FactFilters = { facets: Partial<Record<FacetKey, string[]>>; text: string };
export const EMPTY_FILTERS: FactFilters = { facets: {}, text: '' };

const matchesText = (meta: FactMeta, text: string) => {
  const needle = text.trim().toLowerCase();
  if (!needle) return true;
  const f = meta.fact;
  return [f.factId, f.entityId, f.predicate, JSON.stringify(f.objectValue)].some((s) =>
    s.toLowerCase().includes(needle),
  );
};

const matchesFacets = (meta: FactMeta, filters: FactFilters, skip?: FacetKey) =>
  FACETS.every(({ key }) => {
    const selected = filters.facets[key];
    return key === skip || !selected?.length || meta.values[key].some((v) => selected.includes(v));
  });

export const applyFilters = (metas: FactMeta[], filters: FactFilters) =>
  metas.filter((m) => matchesFacets(m, filters) && matchesText(m, filters.text));

/** Facet counts honour every other active filter, and count each underlying fact once. */
export function facetCounts(
  metas: FactMeta[],
  filters: FactFilters,
): Record<FacetKey, { value: string; count: number }[]> {
  const out = {} as Record<FacetKey, { value: string; count: number }[]>;
  for (const { key } of FACETS) {
    const counts = new Map<string, number>();
    for (const m of metas)
      if (matchesFacets(m, filters, key) && matchesText(m, filters.text))
        for (const v of new Set(m.values[key])) counts.set(v, (counts.get(v) ?? 0) + 1);
    out[key] = [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || compareCodepoint(a.value, b.value));
  }
  return out;
}
