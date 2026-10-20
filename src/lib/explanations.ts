import type {
  AnalyticTask,
  AudienceMode,
  DataProfile,
  ExclusionReasonKind,
  MissionContext,
  SuitabilityBreakdown,
  VisualizationRecommendation,
} from '../domain/types';
import { TASKS } from '../domain/constants';
import { MDMP_PHASES } from '../domain/mdmp';
import type { RecommendationResult } from './recommendationEngine';

export type FactorKey = keyof SuitabilityBreakdown;

export const FACTOR_LABELS: Record<FactorKey, string> = {
  taskFit: 'Task fit',
  fieldCompatibility: 'Field compatibility',
  modelingOutputFit: 'Modeling-output fit',
  uncertaintyVisibility: 'Uncertainty visibility',
  provenanceInspectability: 'Provenance inspectability',
  readability: 'Readability',
  interactionBurden: 'Interaction burden',
  audienceComplexity: 'Audience complexity',
  quantityUnitCompatibility: 'Quantity-unit compatibility',
  episodeGrouping: 'Episode grouping',
  timeComparability: 'Time comparability',
};

export const SUITABILITY_LABEL = 'Rule-based suitability score';
export const SUITABILITY_CAVEAT =
  'Rule-based suitability for this task and audience; not a probability, not truth, and not report confidence.';

/** Signed display with a true minus sign: +8, −10, 0. */
export function formatSigned(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `\u2212${Math.abs(value)}`;
  return '0';
}

export type FactorRow = {
  factor: FactorKey;
  label: string;
  values: number[];
  /** First chart minus the second chart (undefined when fewer than two charts). */
  deltaVsRunnerUp?: number;
  differs: boolean;
};

export type FactorComparison = {
  charts: Pick<VisualizationRecommendation, 'id' | 'title' | 'rank' | 'suitabilityScore'>[];
  rows: FactorRow[];
  /** Factors where the winner and runner-up differ, largest absolute difference first. */
  winnerVsRunnerUp: FactorRow[];
  sharedFactors: FactorRow[];
  scoreDifference?: number;
  tied: boolean;
};

export function compareFactors(
  recommendations: VisualizationRecommendation[],
  limit = 3,
): FactorComparison {
  const charts = recommendations.slice(0, limit);
  const keys = Object.keys(FACTOR_LABELS) as FactorKey[];
  const rows: FactorRow[] = keys.map((factor) => {
    const values = charts.map((chart) => chart.scoreBreakdown[factor]);
    const deltaVsRunnerUp = charts.length > 1 ? values[0] - values[1] : undefined;
    return {
      factor,
      label: FACTOR_LABELS[factor],
      values,
      deltaVsRunnerUp,
      differs: new Set(values).size > 1,
    };
  });
  const winnerVsRunnerUp = rows
    .filter((row) => row.deltaVsRunnerUp !== undefined && row.deltaVsRunnerUp !== 0)
    .sort((a, b) => Math.abs(b.deltaVsRunnerUp!) - Math.abs(a.deltaVsRunnerUp!));
  const scoreDifference =
    charts.length > 1 ? charts[0].suitabilityScore - charts[1].suitabilityScore : undefined;
  return {
    charts: charts.map(({ id, title, rank, suitabilityScore }) => ({
      id,
      title,
      rank,
      suitabilityScore,
    })),
    rows,
    winnerVsRunnerUp,
    sharedFactors: rows.filter((row) => row.deltaVsRunnerUp === 0),
    scoreDifference,
    tied: scoreDifference === 0,
  };
}

export type DecisionStep = {
  id: 'task_audience' | 'fields_reports' | 'compatibility' | 'eligibility' | 'scoring' | 'ranking';
  label: string;
  summary: string;
  details: string[];
};

const KIND_LABELS: Record<ExclusionReasonKind, string> = {
  curated_candidate_set: 'Curated candidate-set restriction',
  missing_required_fields: 'Missing required fields',
  insufficient_numeric_fields: 'Too few quantitative fields',
  task_field_requirement: 'Task-specific field requirement',
  mixed_units: 'Mixed units',
};

export function exclusionKindLabel(kind: ExclusionReasonKind): string {
  return KIND_LABELS[kind];
}

export function buildDecisionPath(input: {
  task: AnalyticTask;
  audience: AudienceMode;
  context: MissionContext;
  profile: DataProfile;
  reportCount: number;
  result: RecommendationResult;
}): DecisionStep[] {
  const { task, audience, context, profile, reportCount, result } = input;
  const eligible = result.candidates.filter((candidate) => candidate.eligible);
  const excluded = result.candidates.filter((candidate) => !candidate.eligible);
  const byKind = new Map<ExclusionReasonKind, string[]>();
  excluded.forEach((candidate) =>
    candidate.reasons.forEach((reason) =>
      byKind.set(reason.kind, [...(byKind.get(reason.kind) ?? []), candidate.title]),
    ),
  );
  const penalties = result.ranked.flatMap((chart) =>
    (Object.keys(FACTOR_LABELS) as FactorKey[])
      .filter((factor) => chart.scoreBreakdown[factor] < 0)
      .map(
        (factor) =>
          `${chart.title}: ${FACTOR_LABELS[factor]} ${formatSigned(chart.scoreBreakdown[factor])}`,
      ),
  );
  const ties = result.ranked.filter(
    (chart, index) =>
      index > 0 && chart.suitabilityScore === result.ranked[index - 1].suitabilityScore,
  );
  return [
    {
      id: 'task_audience',
      label: 'Task & audience',
      summary: `${TASKS[task].label} · ${audience}`,
      details: [
        `The task selects a curated list of candidate chart patterns and the task-fit points.`,
        `${audience} mode only changes the audience-complexity penalty.`,
        `Mission context (${MDMP_PHASES[context.mdmpPhase]}, ${context.echelon}, ${context.timeHorizon.replaceAll('_', ' ')}, ${context.variableClass.replaceAll('_', ' ')}) is recorded in the explanation text and does not change scores.`,
      ],
    },
    {
      id: 'fields_reports',
      label: 'Fields & reports',
      summary: `${reportCount} report(s) in view · ${profile.fields.length} profiled fields`,
      details: [
        `Profiled fields: ${profile.fields.map((field) => field.name).join(', ')}.`,
        `${profile.numericFields.length} quantitative field(s) are available.`,
        'The filtered reports determine unit and episode checks; the profile covers the whole scenario.',
      ],
    },
    {
      id: 'compatibility',
      label: 'Compatibility checks',
      summary: `${result.candidates.length} chart patterns checked`,
      details: [...byKind.entries()].map(
        ([kind, titles]) => `${KIND_LABELS[kind]}: ${titles.length} pattern(s) affected.`,
      ),
    },
    {
      id: 'eligibility',
      label: 'Eligible & excluded charts',
      summary: `${eligible.length} eligible · ${excluded.length} excluded`,
      details: [
        ...eligible.map((candidate) => `Eligible: ${candidate.title}.`),
        ...excluded.flatMap((candidate) =>
          candidate.reasons.map(
            (reason) =>
              `Excluded — ${candidate.title} · ${KIND_LABELS[reason.kind]}: ${reason.detail}`,
          ),
        ),
      ],
    },
    {
      id: 'scoring',
      label: 'Scoring & penalties',
      summary: `${eligible.length} chart(s) scored from ${Object.keys(FACTOR_LABELS).length} factors`,
      details: [
        'Each score is the sum of the signed factor values shown in the factor comparison.',
        ...(penalties.length ? penalties : ['No penalties apply to the eligible charts.']),
      ],
    },
    {
      id: 'ranking',
      label: 'Ranking',
      summary: result.ranked.length
        ? `Top: ${result.ranked[0].title} (${result.ranked[0].suitabilityScore})`
        : 'No eligible chart to rank',
      details: [
        ...result.ranked.map(
          (chart) =>
            `#${chart.rank} ${chart.title} — ${chart.suitabilityScore} rule-based suitability`,
        ),
        'Ranking preference: descending suitability; equal scores keep the curated candidate order.',
        ...(ties.length
          ? [`${ties.length} chart(s) tie with the chart ranked directly above.`]
          : []),
      ],
    },
  ];
}
