import type {
  AnalyticTask,
  Echelon,
  MdmpPhase,
  MdmpTaskPresetId,
  MissionContext,
  TimeHorizon,
  VariableClass,
} from './types';
import { z } from 'zod';

export const DEFAULT_MISSION_CONTEXT: MissionContext = {
  mdmpPhase: 'mission_analysis',
  echelon: 'battalion',
  timeHorizon: '24_hours',
  variableClass: 'enemy',
};

export const MDMP_PHASES: Record<MdmpPhase, string> = {
  mission_analysis: 'Mission Analysis',
  coa_development: 'COA Development',
  coa_analysis: 'COA Analysis',
  coa_comparison: 'COA Comparison',
  orders_production: 'Orders Production',
};

export const ECHELONS: Record<Echelon, string> = {
  battalion: 'Battalion',
  brigade: 'Brigade',
  division: 'Division',
};

export const TIME_HORIZONS: Record<TimeHorizon, string> = {
  current: 'Current',
  '24_hours': 'Next 24 hours',
  '72_hours': 'Next 72 hours',
  one_week: 'Next 7 days',
};

export const VARIABLE_CLASSES: Record<VariableClass, string> = {
  friendly: 'Friendly',
  enemy: 'Enemy',
  terrain: 'Terrain',
  civil_considerations: 'Civil considerations',
  mixed: 'Mixed',
};

export const missionContextSchema = z.object({
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
});

export function loadMissionContext(): MissionContext {
  const stored = localStorage.getItem('avr-mission-context-v1');
  return stored ? missionContextSchema.parse(JSON.parse(stored)) : DEFAULT_MISSION_CONTEXT;
}

export type MdmpTaskPreset = {
  id: MdmpTaskPresetId;
  label: string;
  phase: MdmpPhase;
  analyticTask?: AnalyticTask;
  description: string;
  requirement?: string;
};

export const MDMP_TASK_PRESETS: MdmpTaskPreset[] = [
  {
    id: 'compare_reports',
    label: 'Compare reported quantities',
    phase: 'mission_analysis',
    analyticTask: 'compare_categories',
    description: 'Compare source-reported counts without adding repeated observations.',
  },
  {
    id: 'trend_over_time',
    label: 'Review reporting trends',
    phase: 'mission_analysis',
    analyticTask: 'analyze_trends',
    description: 'Review report frequency and coverage over exercise time.',
  },
  {
    id: 'spatial_pattern',
    label: 'Assess spatial pattern',
    phase: 'mission_analysis',
    description: 'Explore the distribution of observations in an area of interest.',
    requirement: 'A spatial-pattern recommendation is not yet available in this recommender.',
  },
  {
    id: 'compare_coas',
    label: 'Compare COAs',
    phase: 'coa_comparison',
    description: 'Compare outcomes across courses of action and time.',
    requirement: 'This dataset has no COA identifiers, outcome measures, or COA uncertainty.',
  },
  {
    id: 'assess_risk',
    label: 'Assess risk',
    phase: 'coa_analysis',
    description: 'Compare risk measures and their uncertainty across COAs or locations.',
    requirement: 'This dataset has no operational risk measure or calibrated risk uncertainty.',
  },
  {
    id: 'enemy_composition',
    label: 'Visualize enemy composition',
    phase: 'mission_analysis',
    description: 'Summarize reported composition by unit or equipment category.',
    requirement: 'This dataset has no structured order-of-battle or unit-composition fields.',
  },
  {
    id: 'isr_confidence',
    label: 'Summarize ISR confidence',
    phase: 'mission_analysis',
    analyticTask: 'assess_confidence',
    description:
      'Inspect source confidence, validation, missingness, and model uncertainty separately.',
  },
  {
    id: 'source_disagreement',
    label: 'Examine source disagreement',
    phase: 'mission_analysis',
    analyticTask: 'examine_source_conflict',
    description: 'Compare reports linked to an episode without hiding conflicting claims.',
  },
  {
    id: 'trace_provenance',
    label: 'Trace report provenance',
    phase: 'mission_analysis',
    analyticTask: 'explore_provenance',
    description: 'Distinguish observation time, receipt time, source, and processing history.',
  },
];

export function presetForAnalyticTask(task: AnalyticTask): MdmpTaskPresetId {
  return MDMP_TASK_PRESETS.find((preset) => preset.analyticTask === task)?.id ?? 'compare_reports';
}
