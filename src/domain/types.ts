export type AnalyticTask =
  | 'compare_categories'
  | 'analyze_trends'
  | 'detect_anomalies'
  | 'examine_source_conflict'
  | 'assess_confidence'
  | 'explore_provenance';
export type ScenarioId = 'corroboration' | 'uncertain' | 'conflict' | 'anomaly' | 'quality';
export type AudienceMode = 'Commander' | 'Analyst';
export type TranslationStatus = 'original' | 'machine' | 'reviewed';
export type CountPrecision = 'exact_as_reported' | 'approximate' | 'range' | 'unknown';
export type AttributionStatus =
  | 'identified_by_source'
  | 'suspected_by_source'
  | 'unknown';
export type ValidationStatus = 'reviewed' | 'partial' | 'pending' | 'not_recorded';
export type Report = {
  report_id: string;
  event_id: string;
  entity_id: string;
  source_id: string;
  scenario_id: ScenarioId;
  report_time: string;
  received_time: string;
  region: string;
  latitude: number;
  longitude: number;
  event_category: string;
  reported_value: number | null;
  narrative_summary: string;
  source_confidence: number;
  validation_score: number;
  corroboration_count: number;
  conflict_score: number;
  report_age_hours: number;
  missingness_score: number;
  translation_status: TranslationStatus;
  human_verified: boolean;
  anomaly_score: number;
  importance_score: number;
  reason_codes: string[];
  report_title: string;
  reported_actor_name: string;
  actor_attribution_status: AttributionStatus;
  observation_type: string;
  activity_description: string;
  location_id: string;
  location_name: string;
  observed_at: string;
  received_at: string;
  item_type: string;
  reported_count: number | null;
  count_unit: string;
  count_precision: CountPrecision;
  reported_count_lower: number | null;
  reported_count_upper: number | null;
  validation_status: ValidationStatus;
  source_independent: boolean;
  derived_from_report_id: string | null;
  related_report_ids: string[];
  comparison_notes: string;
  original_language: string | null;
  grid_x: number;
  grid_y: number;
  receipt_delay_hours: number;
};
export type Source = {
  source_id: string;
  display_name: string;
  source_type: string;
  reliability_prior: number;
  collection_method: string;
  translation_status: TranslationStatus;
  human_verified: boolean;
  data_quality_score: number;
};
export type Location = {
  location_id: string;
  name: string;
  description: string;
  grid_x: number;
  grid_y: number;
};
export type Entity = {
  entity_id: string;
  reported_name: string;
  entity_type: 'group' | 'equipment';
  note: string;
};
export type Event = {
  event_id: string;
  scenario_id: ScenarioId;
  event_title: string;
  episode_description: string;
  location_id: string;
  observation_type: string;
  item_type: string;
  count_unit: string;
};
export type Provenance = {
  report_id: string;
  source_id: string;
  ingest_time: string;
  transformation_step: string;
  analyst_review_status: string;
  version: number;
  provenance_chain: string[];
};
export type ModelOutput = {
  report_id: string;
  anomaly_score: number;
  cluster_id: string;
  predicted_value: number | null;
  uncertainty_lower: number | null;
  uncertainty_upper: number | null;
  calibration_group: string;
};
export type GroundTruth = {
  event_id: string;
  true_category: string;
  true_time: string;
  true_region: string;
  true_value: number | null;
};
export type Dataset = {
  reports: Report[];
  sources: Source[];
  events: Event[];
  entities: Entity[];
  locations: Location[];
  exerciseAsOfTime: string;
  provenance: Provenance[];
  model_outputs: ModelOutput[];
  synthetic_ground_truth: GroundTruth[];
};
export type FieldProfile = {
  name: string;
  inferredType:
    'id' | 'temporal' | 'quantitative' | 'nominal' | 'ordinal' | 'boolean' | 'geographic' | 'text';
  nullableCount: number;
  missingRate: number;
  uniqueCount: number;
  min?: number | string;
  max?: number | string;
  exampleValues: unknown[];
};
export type DataProfile = {
  rowCount: number;
  fields: FieldProfile[];
  temporalFields: string[];
  geographicFields: string[];
  numericFields: string[];
  categoricalFields: string[];
  idFields: string[];
  uncertaintyFields: string[];
  provenanceFields: string[];
  recommendedPrimaryTimeField?: string;
  recommendedPrimaryGeoFields?: { latitude: string; longitude: string };
};
export type SalienceWeights = {
  relevance: number;
  sourceConfidence: number;
  freshness: number;
  impact: number;
  disagreement: number;
  anomaly: number;
};
export type SalienceComponent = keyof SalienceWeights;
export type SalienceResult = {
  score: number;
  components: Record<SalienceComponent, number>;
  contributions: Record<SalienceComponent, number>;
  reasonCodes: string[];
  explanation: string;
};
export type ModelingTechnique =
  | 'Descriptive aggregation'
  | 'Temporal trend analysis'
  | 'Rolling average'
  | 'Z-score anomaly detection'
  | 'Source conflict scoring'
  | 'Corroboration grouping'
  | 'Basic clustering'
  | 'Data-quality assessment'
  | 'Provenance tracing'
  | 'Uncertainty interval display';
export type ModelingRecommendation = {
  technique: ModelingTechnique;
  reason: string;
  inputFields: string[];
  assumptions: string[];
  limitations: string[];
  outputFields: string[];
  suitabilityScore: number;
};
export type ChartPattern =
  | 'observation_timeline'
  | 'bar'
  | 'dot_plot'
  | 'line'
  | 'area'
  | 'scatter'
  | 'heatmap'
  | 'map'
  | 'error_bar'
  | 'error_band'
  | 'layered_scatter'
  | 'faceted_view'
  | 'linked_views'
  | 'table_detail'
  | 'parallel_coordinates';
export type SuitabilityBreakdown = {
  taskFit: number;
  fieldCompatibility: number;
  modelingOutputFit: number;
  uncertaintyVisibility: number;
  provenanceInspectability: number;
  readability: number;
  interactionBurden: number;
  audienceComplexity: number;
  quantityUnitCompatibility: number;
  episodeGrouping: number;
  timeComparability: number;
};
export type VisualizationRecommendation = {
  id: string;
  title: string;
  technique: string;
  unitOfAnalysis: string;
  rank: number;
  suitabilityScore: number;
  scoreBreakdown: SuitabilityBreakdown;
  task: AnalyticTask;
  modelingTechnique: ModelingTechnique;
  chartPattern: ChartPattern;
  rationale: string[];
  answersQuestion: string;
  doesNotEstablish: string;
  assumptions: string[];
  cautions: string[];
  requiredInputFields: string[];
  optionalInputFields: string[];
  fieldsUsed: string[];
  derivedOutputFields: string[];
  visualEncodings: {
    x?: string;
    y?: string;
    color?: string;
    size?: string;
    opacity?: string;
    shape?: string;
    tooltip?: string[];
  };
  interactions: string[];
  vegaLiteSpec: Record<string, unknown>;
};
export type Filters = {
  start: string;
  end: string;
  region: string;
  category: string;
  sourceType: string;
  minConfidence: number;
  minValidation: number;
  minConflict: number;
  translation: string;
  verified: string;
};
export type InteractionEvent = { type: string; value: string; timestamp: string };
export type EvaluationRecord = {
  schemaVersion: 2;
  sessionId: string;
  scenarioId: ScenarioId;
  questionId: string;
  audienceMode: AudienceMode;
  analyticTask: AnalyticTask;
  chartSelected: string;
  filters: Filters;
  visualInteractions: InteractionEvent[];
  selectedReports: string[];
  timeToAnswerMs: number;
  submittedAnswer: string;
  expectedAnswer: string;
  correct: boolean;
  userConfidence: number;
  timestamp: string;
  researchNote?: string;
};
