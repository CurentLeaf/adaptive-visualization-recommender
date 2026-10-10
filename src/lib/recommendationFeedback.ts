import type { RecommendationFeedback } from '../domain/types';
import { z } from 'zod';

export const RECOMMENDATION_FEEDBACK_KEY = 'avr-recommendation-feedback-v1';
const MAX_FEEDBACK_RECORDS = 500;
const feedbackSchema = z.object({
  recommendationId: z.string(),
  title: z.string(),
  chartPattern: z.enum([
    'observation_timeline',
    'bar',
    'dot_plot',
    'line',
    'area',
    'scatter',
    'heatmap',
    'map',
    'error_bar',
    'error_band',
    'layered_scatter',
    'faceted_view',
    'linked_views',
    'table_detail',
    'parallel_coordinates',
  ]),
  analyticTask: z.enum([
    'compare_categories',
    'analyze_trends',
    'detect_anomalies',
    'examine_source_conflict',
    'assess_confidence',
    'explore_provenance',
  ]),
  audienceMode: z.enum(['Commander', 'Analyst']),
  context: z.object({
    mdmpPhase: z.enum([
      'mission_analysis',
      'coa_development',
      'coa_analysis',
      'coa_comparison',
      'orders_production',
    ]),
    echelon: z.enum(['battalion', 'brigade', 'division']),
    timeHorizon: z.enum(['current', '24_hours', '72_hours', 'one_week']),
    variableClass: z.enum(['friendly', 'enemy', 'terrain', 'civil_considerations', 'mixed']),
  }),
  filteredRowCount: z.number().int().nonnegative(),
  dataCharacteristics: z.object({
    rowCount: z.number().int().nonnegative(),
    fieldCount: z.number().int().nonnegative(),
    fieldsWithMissingValues: z.array(z.string()),
    uncertaintyFields: z.array(z.string()),
    temporalFields: z.array(z.string()),
    quantitativeFields: z.array(z.string()),
    categoricalFields: z.array(z.string()),
  }),
  decision: z.enum(['useful', 'not_useful']),
  reason: z.string(),
  timestamp: z.string(),
});

export function loadRecommendationFeedback(): RecommendationFeedback[] {
  const raw = localStorage.getItem(RECOMMENDATION_FEEDBACK_KEY);
  if (!raw) return [];
  return z.array(feedbackSchema).parse(JSON.parse(raw));
}

export function saveRecommendationFeedback(
  feedback: RecommendationFeedback,
): RecommendationFeedback[] {
  const next = [...loadRecommendationFeedback(), feedback].slice(-MAX_FEEDBACK_RECORDS);
  localStorage.setItem(RECOMMENDATION_FEEDBACK_KEY, JSON.stringify(next));
  return next;
}

export function recentUsefulRecommendations(
  feedback: RecommendationFeedback[],
): RecommendationFeedback[] {
  const seen = new Set<string>();
  return feedback
    .slice()
    .reverse()
    .filter((entry) => {
      if (seen.has(entry.recommendationId)) return false;
      seen.add(entry.recommendationId);
      return entry.decision === 'useful';
    })
    .slice(0, 3);
}
