import type {
  AttributionStatus,
  CountPrecision,
  Dataset,
  ModelOutput,
  Provenance,
  Report,
  ScenarioId,
  Source,
  ValidationStatus,
} from '../domain/types';
import { countIndependentSimilarReports } from '../lib/situationNarrative';

export const SEED = 271828;
export const EXERCISE_AS_OF = '2035-04-02T12:00:00-04:00';
export const EXERCISE_TIMEZONE = 'Cedar Watch exercise time (UTC−04:00)';

const exerciseTime = (hour: number, minute = 0, day = 1) =>
  `2035-04-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-04:00`;
const elapsedHours = (start: string, end: string) =>
  Math.max(0, (Date.parse(end) - Date.parse(start)) / 3_600_000);
const round = (value: number) => Math.round(value * 100) / 100;

const baseSources: Source[] = [
  {
    source_id: 'SRC-OTC',
    display_name: 'Observation Team Cedar',
    source_type: 'observation team',
    reliability_prior: 0.78,
    collection_method: 'scripted fictional observation',
    translation_status: 'original',
    human_verified: true,
    data_quality_score: 0.86,
  },
  {
    source_id: 'SRC-IRD',
    display_name: 'Imagery Review Desk',
    source_type: 'imagery review',
    reliability_prior: 0.81,
    collection_method: 'scripted fictional imagery review',
    translation_status: 'original',
    human_verified: true,
    data_quality_score: 0.9,
  },
  {
    source_id: 'SRC-FRL',
    display_name: 'Field Report Liaison',
    source_type: 'field report',
    reliability_prior: 0.68,
    collection_method: 'scripted fictional field report',
    translation_status: 'original',
    human_verified: false,
    data_quality_score: 0.72,
  },
  {
    source_id: 'SRC-TRD',
    display_name: 'Translation Review Desk',
    source_type: 'translation review',
    reliability_prior: 0.7,
    collection_method: 'scripted fictional translation review',
    translation_status: 'machine',
    human_verified: false,
    data_quality_score: 0.58,
  },
];

const extraSources: Source[] = [
  {
    source_id: 'SRC-RPL',
    display_name: 'Road Patrol Log',
    source_type: 'patrol log',
    reliability_prior: 0.74,
    collection_method: 'scripted fictional patrol log entry',
    translation_status: 'original',
    human_verified: true,
    data_quality_score: 0.8,
  },
  {
    source_id: 'SRC-RRM',
    display_name: 'Radio Log Monitor',
    source_type: 'communications log review',
    reliability_prior: 0.62,
    collection_method: 'scripted fictional radio log review',
    translation_status: 'original',
    human_verified: false,
    data_quality_score: 0.66,
  },
  {
    source_id: 'SRC-CCN',
    display_name: 'Community Contact Network',
    source_type: 'community contact report',
    reliability_prior: 0.6,
    collection_method: 'scripted fictional contact report',
    translation_status: 'machine',
    human_verified: false,
    data_quality_score: 0.55,
  },
];
const sources: Source[] = [...baseSources, ...extraSources];

const locations = [
  {
    location_id: 'LOC-CJ',
    name: 'Cedar Junction',
    description: 'Fictional road intersection',
    grid_x: 42,
    grid_y: 58,
  },
  {
    location_id: 'LOC-NR',
    name: 'North Ridge',
    description: 'Fictional elevated observation area',
    grid_x: 26,
    grid_y: 82,
  },
  {
    location_id: 'LOC-PC',
    name: 'Pine Crossing',
    description: 'Fictional crossing point',
    grid_x: 71,
    grid_y: 37,
  },
  {
    location_id: 'LOC-ED',
    name: 'East Depot',
    description: 'Fictional storage area',
    grid_x: 78,
    grid_y: 63,
  },
] as const;

const actor = 'Red Falcon';
const groupEntityId = 'ENT-RED-FALCON';
const cargoEntityId = 'ENT-CARGO-TRUCK';
const personnelEntityId = 'ENT-PERSONNEL-GROUP';

type Template = {
  scenario_id: ScenarioId;
  suffix: string;
  event_id: string;
  source_id: string;
  location_id: (typeof locations)[number]['location_id'];
  observed: [number, number, number?];
  received: [number, number, number?];
  item_type: string;
  count_unit: string;
  count: number | null;
  precision: CountPrecision;
  lower: number | null;
  upper: number | null;
  actor_status: AttributionStatus;
  observation_type: string;
  activity: string;
  validation: number;
  validation_status: ValidationStatus;
  source_confidence: number;
  conflict: number;
  missingness: number;
  translation: 'original' | 'machine' | 'reviewed';
  human_verified: boolean;
  source_independent: boolean;
  derived_from_report_id?: string | null;
  comparison_notes: string;
  original_language: string | null;
  importance: number;
};

const baseTemplates: Template[] = [
  {
    scenario_id: 'corroboration',
    suffix: '001',
    event_id: 'EV-CEDAR-JUNCTION-01',
    source_id: 'SRC-OTC',
    location_id: 'LOC-CJ',
    observed: [8, 20],
    received: [8, 34],
    item_type: 'cargo truck',
    count_unit: 'vehicles',
    count: 6,
    precision: 'approximate',
    lower: 5,
    upper: 7,
    actor_status: 'suspected_by_source',
    observation_type: 'vehicle observation',
    activity: 'parked near the junction',
    validation: 0.74,
    validation_status: 'partial',
    source_confidence: 0.78,
    conflict: 0.08,
    missingness: 0.05,
    translation: 'original',
    human_verified: true,
    source_independent: true,
    comparison_notes:
      'Comparable observation window and location; report may refer to the same vehicles as the other observation.',
    original_language: null,
    importance: 0.54,
  },
  {
    scenario_id: 'corroboration',
    suffix: '002',
    event_id: 'EV-CEDAR-JUNCTION-01',
    source_id: 'SRC-IRD',
    location_id: 'LOC-CJ',
    observed: [8, 42],
    received: [8, 51],
    item_type: 'cargo truck',
    count_unit: 'vehicles',
    count: 6,
    precision: 'exact_as_reported',
    lower: 6,
    upper: 6,
    actor_status: 'identified_by_source',
    observation_type: 'vehicle observation',
    activity: 'present near the junction',
    validation: 0.81,
    validation_status: 'reviewed',
    source_confidence: 0.82,
    conflict: 0.06,
    missingness: 0,
    translation: 'original',
    human_verified: true,
    source_independent: true,
    comparison_notes:
      'Independent source; the close times and shared episode do not establish six distinct vehicles.',
    original_language: null,
    importance: 0.52,
  },
  {
    scenario_id: 'conflict',
    suffix: '001',
    event_id: 'EV-EAST-DEPOT-COUNT-01',
    source_id: 'SRC-OTC',
    location_id: 'LOC-ED',
    observed: [9, 20],
    received: [9, 36],
    item_type: 'cargo truck',
    count_unit: 'vehicles',
    count: 6,
    precision: 'exact_as_reported',
    lower: 6,
    upper: 6,
    actor_status: 'suspected_by_source',
    observation_type: 'vehicle observation',
    activity: 'present in the storage area',
    validation: 0.62,
    validation_status: 'partial',
    source_confidence: 0.76,
    conflict: 0.86,
    missingness: 0.08,
    translation: 'original',
    human_verified: false,
    source_independent: true,
    comparison_notes:
      'Same episode, location, item type, and stated counting boundary; observations are 25 minutes apart.',
    original_language: null,
    importance: 0.7,
  },
  {
    scenario_id: 'conflict',
    suffix: '002',
    event_id: 'EV-EAST-DEPOT-COUNT-01',
    source_id: 'SRC-IRD',
    location_id: 'LOC-ED',
    observed: [9, 45],
    received: [10, 2],
    item_type: 'cargo truck',
    count_unit: 'vehicles',
    count: 4,
    precision: 'exact_as_reported',
    lower: 4,
    upper: 4,
    actor_status: 'suspected_by_source',
    observation_type: 'vehicle observation',
    activity: 'present in the storage area',
    validation: 0.66,
    validation_status: 'partial',
    source_confidence: 0.8,
    conflict: 0.89,
    missingness: 0.04,
    translation: 'original',
    human_verified: true,
    source_independent: true,
    comparison_notes:
      'Same episode, location, item type, and stated counting boundary; the reports do not establish why counts differ.',
    original_language: null,
    importance: 0.7,
  },
  {
    scenario_id: 'uncertain',
    suffix: '001',
    event_id: 'EV-NORTH-RIDGE-PERSONNEL-01',
    source_id: 'SRC-FRL',
    location_id: 'LOC-NR',
    observed: [8, 5],
    received: [12, 5],
    item_type: 'personnel',
    count_unit: 'people',
    count: 8,
    precision: 'approximate',
    lower: 6,
    upper: 10,
    actor_status: 'suspected_by_source',
    observation_type: 'personnel observation',
    activity: 'moving through the observation area',
    validation: 0.53,
    validation_status: 'pending',
    source_confidence: 0.67,
    conflict: 0.12,
    missingness: 0.12,
    translation: 'original',
    human_verified: false,
    source_independent: true,
    comparison_notes:
      'One report was received four exercise hours after observation; no independent report is linked to this episode.',
    original_language: null,
    importance: 0.63,
  },
  {
    scenario_id: 'uncertain',
    suffix: '002',
    event_id: 'EV-NORTH-RIDGE-PERSONNEL-02',
    source_id: 'SRC-OTC',
    location_id: 'LOC-NR',
    observed: [9, 15],
    received: [9, 28],
    item_type: 'personnel',
    count_unit: 'people',
    count: null,
    precision: 'unknown',
    lower: null,
    upper: null,
    actor_status: 'unknown',
    observation_type: 'personnel observation',
    activity: 'reported nearby; activity details not recorded',
    validation: 0.42,
    validation_status: 'not_recorded',
    source_confidence: 0.58,
    conflict: 0.05,
    missingness: 0.62,
    translation: 'original',
    human_verified: false,
    source_independent: true,
    comparison_notes: 'Separate episode; the report does not provide a count.',
    original_language: null,
    importance: 0.38,
  },
  {
    scenario_id: 'quality',
    suffix: '001',
    event_id: 'EV-PINE-CROSSING-GROUP-01',
    source_id: 'SRC-TRD',
    location_id: 'LOC-PC',
    observed: [10, 10],
    received: [11, 25],
    item_type: 'personnel',
    count_unit: 'people',
    count: 3,
    precision: 'range',
    lower: 2,
    upper: 4,
    actor_status: 'suspected_by_source',
    observation_type: 'personnel observation',
    activity: 'a group was reported near the crossing',
    validation: 0.38,
    validation_status: 'pending',
    source_confidence: 0.76,
    conflict: 0.24,
    missingness: 0.3,
    translation: 'machine',
    human_verified: false,
    source_independent: true,
    comparison_notes:
      'Translated quantity phrase is ambiguous; the reported range is not human verified.',
    original_language: 'Fictional source language (unverified label)',
    importance: 0.6,
  },
  {
    scenario_id: 'quality',
    suffix: '002',
    event_id: 'EV-PINE-CROSSING-GROUP-01',
    source_id: 'SRC-OTC',
    location_id: 'LOC-PC',
    observed: [10, 18],
    received: [10, 34],
    item_type: 'personnel',
    count_unit: 'people',
    count: null,
    precision: 'unknown',
    lower: null,
    upper: null,
    actor_status: 'unknown',
    observation_type: 'personnel observation',
    activity: 'a group was reported near the crossing',
    validation: 0.48,
    validation_status: 'partial',
    source_confidence: 0.69,
    conflict: 0.4,
    missingness: 0.48,
    translation: 'original',
    human_verified: false,
    source_independent: true,
    comparison_notes:
      'A second source reports the same episode but gives no quantity; this does not verify the translated range.',
    original_language: null,
    importance: 0.58,
  },
  {
    scenario_id: 'anomaly',
    suffix: '001',
    event_id: 'EV-CEDAR-ACTIVITY-EARLY-01',
    source_id: 'SRC-OTC',
    location_id: 'LOC-CJ',
    observed: [7, 30],
    received: [7, 44],
    item_type: 'cargo truck',
    count_unit: 'vehicles',
    count: 2,
    precision: 'approximate',
    lower: 1,
    upper: 3,
    actor_status: 'suspected_by_source',
    observation_type: 'vehicle observation',
    activity: 'vehicle activity was reported near the junction',
    validation: 0.7,
    validation_status: 'partial',
    source_confidence: 0.75,
    conflict: 0.1,
    missingness: 0.05,
    translation: 'original',
    human_verified: true,
    source_independent: true,
    comparison_notes: 'Early exercise-window observation from the then-active reporting source.',
    original_language: null,
    importance: 0.46,
  },
  {
    scenario_id: 'anomaly',
    suffix: '002',
    event_id: 'EV-CEDAR-ACTIVITY-EARLY-02',
    source_id: 'SRC-OTC',
    location_id: 'LOC-CJ',
    observed: [7, 50],
    received: [8, 2],
    item_type: 'cargo truck',
    count_unit: 'vehicles',
    count: 3,
    precision: 'approximate',
    lower: 2,
    upper: 4,
    actor_status: 'suspected_by_source',
    observation_type: 'vehicle observation',
    activity: 'vehicle activity was reported near the junction',
    validation: 0.72,
    validation_status: 'partial',
    source_confidence: 0.74,
    conflict: 0.1,
    missingness: 0.05,
    translation: 'original',
    human_verified: true,
    source_independent: true,
    comparison_notes: 'Separate episode from the same reporting source.',
    original_language: null,
    importance: 0.48,
  },
  {
    scenario_id: 'anomaly',
    suffix: '003',
    event_id: 'EV-CEDAR-ACTIVITY-LATE-01',
    source_id: 'SRC-OTC',
    location_id: 'LOC-CJ',
    observed: [9, 0],
    received: [9, 12],
    item_type: 'cargo truck',
    count_unit: 'vehicles',
    count: 3,
    precision: 'approximate',
    lower: 2,
    upper: 4,
    actor_status: 'suspected_by_source',
    observation_type: 'vehicle observation',
    activity: 'vehicle activity was reported near the junction',
    validation: 0.69,
    validation_status: 'partial',
    source_confidence: 0.72,
    conflict: 0.12,
    missingness: 0.04,
    translation: 'original',
    human_verified: true,
    source_independent: true,
    comparison_notes: 'Later-window report; reporting coverage has expanded since earlier reports.',
    original_language: null,
    importance: 0.5,
  },
  {
    scenario_id: 'anomaly',
    suffix: '004',
    event_id: 'EV-CEDAR-ACTIVITY-LATE-02',
    source_id: 'SRC-IRD',
    location_id: 'LOC-CJ',
    observed: [9, 20],
    received: [9, 38],
    item_type: 'cargo truck',
    count_unit: 'vehicles',
    count: 4,
    precision: 'approximate',
    lower: 3,
    upper: 5,
    actor_status: 'suspected_by_source',
    observation_type: 'vehicle observation',
    activity: 'vehicle activity was reported near the junction',
    validation: 0.76,
    validation_status: 'reviewed',
    source_confidence: 0.8,
    conflict: 0.08,
    missingness: 0.02,
    translation: 'original',
    human_verified: true,
    source_independent: true,
    comparison_notes: 'A second reporting source became active in the later window.',
    original_language: null,
    importance: 0.53,
  },
  {
    scenario_id: 'anomaly',
    suffix: '005',
    event_id: 'EV-CEDAR-ACTIVITY-LATE-03',
    source_id: 'SRC-FRL',
    location_id: 'LOC-CJ',
    observed: [9, 40],
    received: [10, 2],
    item_type: 'cargo truck',
    count_unit: 'vehicles',
    count: 3,
    precision: 'approximate',
    lower: 2,
    upper: 4,
    actor_status: 'suspected_by_source',
    observation_type: 'vehicle observation',
    activity: 'vehicle activity was reported near the junction',
    validation: 0.59,
    validation_status: 'pending',
    source_confidence: 0.65,
    conflict: 0.15,
    missingness: 0.1,
    translation: 'original',
    human_verified: false,
    source_independent: true,
    comparison_notes: 'A third reporting source became active in the later window.',
    original_language: null,
    importance: 0.51,
  },
  {
    scenario_id: 'anomaly',
    suffix: '006',
    event_id: 'EV-CEDAR-ACTIVITY-LATE-04',
    source_id: 'SRC-IRD',
    location_id: 'LOC-CJ',
    observed: [10, 0],
    received: [10, 19],
    item_type: 'cargo truck',
    count_unit: 'vehicles',
    count: 4,
    precision: 'approximate',
    lower: 3,
    upper: 5,
    actor_status: 'suspected_by_source',
    observation_type: 'vehicle observation',
    activity: 'vehicle activity was reported near the junction',
    validation: 0.73,
    validation_status: 'reviewed',
    source_confidence: 0.78,
    conflict: 0.11,
    missingness: 0.03,
    translation: 'original',
    human_verified: true,
    source_independent: true,
    comparison_notes:
      'Separate episode in the later window; frequency of reports is not a deduplicated vehicle count.',
    original_language: null,
    importance: 0.52,
  },
];

const extraTemplates: Template[] = [
  {
    scenario_id: 'corroboration',
    suffix: '003',
    event_id: 'EV-CEDAR-JUNCTION-01',
    source_id: 'SRC-RPL',
    location_id: 'LOC-CJ',
    observed: [9, 5],
    received: [9, 30],
    item_type: 'cargo truck',
    count_unit: 'vehicles',
    count: 7,
    precision: 'approximate',
    lower: 6,
    upper: 8,
    actor_status: 'unknown',
    observation_type: 'vehicle observation',
    activity: 'seen from the road near the junction',
    validation: 0.7,
    validation_status: 'partial',
    source_confidence: 0.74,
    conflict: 0.1,
    missingness: 0.06,
    translation: 'original',
    human_verified: true,
    source_independent: true,
    comparison_notes:
      'Patrol entry from the same episode and location; the range overlaps the other reports but does not establish distinct vehicles.',
    original_language: null,
    importance: 0.5,
  },
  {
    scenario_id: 'corroboration',
    suffix: '004',
    event_id: 'EV-CEDAR-JUNCTION-01',
    source_id: 'SRC-CCN',
    location_id: 'LOC-CJ',
    observed: [8, 55],
    received: [10, 10],
    item_type: 'cargo truck',
    count_unit: 'vehicles',
    count: 5,
    precision: 'approximate',
    lower: 4,
    upper: 6,
    actor_status: 'unknown',
    observation_type: 'vehicle observation',
    activity: 'described as parked along the road',
    validation: 0.52,
    validation_status: 'pending',
    source_confidence: 0.6,
    conflict: 0.1,
    missingness: 0.14,
    translation: 'machine',
    human_verified: false,
    source_independent: true,
    comparison_notes:
      'Contact report from the same episode, received later; its translated wording is not human verified.',
    original_language: 'Fictional local language (unverified label)',
    importance: 0.44,
  },
  {
    scenario_id: 'conflict',
    suffix: '003',
    event_id: 'EV-EAST-DEPOT-COUNT-01',
    source_id: 'SRC-RPL',
    location_id: 'LOC-ED',
    observed: [10, 5],
    received: [10, 22],
    item_type: 'cargo truck',
    count_unit: 'vehicles',
    count: 6,
    precision: 'approximate',
    lower: 5,
    upper: 7,
    actor_status: 'unknown',
    observation_type: 'vehicle observation',
    activity: 'present in the storage area',
    validation: 0.64,
    validation_status: 'partial',
    source_confidence: 0.74,
    conflict: 0.8,
    missingness: 0.07,
    translation: 'original',
    human_verified: true,
    source_independent: true,
    comparison_notes:
      'A third observation of the same episode; it is near one earlier count and apart from the other, but this does not establish which is correct.',
    original_language: null,
    importance: 0.68,
  },
  {
    scenario_id: 'conflict',
    suffix: '004',
    event_id: 'EV-EAST-DEPOT-COUNT-01',
    source_id: 'SRC-RRM',
    location_id: 'LOC-ED',
    observed: [9, 55],
    received: [10, 30],
    item_type: 'cargo truck',
    count_unit: 'vehicles',
    count: null,
    precision: 'unknown',
    lower: null,
    upper: null,
    actor_status: 'unknown',
    observation_type: 'vehicle observation',
    activity: 'radio log mentions trucks in the storage area without giving a number',
    validation: 0.45,
    validation_status: 'not_recorded',
    source_confidence: 0.62,
    conflict: 0.3,
    missingness: 0.55,
    translation: 'original',
    human_verified: false,
    source_independent: true,
    comparison_notes:
      'Mentions the same activity without a count, so it neither supports nor settles the count disagreement.',
    original_language: null,
    importance: 0.4,
  },
  {
    scenario_id: 'uncertain',
    suffix: '003',
    event_id: 'EV-NORTH-RIDGE-PERSONNEL-01',
    source_id: 'SRC-RRM',
    location_id: 'LOC-NR',
    observed: [12, 20],
    received: [12, 40],
    item_type: 'personnel',
    count_unit: 'people',
    count: 8,
    precision: 'approximate',
    lower: 6,
    upper: 10,
    actor_status: 'suspected_by_source',
    observation_type: 'relayed report',
    activity: 'relayed account of people moving through the observation area',
    validation: 0.4,
    validation_status: 'pending',
    source_confidence: 0.62,
    conflict: 0.05,
    missingness: 0.2,
    translation: 'original',
    human_verified: false,
    source_independent: false,
    derived_from_report_id: 'REP-UNCERTAIN-001',
    comparison_notes:
      'Relays the Field Report Liaison report, so it is derived and is not independent corroboration.',
    original_language: null,
    importance: 0.4,
  },
  {
    scenario_id: 'uncertain',
    suffix: '004',
    event_id: 'EV-NORTH-RIDGE-PERSONNEL-03',
    source_id: 'SRC-CCN',
    location_id: 'LOC-NR',
    observed: [10, 0],
    received: [14, 30],
    item_type: 'personnel',
    count_unit: 'people',
    count: 5,
    precision: 'approximate',
    lower: 4,
    upper: 6,
    actor_status: 'unknown',
    observation_type: 'personnel observation',
    activity: 'described as walking along the ridge path',
    validation: 0.46,
    validation_status: 'pending',
    source_confidence: 0.6,
    conflict: 0.08,
    missingness: 0.25,
    translation: 'original',
    human_verified: false,
    source_independent: true,
    comparison_notes:
      'Separate episode received 4.5 exercise hours after observation; no other report is linked.',
    original_language: null,
    importance: 0.5,
  },
  {
    scenario_id: 'quality',
    suffix: '003',
    event_id: 'EV-PINE-CROSSING-GROUP-01',
    source_id: 'SRC-CCN',
    location_id: 'LOC-PC',
    observed: [10, 30],
    received: [12, 0],
    item_type: 'personnel',
    count_unit: 'people',
    count: null,
    precision: 'unknown',
    lower: null,
    upper: null,
    actor_status: 'unknown',
    observation_type: 'personnel observation',
    activity: 'a group was described near the crossing, but the quantity wording could not be resolved',
    validation: 0.35,
    validation_status: 'pending',
    source_confidence: 0.6,
    conflict: 0.3,
    missingness: 0.6,
    translation: 'machine',
    human_verified: false,
    source_independent: true,
    comparison_notes:
      'Machine translation could not resolve a quantity; it is not counted as zero or as agreement.',
    original_language: 'Fictional local language (unverified label)',
    importance: 0.5,
  },
  {
    scenario_id: 'quality',
    suffix: '004',
    event_id: 'EV-PINE-CROSSING-GROUP-01',
    source_id: 'SRC-RPL',
    location_id: 'LOC-PC',
    observed: [10, 50],
    received: [11, 10],
    item_type: 'personnel',
    count_unit: 'people',
    count: 4,
    precision: 'approximate',
    lower: 3,
    upper: 5,
    actor_status: 'unknown',
    observation_type: 'personnel observation',
    activity: 'a group was seen near the crossing',
    validation: 0.62,
    validation_status: 'partial',
    source_confidence: 0.72,
    conflict: 0.2,
    missingness: 0.1,
    translation: 'original',
    human_verified: false,
    source_independent: true,
    comparison_notes:
      'Original-language patrol entry with an overlapping range; it does not verify the translated range or exact wording.',
    original_language: null,
    importance: 0.55,
  },
  {
    scenario_id: 'anomaly',
    suffix: '007',
    event_id: 'EV-CEDAR-ACTIVITY-LATE-05',
    source_id: 'SRC-RPL',
    location_id: 'LOC-CJ',
    observed: [10, 20],
    received: [10, 41],
    item_type: 'cargo truck',
    count_unit: 'vehicles',
    count: 4,
    precision: 'approximate',
    lower: 3,
    upper: 5,
    actor_status: 'suspected_by_source',
    observation_type: 'vehicle observation',
    activity: 'vehicle activity was reported near the junction',
    validation: 0.68,
    validation_status: 'partial',
    source_confidence: 0.74,
    conflict: 0.1,
    missingness: 0.05,
    translation: 'original',
    human_verified: true,
    source_independent: true,
    comparison_notes:
      'A fourth reporting source became active in the later window; this does not establish increased activity.',
    original_language: null,
    importance: 0.5,
  },
  {
    scenario_id: 'anomaly',
    suffix: '008',
    event_id: 'EV-CEDAR-ACTIVITY-LATE-06',
    source_id: 'SRC-CCN',
    location_id: 'LOC-CJ',
    observed: [10, 35],
    received: [11, 50],
    item_type: 'cargo truck',
    count_unit: 'vehicles',
    count: 3,
    precision: 'approximate',
    lower: 2,
    upper: 4,
    actor_status: 'unknown',
    observation_type: 'vehicle observation',
    activity: 'vehicle activity was reported near the junction',
    validation: 0.5,
    validation_status: 'pending',
    source_confidence: 0.6,
    conflict: 0.12,
    missingness: 0.15,
    translation: 'original',
    human_verified: false,
    source_independent: true,
    comparison_notes:
      'A fifth reporting source became active in the later window; report frequency is not a deduplicated vehicle count.',
    original_language: null,
    importance: 0.46,
  },
];

const scenarioOrder: ScenarioId[] = ['corroboration', 'conflict', 'uncertain', 'quality', 'anomaly'];
const templates: Template[] = [...baseTemplates, ...extraTemplates].sort(
  (left, right) =>
    scenarioOrder.indexOf(left.scenario_id) - scenarioOrder.indexOf(right.scenario_id) ||
    left.suffix.localeCompare(right.suffix),
);

export function generateSyntheticDataset(seed = SEED): Dataset {
  const seedOffset = (seed >>> 0) % 5;
  const relatedByEvent = new Map<string, string[]>();
  for (const item of templates) {
    const id = `REP-${item.scenario_id.toUpperCase()}-${item.suffix}`;
    relatedByEvent.set(item.event_id, [
      ...(relatedByEvent.get(item.event_id) ?? []),
      id,
    ]);
  }

  const reports: Report[] = templates.map((item) => {
    const report_id = `REP-${item.scenario_id.toUpperCase()}-${item.suffix}`;
    const source = sources.find((candidate) => candidate.source_id === item.source_id)!;
    const location = locations.find((candidate) => candidate.location_id === item.location_id)!;
    const observed_at = exerciseTime(item.observed[0], item.observed[1], item.observed[2]);
    const received_at = exerciseTime(item.received[0], item.received[1], item.received[2]);
    const receipt_delay_hours = round(elapsedHours(observed_at, received_at));
    const itemLabel =
      item.item_type === 'personnel'
        ? 'personnel'
        : `${item.item_type}${item.count === 1 ? '' : 's'}`;
    const countText =
      item.count === null
        ? 'an unknown count of'
        : item.precision === 'range'
          ? `between ${item.lower} and ${item.upper}`
          : item.precision === 'approximate'
            ? `approximately ${item.count}`
            : String(item.count);
    const attribution =
      item.actor_status === 'identified_by_source'
        ? `identified by the source as associated with ${actor}`
        : item.actor_status === 'suspected_by_source'
          ? `suspected by the source to be associated with ${actor}`
          : 'with no actor attribution recorded';
    const report_title = `${item.count === null ? 'Uncounted ' : item.precision === 'approximate' ? `Approximately ${item.count} ` : item.precision === 'range' ? `${item.lower}–${item.upper} ` : `${item.count} `}${itemLabel} reported at ${location.name}`;
    const narrative_summary = `${source.display_name} reported ${countText} ${itemLabel} ${attribution} at ${location.name}. Activity description: ${item.activity}. Observation time: ${observed_at.slice(11, 16)}; report received: ${received_at.slice(11, 16)} (${EXERCISE_TIMEZONE}).`;
    const report_age_hours = round(elapsedHours(observed_at, EXERCISE_AS_OF));
    const sourceConfidence =
      Math.max(0, Math.min(1, item.source_confidence + (seedOffset - 2) * 0.01));
    return {
      report_id,
      event_id: item.event_id,
      entity_id:
        item.item_type === 'cargo truck'
          ? cargoEntityId
          : item.item_type === 'personnel'
            ? personnelEntityId
            : groupEntityId,
      source_id: item.source_id,
      scenario_id: item.scenario_id,
      report_time: observed_at,
      received_time: received_at,
      region: location.name,
      latitude: location.grid_y,
      longitude: location.grid_x,
      event_category: item.observation_type,
      reported_value: item.count,
      narrative_summary,
      source_confidence: sourceConfidence,
      validation_score: item.validation,
      corroboration_count: 0,
      conflict_score: item.conflict,
      report_age_hours,
      missingness_score: item.missingness,
      translation_status: item.translation,
      human_verified: item.human_verified,
      anomaly_score: item.scenario_id === 'anomaly' && item.observed[0] >= 9 ? 0.8 : 0.12,
      importance_score: item.importance,
      reason_codes:
        item.derived_from_report_id
          ? ['derived_relay_not_independent']
          : item.scenario_id === 'conflict'
          ? ['same_episode_count_disagreement']
          : item.scenario_id === 'quality'
            ? ['translation_quantity_ambiguous']
            : item.scenario_id === 'uncertain' && receipt_delay_hours >= 4
              ? ['delayed_receipt']
              : item.scenario_id === 'anomaly'
                ? ['reporting_coverage_changed']
                : ['independent_similar_observation'],
      report_title,
      reported_actor_name: actor,
      actor_attribution_status: item.actor_status,
      observation_type: item.observation_type,
      activity_description: item.activity,
      location_id: location.location_id,
      location_name: location.name,
      observed_at,
      received_at,
      item_type: item.item_type,
      reported_count: item.count,
      count_unit: item.count_unit,
      count_precision: item.precision,
      reported_count_lower: item.lower,
      reported_count_upper: item.upper,
      validation_status: item.validation_status,
      source_independent: item.source_independent,
      derived_from_report_id: item.derived_from_report_id ?? null,
      related_report_ids: (relatedByEvent.get(item.event_id) ?? []).filter(
        (relatedId) => relatedId !== report_id,
      ),
      comparison_notes: item.comparison_notes,
      original_language: item.original_language,
      grid_x: location.grid_x,
      grid_y: location.grid_y,
      receipt_delay_hours,
    };
  });
  for (const report of reports) {
    report.corroboration_count = countIndependentSimilarReports(report, reports);
  }

  const events = [...new Map(reports.map((report) => [report.event_id, report])).values()].map(
    (report) => ({
      event_id: report.event_id,
      scenario_id: report.scenario_id,
      event_title: report.report_title,
      episode_description: report.comparison_notes,
      location_id: report.location_id,
      observation_type: report.observation_type,
      item_type: report.item_type,
      count_unit: report.count_unit,
    }),
  );
  const entities = [
    { entity_id: groupEntityId, reported_name: actor, entity_type: 'group' as const, note: 'Fictional force name as it appears in source-attributed claims; not independently verified.' },
    { entity_id: cargoEntityId, reported_name: 'cargo truck', entity_type: 'equipment' as const, note: 'A reported item type; repeated observations are not deduplicated inventory.' },
    { entity_id: personnelEntityId, reported_name: 'personnel', entity_type: 'group' as const, note: 'A source-reported item type; no unique-personnel count is established.' },
  ];
  const provenance: Provenance[] = reports.map((report) => {
    const source = sources.find((candidate) => candidate.source_id === report.source_id)!;
    return {
      report_id: report.report_id,
      source_id: report.source_id,
      ingest_time: report.received_at,
      transformation_step:
        report.translation_status === 'machine'
          ? report.reported_count === null
            ? 'machine translation; quantity could not be resolved and remains unknown'
            : 'machine translation; quantity phrase retained as a reported range'
          : 'scenario-template normalization; source wording represented in structured fields',
      analyst_review_status: report.human_verified
        ? 'synthetic human review recorded'
        : 'human review not recorded',
      version: 1,
      provenance_chain: [
        `Generated from deterministic Cedar Watch seed ${seed}`,
        `Reported by ${source.display_name}`,
        `Observation recorded ${report.observed_at}`,
        `Received ${report.received_at}`,
        report.translation_status === 'machine'
          ? 'Machine translation recorded; human verification incomplete'
          : 'Original exercise-language record retained',
        report.human_verified
          ? 'Synthetic review status recorded; not truth verification'
          : 'No human verification recorded',
      ],
    };
  });
  const model_outputs: ModelOutput[] = reports.map((report) => {
    const count = report.reported_count;
    const width =
      report.count_precision === 'approximate' || report.count_precision === 'range' ? 2 : 1;
    return {
      report_id: report.report_id,
      anomaly_score: report.anomaly_score,
      cluster_id: `CL-${report.item_type.replaceAll(' ', '-')}`,
      predicted_value: count,
      uncertainty_lower:
        count === null ? null : Math.max(0, report.reported_count_lower ?? count - width),
      uncertainty_upper:
        count === null ? null : report.reported_count_upper ?? count + width,
      calibration_group: 'illustrative synthetic range; not calibrated',
    };
  });
  return {
    reports,
    sources,
    events,
    entities,
    locations: [...locations],
    exerciseAsOfTime: EXERCISE_AS_OF,
    provenance,
    model_outputs,
    synthetic_ground_truth: [],
  };
}
