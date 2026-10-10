import { beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { compile } from 'vega-lite';
import type { TopLevelSpec } from 'vega-lite';
import { generateSyntheticDataset } from '../data/syntheticGenerator';
import { analyzeReports } from '../lib/analysis';
import { DEFAULT_WEIGHTS } from '../domain/constants';
import { DEFAULT_MISSION_CONTEXT, MDMP_TASK_PRESETS } from '../domain/mdmp';
import {
  clearEvaluations,
  evaluationSummary,
  loadEvaluations,
  saveEvaluation,
} from '../lib/evaluation';
import { recommendModels } from '../lib/modelSelection';
import { profileReports } from '../lib/profiler';
import { scoreSalience } from '../lib/salience';
import { buildSituationSummary, countIndependentSimilarReports } from '../lib/situationNarrative';
import { createVegaSpec } from '../lib/vegaSpecFactory';
import { isCompatible, recommendVisualizations } from '../lib/visualizationRecommendations';
import { recommend } from '../lib/recommendationEngine';
import {
  loadRecommendationFeedback,
  recentUsefulRecommendations,
  saveRecommendationFeedback,
} from '../lib/recommendationFeedback';
import {
  createDefaultParallelRanges,
  filterByDimensionRanges,
  normalizeDimensionValue,
  normalizeWithinBounds,
} from '../components/charts/ParallelCoordinates';
const data = generateSyntheticDataset();
const profile = profileReports(data.reports);
const first = data.reports[0];
const datum = [
  {
    ...first,
    day: first.report_time.slice(0, 10),
    source_type: 'sensor',
    source_display_name: 'Observation Team Cedar',
    uncertainty_lower: 1,
    uncertainty_upper: 3,
    salience: 0.5,
  },
];
describe('deterministic synthetic data and profiling', () => {
  it('creates deterministic narrative observations in all five Cedar Watch scenarios', () => {
    expect(data.reports).toHaveLength(24);
    expect(data.sources.map((source) => source.display_name)).toEqual(
      expect.arrayContaining(['Road Patrol Log', 'Radio Log Monitor', 'Community Contact Network']),
    );
    expect(generateSyntheticDataset()).toEqual(data);
    expect(new Set(data.reports.map((r) => r.scenario_id)).size).toBe(5);
    expect(data.sources.map((source) => source.display_name)).toContain('Observation Team Cedar');
    expect(data.locations.map((location) => location.name)).toEqual([
      'Cedar Junction',
      'North Ridge',
      'Pine Crossing',
      'East Depot',
    ]);
    expect(data.locations.every((location) => location.grid_x >= 0 && location.grid_x <= 100)).toBe(
      true,
    );
    expect(
      data.reports.every((report) => report.narrative_summary.includes(report.location_name)),
    ).toBe(true);
    expect(
      data.reports.every((report) =>
        report.narrative_summary.includes(report.observed_at.slice(11, 16)),
      ),
    ).toBe(true);
  });
  it('identifies field roles, missingness, and evidence fields', () => {
    expect(profile.temporalFields).toContain('report_time');
    expect(profile.numericFields).toContain('reported_value');
    expect(profile.categoricalFields).toContain('event_category');
    expect(profile.geographicFields).toEqual([]);
    expect(profile.temporalFields).toContain('observed_at');
    expect(profile.uncertaintyFields).toContain('conflict_score');
    expect(profile.provenanceFields).toContain('source_id');
    expect(profile.fields.find((f) => f.name === 'reported_count')!.missingRate).toBeGreaterThan(0);
    expect(profile.fields.find((field) => field.name === 'reported_count')).toMatchObject({
      analyticRole: 'measure',
      scaleType: 'continuous',
    });
    expect(profile.fields.find((field) => field.name === 'grid_x')).toMatchObject({
      analyticRole: 'dimension',
      scaleType: 'spatial',
    });
    expect(profile.fields.find((field) => field.name === 'source_confidence')?.isUncertainty).toBe(
      true,
    );
    expect(profile.fields.find((field) => field.name === 'source_id')?.isProvenance).toBe(true);
  });
  it('keeps event, report, entity, location, source, and evaluation truth separate', () => {
    expect(data.events.length).toBeLessThan(data.reports.length);
    expect(data.entities.map((entity) => entity.reported_name)).toContain('Red Falcon');
    expect(data.synthetic_ground_truth).toEqual([]);
    expect(data.reports.some((report) => report.reported_actor_name === 'Red Falcon')).toBe(true);
    expect(data.reports.some((report) => report.actor_attribution_status === 'unknown')).toBe(true);
  });
  it('models coherent counts, timing, and independence without summing repeated sightings', () => {
    const consistent = data.reports.filter((report) => report.scenario_id === 'corroboration');
    expect(consistent.map((report) => report.reported_count)).toEqual([6, 6, 7, 5]);
    expect(new Set(consistent.map((report) => report.event_id)).size).toBe(1);
    expect(consistent.every((report) => report.source_independent)).toBe(true);
    expect(new Set(consistent.map((report) => report.source_id)).size).toBe(4);
    expect(consistent.map((report) => report.corroboration_count)).toEqual([3, 3, 3, 3]);
    const disputed = data.reports.filter((report) => report.scenario_id === 'conflict');
    expect(disputed.map((report) => report.reported_count)).toEqual([6, 4, 6, null]);
    expect(disputed.map((report) => report.corroboration_count)).toEqual([1, 0, 1, 0]);
    expect(disputed.every((report) => report.event_id === disputed[0].event_id)).toBe(true);

    const delayed = data.reports.find((report) => report.report_id === 'REP-UNCERTAIN-001')!;
    expect(delayed.observed_at).not.toBe(delayed.received_at);
    expect(delayed.receipt_delay_hours).toBe(4);
    expect(delayed.report_age_hours).toBe(
      Math.round(
        ((Date.parse(data.exerciseAsOfTime) - Date.parse(delayed.observed_at)) / 3_600_000) * 100,
      ) / 100,
    );
    expect(delayed.report_age_hours).toBeLessThan(72);

    const unknown = data.reports.find((report) => report.report_id === 'REP-UNCERTAIN-002')!;
    expect(unknown.reported_count).toBeNull();
    expect(unknown.reported_count_lower).toBeNull();
    expect(unknown.narrative_summary).toContain('unknown count');
    expect(unknown.reported_value).toBeNull();

    const translated = data.reports.find((report) => report.scenario_id === 'quality')!;
    expect(translated.count_precision).toBe('range');
    expect(translated.reported_count_lower).toBe(2);
    expect(translated.reported_count_upper).toBe(4);
    expect(translated.human_verified).toBe(false);
    expect(translated.actor_attribution_status).toBe('suspected_by_source');
  });
  it('does not treat derived or duplicate reports as independent corroboration', () => {
    const consistent = data.reports.filter((report) => report.scenario_id === 'corroboration');
    const derived = {
      ...consistent[1],
      report_id: 'REP-CORROBORATION-DERIVED',
      source_id: consistent[0].source_id,
      derived_from_report_id: consistent[0].report_id,
      source_independent: false,
    };
    expect(derived.source_independent).toBe(false);
    expect(derived.derived_from_report_id).toBe(consistent[0].report_id);
    expect(countIndependentSimilarReports(consistent[0], [...consistent, derived])).toBe(3);
    expect(countIndependentSimilarReports(derived, [...consistent, derived])).toBe(0);
    const relay = data.reports.find((report) => report.report_id === 'REP-UNCERTAIN-003')!;
    const original = data.reports.find((report) => report.report_id === 'REP-UNCERTAIN-001')!;
    expect(relay.derived_from_report_id).toBe(original.report_id);
    expect(relay.source_independent).toBe(false);
    expect(relay.corroboration_count).toBe(0);
    expect(original.corroboration_count).toBe(0);
    expect(
      countIndependentSimilarReports(consistent[0], [
        consistent[0],
        { ...consistent[1], source_id: consistent[0].source_id },
      ]),
    ).toBe(0);
  });
  it('summarizes each exercise scenario without overstating its evidence', () => {
    const scenarioReports = (scenario: string) =>
      data.reports.filter((report) => report.scenario_id === scenario);
    const consistent = buildSituationSummary(scenarioReports('corroboration'), data.sources);
    expect(consistent).toContain('Independent reports give similar counts');
    expect(consistent).toContain('Road Patrol Log');
    expect(consistent).not.toContain('give different counts');
    expect(consistent).toContain('not a verified total inventory');

    const conflict = buildSituationSummary(scenarioReports('conflict'), data.sources);
    expect(conflict).toContain('give different counts');
    expect(conflict).toContain('reason is not established');
    expect(conflict).not.toContain('Radio Log Monitor: unknown');

    expect(buildSituationSummary(scenarioReports('uncertain'), data.sources)).toContain(
      'One report relays another',
    );
    expect(buildSituationSummary(scenarioReports('uncertain'), data.sources)).toContain(
      'received 4.0 exercise hours later',
    );
    expect(buildSituationSummary(scenarioReports('quality'), data.sources)).toContain(
      'remains unverified by a human reviewer',
    );
    const coverage = buildSituationSummary(scenarioReports('anomaly'), data.sources);
    expect(coverage).toContain('reporting coverage both increased');
    expect(coverage).toContain('increased activity is not established');
    expect(buildSituationSummary([], data.sources)).toContain('situation is unknown');
  });
});
describe('salience and models', () => {
  it('calculates descriptive anomalies, rolling means, and quality flags', () => {
    const anomalyRows = data.reports.filter((r) => r.scenario_id === 'anomaly');
    const analyzed = analyzeReports(anomalyRows);
    expect(anomalyRows).toHaveLength(8);
    expect(
      anomalyRows.every((report) => Number.isFinite(analyzed.get(report.report_id)?.zScore)),
    ).toBe(true);
    const degraded = data.reports
      .filter((r) => r.scenario_id === 'quality')
      .find((r) => r.translation_status === 'machine')!;
    expect(
      analyzeReports(data.reports.filter((r) => r.scenario_id === 'quality')).get(
        degraded.report_id,
      )!.qualityFlags,
    ).toContain('machine translated');
    const missing = data.reports.find((report) => report.reported_value === null)!;
    expect(analyzeReports(data.reports).get(missing.report_id)?.zScore).toBeNull();
  });
  it('normalizes salience without treating it as truth', () => {
    const report = data.reports.find((r) => r.scenario_id === 'uncertain')!;
    const result = scoreSalience(report, DEFAULT_WEIGHTS);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.explanation).toContain('not truthfulness');
    expect(report.receipt_delay_hours).toBe(4);
  });
  it('changes contribution predictably with weights', () => {
    const low = scoreSalience(first, { ...DEFAULT_WEIGHTS, anomaly: 0 });
    const high = scoreSalience(first, {
      relevance: 0,
      sourceConfidence: 0,
      freshness: 0,
      impact: 0,
      disagreement: 0,
      anomaly: 3,
    });
    expect(high.components.anomaly).toBe(first.anomaly_score);
    expect(high.score).toBe(first.anomaly_score);
    expect(low.contributions.anomaly).toBe(0);
  });
  it('selects task models and explains missing fields', () => {
    expect(recommendModels(profile, 'analyze_trends')[0].technique).toBe('Temporal trend analysis');
    expect(recommendModels(profile, 'examine_source_conflict')[0].technique).toBe(
      'Source conflict scoring',
    );
    expect(
      recommendModels(
        { ...profile, fields: profile.fields.filter((f) => f.name !== 'observed_at') },
        'analyze_trends',
      )[0].limitations.join(' '),
    ).toContain('Missing fields');
  });
});
describe('visualization rules and specs', () => {
  it('exposes a reusable contextual recommendation API and explains excluded charts', () => {
    const result = recommend({
      profile,
      task: 'compare_categories',
      modeling: recommendModels(profile, 'compare_categories')[0],
      weights: DEFAULT_WEIGHTS,
      data: datum,
      audience: 'Commander',
      context: DEFAULT_MISSION_CONTEXT,
    });
    expect(result.ranked.length).toBeGreaterThan(0);
    expect(result.explanation).toContain('Mission Analysis');
    expect(result.explanation).toContain('Commander');
    expect(
      result.excluded.some((candidate) => candidate.reason.includes('curated candidate set')),
    ).toBe(true);
    expect(MDMP_TASK_PRESETS.find((preset) => preset.id === 'compare_coas')?.analyticTask).toBe(
      undefined,
    );
  });

  it('returns ranked task-compatible charts with evidence fields', () => {
    for (const task of [
      'compare_categories',
      'analyze_trends',
      'detect_anomalies',
      'examine_source_conflict',
      'assess_confidence',
      'explore_provenance',
    ] as const) {
      const recs = recommendVisualizations(
        profile,
        task,
        recommendModels(profile, task)[0],
        DEFAULT_WEIGHTS,
        datum,
      );
      expect(recs.length).toBeGreaterThanOrEqual(2);
      expect(recs[0].rank).toBe(1);
      expect(new Set(recs[0].fieldsUsed).size).toBe(recs[0].fieldsUsed.length);
      expect(recs[0].requiredInputFields.every((field) => recs[0].fieldsUsed.includes(field))).toBe(
        true,
      );
      expect(recs[0].suitabilityScore).toBeGreaterThanOrEqual(recs[1].suitabilityScore);
      for (const recommendation of recs) {
        expect(
          Object.values(recommendation.scoreBreakdown).reduce((sum, score) => sum + score, 0),
        ).toBe(recommendation.suitabilityScore);
      }
    }
    expect(isCompatible('analyze_trends', 'bar', profile)).toBe(false);
    expect(isCompatible('compare_categories', 'dot_plot', profile)).toBe(true);
    const categoryCharts = recommendVisualizations(
      profile,
      'compare_categories',
      recommendModels(profile, 'compare_categories')[0],
      DEFAULT_WEIGHTS,
      datum,
    );
    expect(
      categoryCharts
        .find((recommendation) => recommendation.chartPattern === 'dot_plot')
        ?.fieldsUsed.includes('reported_count'),
    ).toBe(true);
    const mixedUnits = recommendVisualizations(
      profile,
      'examine_source_conflict',
      recommendModels(profile, 'examine_source_conflict')[0],
      DEFAULT_WEIGHTS,
      [...datum, { ...datum[0], report_id: 'mixed-unit', count_unit: 'people' }],
    );
    expect(
      mixedUnits.some((recommendation) =>
        ['dot_plot', 'error_bar'].includes(recommendation.chartPattern),
      ),
    ).toBe(false);
    const scatter = recommendVisualizations(
      profile,
      'examine_source_conflict',
      recommendModels(profile, 'examine_source_conflict')[0],
      DEFAULT_WEIGHTS,
      datum,
    ).find((recommendation) => recommendation.chartPattern === 'dot_plot')!;
    expect(scatter.technique).toBe('Grouped range-and-dot plot');
    expect(scatter.visualEncodings.x).toContain('reported_count');
    expect(scatter.doesNotEstablish).toContain('verified total inventory');
  });
  it('creates compilable Vega-Lite specs and an interval interaction', () => {
    for (const pattern of [
      'observation_timeline',
      'error_band',
      'line',
      'area',
      'map',
      'scatter',
      'layered_scatter',
      'bar',
      'heatmap',
      'error_bar',
      'dot_plot',
      'table_detail',
      'parallel_coordinates',
    ] as const) {
      const spec = createVegaSpec(pattern, datum);
      expect(spec.$schema).toContain('vega-lite');
      expect(() => compile(spec as unknown as TopLevelSpec)).not.toThrow();
    }
    expect(JSON.stringify(createVegaSpec('error_band', datum))).toContain('timeBrush');
    expect(JSON.stringify(createVegaSpec('error_band', datum))).toContain('uncertainty_lower');
    const parallelSpec = createVegaSpec('parallel_coordinates', datum);
    expect(JSON.stringify(parallelSpec)).toContain('report_id');
    expect(JSON.stringify(parallelSpec)).toContain('isValid(datum.raw_value)');
    expect(() => compile(parallelSpec as unknown as TopLevelSpec)).not.toThrow();
  });
  it('uses fixed full-dataset parallel bounds and preserves unknown values', () => {
    const ranges = createDefaultParallelRanges();
    expect(normalizeDimensionValue('report_age_hours', 36)).toBe(0.5);
    expect(normalizeDimensionValue('corroboration_count', null)).toBeUndefined();
    expect(normalizeWithinBounds(7, 7, 7)).toBe(0.5);
    expect(
      filterByDimensionRanges(
        [{ report_age_hours: 20 }, { report_age_hours: 60 }, { report_age_hours: null }],
        { report_age_hours: [0, 36] },
      ),
    ).toEqual([{ report_age_hours: 20 }]);
    expect(ranges.report_age_hours).toEqual([0, 72]);
  });

  it('stores feedback with task and audience context and lists recent useful patterns', () => {
    localStorage.clear();
    const feedback = {
      recommendationId: 'compare_categories-dot_plot',
      title: 'Reported quantity by source',
      chartPattern: 'dot_plot' as const,
      analyticTask: 'compare_categories' as const,
      audienceMode: 'Commander' as const,
      context: DEFAULT_MISSION_CONTEXT,
      filteredRowCount: 4,
      dataCharacteristics: {
        rowCount: 4,
        fieldCount: 2,
        fieldsWithMissingValues: ['reported_count'],
        uncertaintyFields: ['source_confidence', 'missingness_score'],
        temporalFields: ['observed_at'],
        quantitativeFields: ['reported_count'],
        categoricalFields: ['source_id'],
      },
      decision: 'useful' as const,
      reason: 'Fits the task',
      timestamp: '2026-10-10T00:00:00.000Z',
    };
    expect(saveRecommendationFeedback(feedback)).toEqual([feedback]);
    expect(loadRecommendationFeedback()).toEqual([feedback]);
    expect(recentUsefulRecommendations(loadRecommendationFeedback())).toEqual([feedback]);
    saveRecommendationFeedback({
      ...feedback,
      decision: 'not_useful',
      reason: 'Too simple for analysis',
    });
    expect(recentUsefulRecommendations(loadRecommendationFeedback())).toEqual([]);
  });
  it('includes the requested usage story', () => {
    expect(existsSync('docs/usage-story.md')).toBe(true);
  });
});
describe('local evaluation log', () => {
  beforeEach(() => clearEvaluations());
  it('migrates version-1 records in memory and retains the legacy entry', () => {
    const legacyRecord = {
      sessionId: 'legacy-session',
      scenarioId: 'corroboration',
      analyticTask: 'examine_source_conflict',
      chartSelected: 'dot_plot',
      filters: {
        start: '',
        end: '',
        region: '',
        category: '',
        sourceType: '',
        minConfidence: 0,
        minValidation: 0,
        minConflict: 0,
        translation: '',
        verified: '',
      },
      visualInteractions: [],
      selectedReports: ['REP-CORROBORATION-001'],
      timeToAnswerMs: 12000,
      submittedAnswer: 'answer',
      expectedAnswer: 'answer',
      correct: true,
      userConfidence: 4,
      timestamp: '2035-04-02T12:00:00-04:00',
    };
    localStorage.setItem('avr-evaluations-v1', JSON.stringify([legacyRecord]));

    expect(loadEvaluations()[0]).toMatchObject({
      sessionId: 'legacy-session',
      schemaVersion: 2,
      questionId: 'corroboration-legacy-v1',
      audienceMode: 'Commander',
    });
    expect(localStorage.getItem('avr-evaluations-v1')).not.toBeNull();
    expect(localStorage.getItem('avr-evaluations-v2')).toBeNull();
  });
  it('stores validated records and summarizes results', () => {
    const record = {
      sessionId: 'test',
      scenarioId: 'anomaly' as const,
      analyticTask: 'detect_anomalies' as const,
      chartSelected: 'line',
      filters: {
        start: '',
        end: '',
        region: '',
        category: '',
        sourceType: '',
        minConfidence: 0,
        minValidation: 0,
        minConflict: 0,
        translation: '',
        verified: '',
      },
      visualInteractions: [],
      selectedReports: [],
      timeToAnswerMs: 12000,
      submittedAnswer: 'x',
      expectedAnswer: 'x',
      correct: true,
      userConfidence: 4,
      timestamp: new Date().toISOString(),
      schemaVersion: 2 as const,
      questionId: 'apparent-activity-increase',
      audienceMode: 'Analyst' as const,
    };
    expect(saveEvaluation(record)).toHaveLength(1);
    expect(loadEvaluations()[0].correct).toBe(true);
    expect(evaluationSummary(loadEvaluations()).meanTimeSeconds).toBe(12);
  });
});
