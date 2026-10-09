import type {
  AnalyticTask,
  AudienceMode,
  ChartPattern,
  DataProfile,
  ModelingRecommendation,
  SalienceWeights,
  SuitabilityBreakdown,
  VisualizationRecommendation,
  Report,
} from '../domain/types';
import { createVegaSpec } from './vegaSpecFactory';

type Datum = Report & {
  day: string;
  source_type: string;
  source_display_name?: string;
  uncertainty_lower: number | null;
  uncertainty_upper: number | null;
  salience: number;
};

const patterns: Record<AnalyticTask, ChartPattern[]> = {
  compare_categories: ['dot_plot', 'table_detail', 'bar'],
  analyze_trends: ['line', 'table_detail'],
  detect_anomalies: ['line', 'table_detail'],
  examine_source_conflict: ['dot_plot', 'table_detail', 'heatmap', 'parallel_coordinates'],
  assess_confidence: ['error_bar', 'scatter', 'table_detail', 'parallel_coordinates'],
  explore_provenance: ['observation_timeline', 'table_detail', 'scatter'],
};

const requiredFields: Record<ChartPattern, string[]> = {
  observation_timeline: ['report_title', 'observed_at', 'received_at', 'receipt_delay_hours'],
  bar: ['observation_type'],
  dot_plot: ['report_title', 'reported_count', 'count_unit', 'source_id', 'event_id'],
  line: ['observed_at', 'report_id'],
  area: ['observed_at', 'report_id'],
  scatter: ['source_confidence', 'validation_score'],
  heatmap: ['source_id', 'item_type', 'conflict_score'],
  map: ['grid_x', 'grid_y'],
  error_bar: ['report_title', 'reported_count_lower', 'reported_count_upper', 'count_unit'],
  error_band: ['report_time', 'reported_value', 'uncertainty_lower', 'uncertainty_upper'],
  layered_scatter: ['source_confidence', 'validation_score'],
  faceted_view: ['event_category', 'reported_value'],
  linked_views: ['report_id'],
  table_detail: ['report_id'],
  parallel_coordinates: [
    'source_confidence',
    'validation_score',
    'corroboration_count',
    'conflict_score',
    'report_age_hours',
    'missingness_score',
  ],
};

const optionalFields: Partial<Record<ChartPattern, string[]>> = {
  observation_timeline: ['source_id', 'source_independent', 'event_id'],
  dot_plot: [
    'report_id',
    'observed_at',
    'count_precision',
    'reported_count_lower',
    'reported_count_upper',
    'source_independent',
  ],
  scatter: ['human_verified', 'report_id', 'event_category'],
  map: ['report_id', 'event_category', 'human_verified'],
  table_detail: [
    'event_id',
    'source_id',
    'event_category',
    'source_confidence',
    'validation_score',
    'conflict_score',
    'human_verified',
    'anomaly_score',
  ],
  parallel_coordinates: ['anomaly_score', 'report_id'],
};

const titles: Record<ChartPattern, string> = {
  observation_timeline: 'Observation and receipt time by report',
  bar: 'Number of reports by observation type',
  dot_plot: 'Reported quantity by source',
  line: 'Number of reports over exercise time',
  area: 'Number of reports over exercise time',
  scatter: 'Source confidence versus validation score',
  heatmap: 'Reported conflict by source and item type',
  map: 'Reported observations on the fictional exercise grid',
  error_bar: 'Source-reported quantity ranges by report',
  error_band: 'Trend with illustrative model bounds',
  layered_scatter: 'Evidence comparison scatterplot',
  faceted_view: 'Category comparison',
  linked_views: 'Linked report views',
  table_detail: 'Report detail table',
  parallel_coordinates: 'Multivariate evidence profiles',
};

const techniqueNames: Record<ChartPattern, string> = {
  observation_timeline: 'Observation-to-receipt timeline',
  bar: 'Bar chart',
  dot_plot: 'Grouped range-and-dot plot',
  line: 'Line chart',
  area: 'Area chart',
  scatter: 'Scatterplot',
  heatmap: 'Heatmap',
  map: 'Fictional-grid point plot',
  error_bar: 'Grouped range-and-dot plot',
  error_band: 'Error-band chart',
  layered_scatter: 'Scatterplot',
  faceted_view: 'Faceted bar chart',
  linked_views: 'Linked charts',
  table_detail: 'Detail table',
  parallel_coordinates: 'Parallel coordinates plot',
};

const units: Record<ChartPattern, string> = {
  observation_timeline: 'One report per row; observation and receipt times',
  bar: 'Observation type (number of reports)',
  dot_plot: 'One source-reported quantity per report',
  line: 'Time interval (exercise hour; number of reports)',
  area: 'Time interval (exercise hour; number of reports)',
  scatter: 'One report per point',
  heatmap: 'Source × reported item type',
  map: 'One report per point',
  error_bar: 'One report per row; source-reported quantity range',
  error_band: 'Time interval (day)',
  layered_scatter: 'One report per point',
  faceted_view: 'Event category',
  linked_views: 'One report per linked mark',
  table_detail: 'One report per row',
  parallel_coordinates: 'One report per line',
};

const encodings: Record<ChartPattern, VisualizationRecommendation['visualEncodings']> = {
  observation_timeline: {
    x: 'observed_at → received_at',
    y: 'report_title',
    color: 'time type (observation or receipt)',
    tooltip: ['report_title', 'source_id', 'observed_at', 'received_at', 'receipt_delay_hours'],
  },
  bar: { x: 'observation_type', y: 'report_count', tooltip: ['observation_type', 'report_count'] },
  dot_plot: {
    x: 'reported_count; reported_count_lower → reported_count_upper',
    y: 'report_title',
    color: 'source display name',
    tooltip: [
      'report_title',
      'report_id',
      'event_id',
      'source_id',
      'reported_count',
      'count_unit',
      'count_precision',
      'observed_at',
    ],
  },
  line: {
    x: 'observed_at',
    y: 'count(report_id)',
    tooltip: ['observed_at', 'report_count'],
  },
  area: {
    x: 'observed_at',
    y: 'count(report_id)',
    tooltip: ['observed_at', 'report_count'],
  },
  scatter: {
    x: 'source_confidence',
    y: 'validation_score',
    color: 'event_category',
    shape: 'human_verified',
    tooltip: [
      'report_id',
      'source_confidence',
      'validation_score',
      'event_category',
      'human_verified',
    ],
  },
  heatmap: {
    x: 'source display name',
    y: 'item_type',
    color: 'mean(conflict_score)',
    tooltip: ['source_id', 'event_category', 'mean(conflict_score)'],
  },
  map: {
    x: 'grid_x',
    y: 'grid_y',
    color: 'event_category',
    tooltip: ['report_id', 'latitude', 'longitude'],
  },
  error_bar: {
    x: 'reported_count_lower → reported_count_upper; point = reported_count',
    y: 'report_title',
    tooltip: ['report_title', 'reported_count', 'count_unit', 'count_precision'],
  },
  error_band: {
    x: 'day (derived from report_time)',
    y: 'mean(reported_value)',
    color: 'uncertainty_lower → uncertainty_upper; illustrative bounds',
    tooltip: ['day', 'mean(reported_value)', 'uncertainty_lower', 'uncertainty_upper'],
  },
  layered_scatter: {
    x: 'source_confidence',
    y: 'validation_score',
    color: 'event_category',
    shape: 'human_verified',
    tooltip: ['report_id', 'source_confidence', 'validation_score', 'conflict_score'],
  },
  faceted_view: { x: 'event_category', y: 'reported_value' },
  linked_views: { tooltip: ['report_id'] },
  table_detail: {
    tooltip: [
      'report_id',
      'event_id',
      'source_id',
      'event_category',
      'source_confidence',
      'validation_score',
      'conflict_score',
      'human_verified',
      'anomaly_score',
    ],
  },
  parallel_coordinates: {
    x: 'ordered evidence dimensions',
    y: 'normalized value (0–1)',
    color: 'report_id',
    tooltip: ['report_id', ...requiredFields.parallel_coordinates],
  },
};

const dedupe = (values: string[]) => [...new Set(values)];
const derivedOutputs: Partial<Record<ChartPattern, string[]>> = {
  observation_timeline: ['receipt_delay_hours'],
  bar: ['report_count'],
  line: ['report_count'],
  area: ['report_count'],
  dot_plot: ['verification_label'],
  scatter: ['verification_label'],
  map: ['verification_label'],
  layered_scatter: ['verification_label'],
  heatmap: ['mean_conflict_score'],
  error_band: ['day', 'mean_reported_value', 'mean_uncertainty_lower', 'mean_uncertainty_upper'],
  parallel_coordinates: ['normalized_value'],
};

function taskFit(task: AnalyticTask, pattern: ChartPattern): number {
  if (task === 'compare_categories')
    return ['dot_plot', 'table_detail'].includes(pattern) ? 22 : 16;
  if (task === 'analyze_trends') return ['line', 'table_detail'].includes(pattern) ? 22 : 16;
  if (task === 'examine_source_conflict')
    return ['dot_plot', 'table_detail'].includes(pattern) ? 22 : 16;
  if (task === 'assess_confidence')
    return ['error_bar', 'scatter'].includes(pattern) ? 22 : 16;
  if (task === 'detect_anomalies')
    return ['line', 'table_detail'].includes(pattern) ? 22 : 16;
  if (task === 'explore_provenance')
    return ['observation_timeline', 'table_detail'].includes(pattern) ? 22 : 16;
  return ['scatter', 'line'].includes(pattern) ? 22 : 16;
}

export function isCompatible(
  task: AnalyticTask,
  pattern: ChartPattern,
  profile: DataProfile,
): boolean {
  if (!patterns[task].includes(pattern)) return false;
  if (
    task === 'compare_categories' &&
    !profile.fields.some((field) => field.name === 'reported_count')
  )
    return false;
  if (
    task === 'analyze_trends' &&
    (!profile.temporalFields.includes('observed_at') ||
      !profile.fields.some((field) => field.name === 'report_id'))
  )
    return false;
  if (pattern === 'parallel_coordinates' && profile.numericFields.length < 4) return false;
  const available = new Set([
    ...profile.fields.map((field) => field.name),
    'day',
    'uncertainty_lower',
    'uncertainty_upper',
    'source_display_name',
  ]);
  return requiredFields[pattern].every((field) => available.has(field));
}

export function recommendVisualizations(
  profile: DataProfile,
  task: AnalyticTask,
  model: ModelingRecommendation,
  weights: SalienceWeights,
  data: Datum[],
  audience: AudienceMode = 'Analyst',
): VisualizationRecommendation[] {
  const weightFocus =
    weights.disagreement > weights.sourceConfidence
      ? 'Current salience weights emphasize disagreement.'
      : 'Current salience weights do not treat source confidence as truth.';
  return patterns[task]
    .filter((pattern) => isCompatible(task, pattern, profile))
    .filter((pattern) => {
      if (!['dot_plot', 'error_bar'].includes(pattern)) return true;
      return new Set(data.map((report) => report.count_unit)).size <= 1;
    })
    .map((pattern) => {
      const availableFields = new Set([
        ...profile.fields.map((field) => field.name),
        'day',
        'uncertainty_lower',
        'uncertainty_upper',
        'source_display_name',
      ]);
      const used = dedupe([
        ...requiredFields[pattern],
        ...(derivedOutputs[pattern] ?? []),
        ...(['line', 'area', 'error_band'].includes(pattern) ? ['day'] : []),
        ...(pattern === 'observation_timeline' ? ['source_display_name'] : []),
        ...(pattern === 'dot_plot' || pattern === 'error_bar'
          ? ['source_display_name']
          : []),
        ...(optionalFields[pattern] ?? []).filter((field) => availableFields.has(field)),
      ]);
      const visibleUncertainty = [
        'dot_plot',
        'scatter',
        'error_bar',
        'error_band',
        'heatmap',
        'parallel_coordinates',
      ].includes(pattern);
      const inspectableProvenance = used.some((field) =>
        ['report_id', 'event_id', 'source_id'].includes(field),
      );
      const modelingOutputMatch = model.outputFields.filter(
        (field) => used.includes(field) || (derivedOutputs[pattern] ?? []).includes(field),
      );
      const readable =
        data.length > 100 && ['table_detail', 'parallel_coordinates'].includes(pattern) ? 3 : 8;
      const audiencePenalty =
        audience === 'Commander' && ['parallel_coordinates', 'table_detail'].includes(pattern)
          ? -10
          : 0;
      const interactionPenalty =
        pattern === 'parallel_coordinates'
          ? -5
          : pattern === 'line' || pattern === 'observation_timeline'
            ? -2
            : 0;
      const singleUnit =
        data.length > 0 &&
        new Set(data.map((report) => report.count_unit)).size === 1 &&
        data.every((report) => report.count_unit.length > 0 && report.item_type.length > 0);
      const episodeSizes = new Map<string, number>();
      data.forEach((report) =>
        episodeSizes.set(report.event_id, (episodeSizes.get(report.event_id) ?? 0) + 1),
      );
      const hasComparableEpisode = [...episodeSizes.values()].some((size) => size > 1);
      const hasComparableTimes =
        data.length > 1 &&
        Math.max(...data.map((report) => Date.parse(report.observed_at))) -
          Math.min(...data.map((report) => Date.parse(report.observed_at))) <=
          3_600_000;
      const quantityUnitCompatibility =
        singleUnit && ['dot_plot', 'error_bar', 'table_detail'].includes(pattern) ? 10 : 0;
      const episodeGrouping =
        hasComparableEpisode && ['dot_plot', 'table_detail', 'heatmap'].includes(pattern) ? 7 : 3;
      const timeComparability =
        pattern === 'observation_timeline'
          ? 7
          : hasComparableTimes && ['dot_plot', 'table_detail'].includes(pattern)
            ? 7
            : 3;
      const scoreBreakdown: SuitabilityBreakdown = {
        taskFit: taskFit(task, pattern),
        fieldCompatibility: 18,
        modelingOutputFit: modelingOutputMatch.length ? 10 : 6,
        uncertaintyVisibility: visibleUncertainty ? 10 : 4,
        provenanceInspectability: inspectableProvenance ? 8 : 0,
        readability: readable,
        interactionBurden: interactionPenalty,
        audienceComplexity: audiencePenalty,
        quantityUnitCompatibility,
        episodeGrouping,
        timeComparability,
      };
      const suitabilityScore = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
      const locations = [...new Set(data.map((report) => report.location_name))];
      const locationPhrase =
        locations.length === 1 ? locations[0] : 'the listed fictional locations';
      const item = data[0]?.item_type ?? 'reported items';
      const itemLabel = item === 'personnel' ? 'personnel' : `${item}s`;
      const title =
        pattern === 'dot_plot' || pattern === 'error_bar'
          ? `Reported ${itemLabel} by source — ${locationPhrase}`
          : pattern === 'observation_timeline'
            ? 'Observation and receipt times by report'
            : pattern === 'map'
              ? 'Reported observations on the fictional grid'
              : titles[pattern];
      const answersQuestion =
        pattern === 'dot_plot' || pattern === 'error_bar'
          ? `What ${itemLabel} quantities did sources report near ${locationPhrase}?`
          : pattern === 'observation_timeline'
            ? 'When was each observation made, and when did its report arrive?'
            : pattern === 'map'
              ? 'Which fictional locations have reports in this view?'
              : pattern === 'line' || pattern === 'area'
                ? 'How many reports were recorded over exercise time?'
                : `What does this ${techniqueNames[pattern].toLowerCase()} show about the selected reports?`;
      const doesNotEstablish =
        pattern === 'dot_plot' || pattern === 'error_bar'
          ? 'It does not establish the number of distinct vehicles or people. Reports may describe the same items; counts are not a verified total inventory.'
          : pattern === 'line' || pattern === 'area'
            ? 'Report frequency is not a count of distinct vehicles or personnel and does not establish increased activity.'
            : pattern === 'observation_timeline'
              ? 'The timeline distinguishes observation from receipt; it does not explain reporting delays or establish when an episode began or ended.'
              : pattern === 'map'
                ? 'The exercise grid is fictional and local; it is not geographic and shows no real-world coordinates.'
                : 'A visualization does not verify the source-reported claim or resolve unknown information.';
      const rationale = [
        pattern === 'dot_plot' || pattern === 'error_bar'
          ? `${techniqueNames[pattern]} compares each source-reported ${item} quantity in ${data[0]?.count_unit ?? 'its stated unit'} without summing repeated reports. It preserves source-reported ranges.`
          : pattern === 'observation_timeline'
            ? 'Separate markers retain observation and receipt times for each report; the connector represents elapsed reporting delay.'
            : pattern === 'line' || pattern === 'area'
              ? 'This view counts reports by observation time; it describes reporting frequency, not the amount of activity.'
              : `${techniqueNames[pattern]} supports ${task.replaceAll('_', ' ')} using ${requiredFields[pattern].join(', ')}.`,
        visibleUncertainty
          ? 'Keeps evidence-quality measures visible as separate dimensions.'
          : 'Aggregation or reduced encoding may conceal report-level disagreement; inspect the linked evidence.',
        `${audience} mode ${audiencePenalty < 0 ? 'applies a separate complexity penalty' : 'does not apply a complexity penalty'} for this technique.`,
        modelingOutputMatch.length
          ? `The chart exposes selected model output(s): ${modelingOutputMatch.join(', ')}.`
          : `The selected model output (${model.outputFields.join(', ')}) is not directly encoded in this chart; inspect model details separately.`,
      ];
      if (task === 'explore_provenance') {
        rationale.push(
          'Selecting a report opens its recorded six-stage evidence trail; report/source identity links the view to that trail.',
        );
      }
      return {
        id: `${task}-${pattern}`,
        title,
        technique: techniqueNames[pattern],
        unitOfAnalysis: units[pattern],
        rank: 0,
        suitabilityScore,
        scoreBreakdown,
        task,
        modelingTechnique: model.technique,
        chartPattern: pattern,
        rationale: [...rationale, weightFocus],
        answersQuestion,
        doesNotEstablish,
        assumptions: [...model.assumptions],
        cautions: [
          ...model.limitations,
          'Suitability is a rule-based fit score, not report confidence or a validated probability.',
          'High salience means attention priority, not verified truth.',
          ...(pattern === 'error_band'
            ? [
                'The displayed model bounds are synthetic and illustrative, not statistically calibrated confidence or prediction intervals.',
              ]
            : []),
          ...(pattern === 'dot_plot' || pattern === 'error_bar'
            ? [
                'Reported ranges are source estimates, not statistical confidence intervals. Unknown quantities remain unknown.',
              ]
            : []),
          doesNotEstablish,
          ...(pattern === 'parallel_coordinates'
            ? [
                'Axis order changes which relationships are easy to see; this plot does not establish causality.',
              ]
            : []),
          ...(interactionPenalty < 0
            ? [
                `Interaction burden penalty: ${interactionPenalty}; ${pattern === 'parallel_coordinates' ? 'axis controls' : 'selecting and comparing report times'} add interaction steps.`,
              ]
            : []),
        ],
        requiredInputFields: [...requiredFields[pattern]],
        optionalInputFields: (optionalFields[pattern] ?? []).filter((field) =>
          availableFields.has(field),
        ),
        fieldsUsed: used,
        derivedOutputFields: [...(derivedOutputs[pattern] ?? [])],
        visualEncodings: encodings[pattern],
        interactions: [
          'click to select a report',
          'keyboard-accessible selectable report table',
          ...(pattern === 'line' || pattern === 'error_band' ? ['time interval brush'] : []),
        ],
        vegaLiteSpec: createVegaSpec(pattern, data),
      };
    })
    .sort((a, b) => b.suitabilityScore - a.suitabilityScore)
    .map((recommendation, index) => ({ ...recommendation, rank: index + 1 }));
}
