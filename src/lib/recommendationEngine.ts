import type {
  AnalyticTask,
  AudienceMode,
  CandidateEvaluation,
  DataProfile,
  ExcludedVisualization,
  MissionContext,
  ModelingRecommendation,
  SalienceWeights,
  VisualizationRecommendation,
} from '../domain/types';
import { TASKS } from '../domain/constants';
import { MDMP_PHASES } from '../domain/mdmp';
import {
  evaluateCandidates,
  explainExcludedVisualizations,
  recommendVisualizations,
} from './visualizationRecommendations';
import {
  recommendImported,
  type ImportedRecommendationRequest,
  type ImportedRecommendationResult,
} from '../imported/candidates';

export type RecommendationDatum = Parameters<typeof recommendVisualizations>[4][number];

export type RecommendationRequest = {
  task: AnalyticTask;
  profile: DataProfile;
  modeling: ModelingRecommendation;
  weights: SalienceWeights;
  data: RecommendationDatum[];
  audience: AudienceMode;
  context: MissionContext;
};

export type RecommendationResult = {
  ranked: VisualizationRecommendation[];
  excluded: ExcludedVisualization[];
  candidates: CandidateEvaluation[];
  explanation: string;
};

export type { ImportedRecommendationRequest, ImportedRecommendationResult };

/** Legacy Cedar Watch requests keep their original shape; imported data uses `dataset: 'imported'`. */
export function recommend(request: RecommendationRequest): RecommendationResult;
export function recommend(request: ImportedRecommendationRequest): ImportedRecommendationResult;
export function recommend(
  request: RecommendationRequest | ImportedRecommendationRequest,
): RecommendationResult | ImportedRecommendationResult {
  if ('dataset' in request && request.dataset === 'imported') return recommendImported(request);
  return recommendCedarWatch(request as RecommendationRequest);
}

function recommendCedarWatch(request: RecommendationRequest): RecommendationResult {
  const ranked = recommendVisualizations(
    request.profile,
    request.task,
    request.modeling,
    request.weights,
    request.data,
    request.audience,
  );
  return {
    ranked,
    candidates: evaluateCandidates(request.task, request.profile, request.data),
    excluded: explainExcludedVisualizations(request.task, request.profile, request.data),
    explanation:
      `Task: ${TASKS[request.task].label}. ` +
      `MDMP phase: ${MDMP_PHASES[request.context.mdmpPhase]}. ` +
      `Context: ${request.context.echelon}, ${request.context.timeHorizon.replaceAll('_', ' ')}, ` +
      `${request.context.variableClass.replaceAll('_', ' ')} variables. ` +
      `Audience: ${request.audience}. Rankings are inspectable rule-based fit scores, not confidence.`,
  };
}
