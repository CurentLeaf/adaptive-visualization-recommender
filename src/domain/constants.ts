import type { AnalyticTask, SalienceWeights, ScenarioId } from './types';
export const DATA_LABEL = 'Fictional Research Dataset — Not Operational Data';
export const DEFAULT_WEIGHTS: SalienceWeights = {
  relevance: 1,
  sourceConfidence: 1,
  freshness: 1,
  impact: 1,
  disagreement: 1,
  anomaly: 1,
};
export const TASKS: Record<
  AnalyticTask,
  {
    label: string;
    description: string;
    preferredFields: string[];
    interactions: string[];
    antiPatterns: string[];
  }
> = {
  compare_categories: {
    label: 'Compare reported quantities',
    description:
      'Compare source-reported counts for the same kind of item; repeated reports are not added into inventory.',
    preferredFields: ['report_title', 'reported_count', 'count_unit', 'source_id', 'event_id'],
    interactions: ['select report', 'compare reports'],
    antiPatterns: ['summing reports as inventory', 'mixing personnel and equipment units'],
  },
  analyze_trends: {
    label: 'Review report frequency over time',
    description:
      'Count reports over exercise time and distinguish reporting coverage from established activity.',
    preferredFields: ['observed_at', 'received_at', 'source_id'],
    interactions: ['time brush', 'select report'],
    antiPatterns: ['labeling report frequency as activity or inventory'],
  },
  detect_anomalies: {
    label: 'Identify anomalies',
    description: 'Find unusual observations using an explainable z-score.',
    preferredFields: ['report_time', 'anomaly_score'],
    interactions: ['select report', 'time filter'],
    antiPatterns: ['unlabeled outlier colors'],
  },
  examine_source_conflict: {
    label: 'Examine source disagreement',
    description: 'Compare reports for an event and inspect conflicting sources.',
    preferredFields: ['event_id', 'source_id', 'conflict_score'],
    interactions: ['select report', 'source filter'],
    antiPatterns: ['aggregation that hides disagreement'],
  },
  assess_confidence: {
    label: 'Assess confidence and validation',
    description: 'Keep source confidence, validation, and model uncertainty distinct.',
    preferredFields: ['source_confidence', 'validation_score', 'corroboration_count'],
    interactions: ['threshold filters', 'select report'],
    antiPatterns: ['one combined trust score'],
  },
  explore_provenance: {
    label: 'Compare observation and receipt times',
    description:
      'Distinguish when an observation was made from when its report arrived and inspect processing history.',
    preferredFields: ['observed_at', 'received_at', 'source_id', 'report_id'],
    interactions: ['select report', 'compare reports'],
    antiPatterns: ['details without source attribution'],
  },
};
export const SCENARIOS: Record<
  ScenarioId,
  { label: string; description: string; question: string; task: AnalyticTask }
> = {
  corroboration: {
    label: 'Consistent sightings',
    description:
      'Two independent sources report similar cargo-truck counts at Cedar Junction during a comparable window.',
    question: 'Which sources independently reported a similar cargo-truck count at Cedar Junction?',
    task: 'compare_categories',
  },
  uncertain: {
    label: 'Delayed report',
    description:
      'A report about personnel near North Ridge arrives several exercise hours after observation.',
    question: 'How long after observation did the Field Report Liaison’s North Ridge report arrive?',
    task: 'explore_provenance',
  },
  conflict: {
    label: 'Conflicting equipment counts',
    description:
      'Two sources report different cargo-truck counts for the same East Depot episode.',
    question: 'Which reports give different cargo-truck counts for the East Depot episode?',
    task: 'examine_source_conflict',
  },
  anomaly: {
    label: 'Apparent activity increase',
    description:
      'Report frequency rises while additional reporting coverage is introduced; increased activity is not established.',
    question: 'Does the report volume establish increased vehicle activity at Cedar Junction?',
    task: 'analyze_trends',
  },
  quality: {
    label: 'Translation uncertainty',
    description:
      'A translated quantity phrase describes a group near Pine Crossing; the range is ambiguous and human verification is incomplete.',
    question: 'Was the translated personnel-count range human verified?',
    task: 'assess_confidence',
  },
};
