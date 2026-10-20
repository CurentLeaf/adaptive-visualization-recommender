import type {
  AnalyticTask,
  AudienceMode,
  DataProfile,
  MissionContext,
  SalienceWeights,
} from '../domain/types';
import { recommendModels } from './modelSelection';
import {
  recommend,
  type RecommendationDatum,
  type RecommendationResult,
} from './recommendationEngine';
import { FACTOR_LABELS, type FactorKey } from './explanations';

export type WhatIfContext = { task: AnalyticTask; audience: AudienceMode };
export type WhatIfSubset = {
  /** Keep only reports whose recorded source_independent metadata is true. */
  independentOnly: boolean;
  /** Keep only reports with recorded human verification. */
  humanVerifiedOnly: boolean;
  /** Remove specific reports from the hypothetical run. */
  excludeReportIds: string[];
};
export const EMPTY_SUBSET: WhatIfSubset = {
  independentOnly: false,
  humanVerifiedOnly: false,
  excludeReportIds: [],
};

export type Sensitivity = 'none' | 'context' | 'evidence_subset' | 'both';
export type WhatIfInput = {
  profile: DataProfile;
  data: RecommendationDatum[];
  weights: SalienceWeights;
  missionContext: MissionContext;
  current: WhatIfContext;
  hypothetical: WhatIfContext & { subset: WhatIfSubset };
};
export type RankChange = {
  id: string;
  title: string;
  currentRank: number | null;
  hypotheticalRank: number | null;
};
export type FactorChange = {
  id: string;
  title: string;
  changes: {
    factor: FactorKey;
    label: string;
    current: number;
    hypothetical: number;
    delta: number;
  }[];
};
export type WhatIfResult = {
  current: RecommendationResult;
  hypothetical: RecommendationResult;
  currentReportCount: number;
  hypotheticalReportCount: number;
  sensitivity: Sensitivity;
  rankingUnchanged: boolean;
  topChanged: boolean;
  rankChanges: RankChange[];
  /** Per-chart factor differences for charts ranked in both runs. */
  factorChanges: FactorChange[];
  /** Populated only when both context and subset changed, to separate their effects. */
  attribution: { contextOnly: RecommendationResult; subsetOnly: RecommendationResult } | null;
};

export function subsetIsActive(subset: WhatIfSubset): boolean {
  return subset.independentOnly || subset.humanVerifiedOnly || subset.excludeReportIds.length > 0;
}

export function applySubset(data: RecommendationDatum[], subset: WhatIfSubset) {
  const excluded = new Set(subset.excludeReportIds);
  return data.filter(
    (report) =>
      (!subset.independentOnly || report.source_independent === true) &&
      (!subset.humanVerifiedOnly || report.human_verified === true) &&
      !excluded.has(report.report_id),
  );
}

const rankingOf = (result: RecommendationResult) => result.ranked.map((chart) => chart.id);

export function runWhatIf(input: WhatIfInput): WhatIfResult {
  const run = (context: WhatIfContext, data: RecommendationDatum[]) =>
    recommend({
      profile: input.profile,
      task: context.task,
      modeling: recommendModels(input.profile, context.task)[0],
      weights: input.weights,
      data,
      audience: context.audience,
      context: input.missionContext,
    });
  const hypotheticalData = applySubset(input.data, input.hypothetical.subset);
  const contextChanged =
    input.current.task !== input.hypothetical.task ||
    input.current.audience !== input.hypothetical.audience;
  const subsetChanged = hypotheticalData.length !== input.data.length;
  const current = run(input.current, input.data);
  const hypothetical = run(input.hypothetical, hypotheticalData);
  const before = rankingOf(current);
  const after = rankingOf(hypothetical);
  const ids = [...new Set([...before, ...after])];
  const rankChanges = ids.map((id) => {
    const a = current.ranked.find((chart) => chart.id === id);
    const b = hypothetical.ranked.find((chart) => chart.id === id);
    return {
      id,
      title: (b ?? a)!.title,
      currentRank: a?.rank ?? null,
      hypotheticalRank: b?.rank ?? null,
    };
  });
  const factorChanges: FactorChange[] = hypothetical.ranked.flatMap((after) => {
    const before = current.ranked.find((chart) => chart.id === after.id);
    if (!before) return [];
    const changes = (Object.keys(FACTOR_LABELS) as FactorKey[])
      .filter((factor) => before.scoreBreakdown[factor] !== after.scoreBreakdown[factor])
      .map((factor) => ({
        factor,
        label: FACTOR_LABELS[factor],
        current: before.scoreBreakdown[factor],
        hypothetical: after.scoreBreakdown[factor],
        delta: after.scoreBreakdown[factor] - before.scoreBreakdown[factor],
      }));
    return changes.length ? [{ id: after.id, title: after.title, changes }] : [];
  });
  return {
    current,
    hypothetical,
    currentReportCount: input.data.length,
    hypotheticalReportCount: hypotheticalData.length,
    sensitivity:
      contextChanged && subsetChanged
        ? 'both'
        : contextChanged
          ? 'context'
          : subsetChanged
            ? 'evidence_subset'
            : 'none',
    rankingUnchanged: before.length === after.length && before.every((id, i) => id === after[i]),
    topChanged: before[0] !== after[0],
    rankChanges,
    factorChanges,
    attribution:
      contextChanged && subsetChanged
        ? {
            contextOnly: run(input.hypothetical, input.data),
            subsetOnly: run(input.current, hypotheticalData),
          }
        : null,
  };
}
