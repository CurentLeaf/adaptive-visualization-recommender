import type { AudienceMode } from '../domain/types';
import {
  analyzeImported,
  profileImported,
  type ImportedAnalysis,
  type ImportedContext,
  type ImportedProfile,
} from './profile';
import { createNumericObservationSpec, createValidityTimelineSpec } from './specs';
import { snapshotAt, validityTimeline, type SnapshotResult, type TimelineRow } from './temporal';
import { numericObservations, type NumericObservations } from './typing';
import type { ImportedFact } from './types';

export type ImportedCandidateKind =
  | 'fact_table'
  | 'validity_timeline'
  | 'numeric_observations'
  | 'historical_snapshot'
  | 'supersession_history'
  | 'provenance_evidence'
  | 'spatial_map';

export type ImportedExclusionKind =
  | 'no_facts'
  | 'no_numeric_type'
  | 'non_numeric_values'
  | 'missing_or_invalid_time'
  | 'unconfigured_validity'
  | 'unknown_unit'
  | 'incompatible_unit'
  | 'evidence_conflict'
  | 'no_supersession_links'
  | 'no_deductions'
  | 'no_spatial_fields'
  | 'no_valid_intervals';

export type ImportedCandidateEvaluation = {
  kind: ImportedCandidateKind;
  title: string;
  eligible: boolean;
  reasons: { kind: ImportedExclusionKind; detail: string }[];
};

export type ImportedScoreBreakdown = {
  coverage: number;
  interpretability: number;
  audienceFit: number;
};

export type ImportedRecommendation = {
  id: string;
  kind: ImportedCandidateKind;
  title: string;
  rank: number;
  score: number;
  scoreBreakdown: ImportedScoreBreakdown;
  rationale: string[];
  cautions: string[];
  doesNotEstablish: string;
  fieldsUsed: string[];
  /** Original fact IDs shown by this view; carried through chart clicks. */
  factIds: string[];
  /** Vega-Lite spec for chart views; null for table views. */
  vegaLiteSpec: Record<string, unknown> | null;
};

export type ImportedArtifacts = {
  timeline: ReturnType<typeof validityTimeline>;
  numeric: NumericObservations;
  snapshot: SnapshotResult;
  supersessionFacts: ImportedFact[];
};

export type ImportedRecommendationRequest = {
  dataset: 'imported';
  context: ImportedContext;
  /** Facts currently selected by the user's filters. */
  facts: ImportedFact[];
  audience: AudienceMode;
  numericUnit?: string;
};

export type ImportedRecommendationResult = {
  dataset: 'imported';
  profile: ImportedProfile;
  analysis: ImportedAnalysis;
  artifacts: ImportedArtifacts;
  ranked: ImportedRecommendation[];
  excluded: ImportedCandidateEvaluation[];
  candidates: ImportedCandidateEvaluation[];
  explanation: string;
};

const TITLES: Record<ImportedCandidateKind, string> = {
  fact_table: 'Fact table',
  validity_timeline: 'Supplied validity timeline',
  numeric_observations: 'Numeric observations over time',
  historical_snapshot: 'Historical snapshot',
  supersession_history: 'Supersession history',
  provenance_evidence: 'Provenance and evidence',
  spatial_map: 'Map',
};
const ORDER = Object.keys(TITLES) as ImportedCandidateKind[];
const INTERPRETABILITY: Record<ImportedCandidateKind, number> = {
  fact_table: 0.95,
  provenance_evidence: 0.85,
  historical_snapshot: 0.75,
  numeric_observations: 0.7,
  validity_timeline: 0.65,
  supersession_history: 0.65,
  spatial_map: 0,
};
const AUDIENCE: Record<AudienceMode, Record<ImportedCandidateKind, number>> = {
  Commander: {
    fact_table: 1,
    provenance_evidence: 0.9,
    historical_snapshot: 0.85,
    numeric_observations: 0.8,
    validity_timeline: 0.55,
    supersession_history: 0.5,
    spatial_map: 0,
  },
  Analyst: {
    fact_table: 0.7,
    provenance_evidence: 0.9,
    historical_snapshot: 0.9,
    numeric_observations: 1,
    validity_timeline: 1,
    supersession_history: 1,
    spatial_map: 0,
  },
};
/** Commander views show only a small set of eligible recommendations. */
export const COMMANDER_LIMIT = 3;

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

export function evaluateImportedCandidates(
  ctx: ImportedContext,
  facts: ImportedFact[],
  numericUnit?: string,
): { evaluations: ImportedCandidateEvaluation[]; artifacts: ImportedArtifacts } {
  const settings = ctx.dataset.settings;
  const timeline = validityTimeline(facts);
  const numeric = numericObservations(facts, settings, ctx.evidence, numericUnit);
  const snapshot = snapshotAt(facts, settings.temporal);
  const supersessionFacts = facts.filter((f) => f.supersedes.length || f.supersededBy.length);
  const ev = (
    kind: ImportedCandidateKind,
    reasons: ImportedCandidateEvaluation['reasons'],
  ): ImportedCandidateEvaluation => ({
    kind,
    title: TITLES[kind],
    eligible: reasons.length === 0,
    reasons,
  });
  const evaluations: ImportedCandidateEvaluation[] = [];

  evaluations.push(ev('fact_table', []));

  const timelineReasons: ImportedCandidateEvaluation['reasons'] = [];
  if (!timeline.rows.length)
    timelineReasons.push({
      kind: 'no_valid_intervals',
      detail: facts.length
        ? `No selected fact has valid_from or valid_to with an explicit UTC offset (${count(timeline.excluded.length, 'fact')} excluded).`
        : 'No facts selected.',
    });
  evaluations.push(ev('validity_timeline', timelineReasons));

  const numericReasons: ImportedCandidateEvaluation['reasons'] = [];
  if (!numeric.rows.length) {
    const by = (r: string) => numeric.exclusions.filter((e) => e.reason === r).length;
    if (!facts.length) numericReasons.push({ kind: 'no_facts', detail: 'No facts selected.' });
    if (by('not_reviewed_numeric'))
      numericReasons.push({
        kind: 'no_numeric_type',
        detail: `${count(by('not_reviewed_numeric'), 'fact')} lack a reviewed numeric type; review proposed types in Interpretation settings.`,
      });
    if (by('non_numeric_value'))
      numericReasons.push({
        kind: 'non_numeric_values',
        detail: `${count(by('non_numeric_value'), 'value')} cannot be converted conservatively to a number.`,
      });
    if (by('missing_or_invalid_time'))
      numericReasons.push({
        kind: 'missing_or_invalid_time',
        detail: `${count(by('missing_or_invalid_time'), 'fact')} lack a valid ${settings.temporal.timestampField} with explicit UTC offset.`,
      });
    if (by('unknown_unit'))
      numericReasons.push({
        kind: 'unknown_unit',
        detail: `${count(by('unknown_unit'), 'fact')} have no explicit unit; unknown units are not assumed compatible.`,
      });
    if (by('evidence_conflict'))
      numericReasons.push({
        kind: 'evidence_conflict',
        detail: `${count(by('evidence_conflict'), 'fact')} have conflicting linked evidence.`,
      });
    if (facts.length && !numericReasons.length)
      numericReasons.push({
        kind: 'no_numeric_type',
        detail: 'No numeric observations available.',
      });
  }
  evaluations.push(ev('numeric_observations', numericReasons));

  evaluations.push(
    ev(
      'historical_snapshot',
      snapshot.ready
        ? []
        : [
            {
              kind: 'unconfigured_validity',
              detail: `Snapshot requires explicit validity configuration: ${snapshot.missing.join('; ')}.`,
            },
          ],
    ),
  );
  evaluations.push(
    ev(
      'supersession_history',
      supersessionFacts.length
        ? []
        : [
            {
              kind: 'no_supersession_links',
              detail: 'No selected fact has supersedes or superseded_by.',
            },
          ],
    ),
  );
  evaluations.push(
    ev(
      'provenance_evidence',
      ctx.dataset.deductions.length
        ? []
        : [
            {
              kind: 'no_deductions',
              detail: 'No deductions are present; facts are shown without supporting extraction.',
            },
          ],
    ),
  );
  evaluations.push(
    ev('spatial_map', [
      {
        kind: 'no_spatial_fields',
        detail:
          'Imported facts and deductions have no supported spatial fields; no map is offered.',
      },
    ]),
  );
  return { evaluations, artifacts: { timeline, numeric, snapshot, supersessionFacts } };
}

/** Typed recommendation path for imported data: profile → analysis → eligibility → ranking → specs. */
export function recommendImported(
  request: ImportedRecommendationRequest,
): ImportedRecommendationResult {
  const { context: ctx, facts, audience } = request;
  const profile = profileImported(ctx, facts);
  const analysis = analyzeImported(ctx, facts);
  const { evaluations, artifacts } = evaluateImportedCandidates(ctx, facts, request.numericUnit);
  const total = Math.max(1, facts.length);
  const coverageOf = (kind: ImportedCandidateKind): number => {
    switch (kind) {
      case 'fact_table':
        return 1;
      case 'validity_timeline':
        return artifacts.timeline.rows.length / total;
      case 'numeric_observations':
        return artifacts.numeric.rows.length / total;
      case 'historical_snapshot':
        return artifacts.snapshot.ready
          ? (artifacts.snapshot.valid.length + artifacts.snapshot.notValid.length) / total
          : 0;
      case 'supersession_history':
        return artifacts.supersessionFacts.length / total;
      case 'provenance_evidence':
        return facts.length ? analysis.evidence.linked / total : 1;
      default:
        return 0;
    }
  };
  const ranked = evaluations
    .filter((e) => e.eligible)
    .map((e) => {
      const breakdown: ImportedScoreBreakdown = {
        coverage: coverageOf(e.kind),
        interpretability: INTERPRETABILITY[e.kind],
        audienceFit: AUDIENCE[audience][e.kind],
      };
      const score = Math.round(
        100 *
          (0.4 * breakdown.coverage +
            0.25 * breakdown.interpretability +
            0.35 * breakdown.audienceFit),
      );
      return { e, breakdown, score };
    })
    .sort((a, b) => b.score - a.score || ORDER.indexOf(a.e.kind) - ORDER.indexOf(b.e.kind))
    .slice(0, audience === 'Commander' ? COMMANDER_LIMIT : undefined)
    .map(({ e, breakdown, score }, index) =>
      describe(e.kind, breakdown, score, index + 1, audience, ctx, facts, artifacts, analysis),
    );
  const shown = new Set(ranked.map((r) => r.kind));
  const excluded = evaluations.filter((e) => !e.eligible);
  const notShown = evaluations.filter((e) => e.eligible && !shown.has(e.kind));
  return {
    dataset: 'imported',
    profile,
    analysis,
    artifacts,
    ranked,
    excluded,
    candidates: evaluations,
    explanation:
      `Imported data (${count(facts.length, 'selected fact')}, ${count(profile.deductionCount, 'deduction')}). Audience: ${audience}. ` +
      `Scores are deterministic rule-based fit (40% share of selected facts supported, 25% interpretability, 35% audience fit); they are not confidence, reliability or truth.` +
      (notShown.length
        ? ` ${notShown.map((n) => n.title).join(', ')} eligible but not shown in the compact ${audience} set.`
        : ''),
  };
}

function describe(
  kind: ImportedCandidateKind,
  scoreBreakdown: ImportedScoreBreakdown,
  score: number,
  rank: number,
  audience: AudienceMode,
  ctx: ImportedContext,
  facts: ImportedFact[],
  a: ImportedArtifacts,
  analysis: ImportedAnalysis,
): ImportedRecommendation {
  const unresolved = analysis.temporal.unresolvedWarnings;
  const common = {
    id: `imported-${kind}`,
    kind,
    title: TITLES[kind],
    rank,
    score,
    scoreBreakdown,
  };
  const caveats = [
    ...(unresolved
      ? [`${count(unresolved, 'selected fact')} have unresolved temporal warnings.`]
      : []),
    ...(analysis.evidence.conflicted
      ? [
          `${count(analysis.evidence.conflicted, 'selected fact')} have conflicting linked evidence.`,
        ]
      : []),
  ];
  const fit = `${audience} fit ${Math.round(scoreBreakdown.audienceFit * 100)}%, coverage ${Math.round(scoreBreakdown.coverage * 100)}% of selected facts.`;
  switch (kind) {
    case 'fact_table':
      return {
        ...common,
        rationale: [
          'Always available; shows every fact with original values, temporal fields, status and evidence links.',
          fit,
        ],
        cautions: [...caveats, 'Upstream current flag and as_of meanings are unconfirmed.'],
        doesNotEstablish: 'That any fact is true, current or corroborated.',
        fieldsUsed: [
          'fact_id',
          'entity_id',
          'predicate',
          'object_value',
          'as_of',
          'valid_from',
          'valid_to',
          'current',
        ],
        factIds: facts.map((f) => f.factId),
        vegaLiteSpec: null,
      };
    case 'validity_timeline':
      return {
        ...common,
        rationale: [
          `${count(a.timeline.rows.length, 'fact')} have a supplied validity endpoint with an explicit UTC offset; open and missing endpoints are labeled, not given dates.`,
          fit,
        ],
        cautions: [
          ...caveats,
          'Supplied validity metadata is upstream-labeled; applicability intervals are not confirmed.',
          ...(a.timeline.excluded.length
            ? [
                `${count(a.timeline.excluded.length, 'fact')} excluded (missing, invalid, ambiguous or reversed endpoints).`,
              ]
            : []),
        ],
        doesNotEstablish: 'That a fact was true or applicable during the drawn interval.',
        fieldsUsed: ['fact_id', 'valid_from', 'valid_to'],
        factIds: a.timeline.rows.map((r) => r.fact_id),
        vegaLiteSpec: createValidityTimelineSpec(a.timeline.rows),
      };
    case 'numeric_observations': {
      const unit = a.numeric.selectedUnit ?? 'unknown';
      return {
        ...common,
        rationale: [
          `${count(a.numeric.rows.length, 'observation')} use reviewed numeric types, explicit compatible unit "${unit}" and a valid ${ctx.dataset.settings.temporal.timestampField}; points are not connected.`,
          fit,
        ],
        cautions: [
          ...caveats,
          `${count(a.numeric.exclusions.length, 'fact')} not plotted (see exclusions).`,
        ],
        doesNotEstablish:
          'A trend, continuity between points, or that values are comparable beyond the shared unit label.',
        fieldsUsed: [
          'fact_id',
          'predicate',
          'object_value',
          ctx.dataset.settings.temporal.timestampField,
          'unit',
        ],
        factIds: a.numeric.rows.map((r) => r.fact_id),
        vegaLiteSpec: createNumericObservationSpec(a.numeric.rows, unit),
      };
    }
    case 'historical_snapshot':
      return {
        ...common,
        rationale: [
          `Configured validity semantics classify ${a.snapshot.valid.length} fact(s) valid at the reference time.`,
          fit,
        ],
        cautions: [
          ...caveats,
          `${count(a.snapshot.unresolved.length, 'fact')} excluded as temporally unresolved (still in the fact table).`,
          'Applies the dataset-scoped interpretation you configured, not an upstream-confirmed meaning.',
        ],
        doesNotEstablish:
          'That snapshot membership means the fact was true; overlap is not an error and newest is not true.',
        fieldsUsed: ['valid_from', 'valid_to', 'reference time'],
        factIds: a.snapshot.valid.map((f) => f.factId),
        vegaLiteSpec: null,
      };
    case 'supersession_history':
      return {
        ...common,
        rationale: [
          `${count(a.supersessionFacts.length, 'fact')} carry explicit supersedes/superseded_by links.`,
          fit,
        ],
        cautions: [
          ...caveats,
          'A replacement may be a correction rather than a real-world change; this is not measured change.',
        ],
        doesNotEstablish: 'Which fact is true, or that the world changed.',
        fieldsUsed: ['fact_id', 'supersedes', 'superseded_by'],
        factIds: a.supersessionFacts.map((f) => f.factId),
        vegaLiteSpec: null,
      };
    default:
      return {
        ...common,
        rationale: [
          `${count(ctx.dataset.deductions.length, 'deduction')} searchable independently; ${count(analysis.evidence.linked, 'selected fact')} have explicit links.`,
          fit,
        ],
        cautions: [
          ...caveats,
          'Extraction confidence is not reliability, truth or corroboration.',
          ...(analysis.evidence.unlinked
            ? [
                `${count(analysis.evidence.unlinked, 'selected fact')}: Supporting extraction not linked.`,
              ]
            : []),
        ],
        doesNotEstablish: 'Corroboration, independence or truth.',
        fieldsUsed: [
          'deduction_id',
          'fact_id',
          'supporting_deduction_ids',
          'provenance',
          'metadata',
        ],
        factIds: facts
          .filter((f) => (ctx.evidence.byFact.get(f.factId) ?? []).length)
          .map((f) => f.factId),
        vegaLiteSpec: null,
      };
  }
}

export type { TimelineRow };
