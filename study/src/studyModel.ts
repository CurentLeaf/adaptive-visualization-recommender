import { generateSyntheticDataset } from '../../src/data/syntheticGenerator';
import { DEFAULT_WEIGHTS } from '../../src/domain/constants';
import { DEFAULT_MISSION_CONTEXT } from '../../src/domain/mdmp';
import type { AnalyticTask, Dataset, Report, ScenarioId } from '../../src/domain/types';
import { analyzeReports } from '../../src/lib/analysis';
import { recommend } from '../../src/lib/recommendationEngine';
import { recommendModels } from '../../src/lib/modelSelection';
import { profileReports } from '../../src/lib/profiler';
import { scoreSalience } from '../../src/lib/salience';
import type { RecommendationDatum } from '../../src/lib/recommendationEngine';
import type { ModelingRecommendation, VisualizationRecommendation } from '../../src/domain/types';
import { STIMULUS_SEED } from './protocol';

const dataset = generateSyntheticDataset(STIMULUS_SEED);

const studyTasks: Record<ScenarioId, AnalyticTask> = {
  corroboration: 'compare_categories',
  conflict: 'examine_source_conflict',
  uncertain: 'explore_provenance',
  quality: 'assess_confidence',
  anomaly: 'analyze_trends',
};

export type StudyScenarioView = {
  data: Dataset;
  reports: Report[];
  modeling: ModelingRecommendation;
  recommendations: VisualizationRecommendation[];
  analysis: Map<string, ReturnType<typeof analyzeReports> extends Map<string, infer T> ? T : never>;
  salience: Map<string, ReturnType<typeof scoreSalience>>;
};

const viewCache = new Map<ScenarioId, StudyScenarioView>();

export function getScenarioView(scenario: ScenarioId): StudyScenarioView {
  const existing = viewCache.get(scenario);
  if (existing) return existing;

  const reports = dataset.reports.filter((report) => report.scenario_id === scenario);
  const profile = profileReports(reports);
  const task = studyTasks[scenario];
  const models = recommendModels(profile, task);
  const modeling = models[0];
  const analysis = analyzeReports(reports);
  const sources = new Map(dataset.sources.map((source) => [source.source_id, source]));
  const outputs = new Map(dataset.model_outputs.map((output) => [output.report_id, output]));
  const chartData = reports.map((report) => {
    const output = outputs.get(report.report_id);
    const derived = analysis.get(report.report_id);
    return {
      ...report,
      day: report.observed_at.slice(0, 10),
      source_type: sources.get(report.source_id)?.source_type ?? 'unknown',
      source_display_name: sources.get(report.source_id)?.display_name ?? 'Source name not recorded',
      uncertainty_lower: output?.uncertainty_lower ?? null,
      uncertainty_upper: output?.uncertainty_upper ?? null,
      z_score: derived?.zScore ?? null,
      rolling_mean: derived?.rollingMean ?? null,
      event_conflict: derived?.eventConflict ?? 0,
      distinct_source_count: derived?.distinctSourceCount ?? 0,
      salience: scoreSalience(report, DEFAULT_WEIGHTS).score,
      is_selected: false,
    } satisfies RecommendationDatum;
  });
  const result = recommend({
    profile,
    task,
    modeling,
    weights: DEFAULT_WEIGHTS,
    data: chartData,
    audience: 'Analyst',
    context: DEFAULT_MISSION_CONTEXT,
  });
  const salience = new Map(
    reports.map((report) => [report.report_id, scoreSalience(report, DEFAULT_WEIGHTS)]),
  );
  const scenarioView: StudyScenarioView = {
    data: {
      ...dataset,
      reports,
      events: dataset.events.filter((event) => event.scenario_id === scenario),
      provenance: dataset.provenance.filter((item) =>
        reports.some((report) => report.report_id === item.report_id),
      ),
      model_outputs: dataset.model_outputs.filter((item) =>
        reports.some((report) => report.report_id === item.report_id),
      ),
      synthetic_ground_truth: [],
    },
    reports,
    modeling,
    recommendations: result.ranked,
    analysis,
    salience,
  };
  viewCache.set(scenario, scenarioView);
  return scenarioView;
}

export const sourceCommit = () =>
  typeof __SOURCE_COMMIT__ === 'string' ? __SOURCE_COMMIT__ : 'development';

declare const __SOURCE_COMMIT__: string;
