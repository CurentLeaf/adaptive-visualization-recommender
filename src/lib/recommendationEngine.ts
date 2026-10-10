import type {
  AnalyticTask,
  AudienceMode,
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
  explainExcludedVisualizations,
  recommendVisualizations,
} from './visualizationRecommendations';

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
  explanation: string;
};

export function recommend(request: RecommendationRequest): RecommendationResult {
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
    excluded: explainExcludedVisualizations(request.task, request.profile, request.data),
    explanation:
      `Task: ${TASKS[request.task].label}. ` +
      `MDMP phase: ${MDMP_PHASES[request.context.mdmpPhase]}. ` +
      `Context: ${request.context.echelon}, ${request.context.timeHorizon.replaceAll('_', ' ')}, ` +
      `${request.context.variableClass.replaceAll('_', ' ')} variables. ` +
      `Audience: ${request.audience}. Rankings are inspectable rule-based fit scores, not confidence.`,
  };
}
