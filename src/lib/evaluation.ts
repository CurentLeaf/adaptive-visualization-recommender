import { z } from 'zod';
import { SCENARIOS } from '../domain/constants';
import { missionContextSchema } from '../domain/mdmp';
import type { AudienceMode, EvaluationRecord, ScenarioId } from '../domain/types';
const filtersSchema = z.object({
  start: z.string(),
  end: z.string(),
  region: z.string(),
  category: z.string(),
  sourceType: z.string(),
  minConfidence: z.number(),
  minValidation: z.number(),
  minConflict: z.number(),
  translation: z.string(),
  verified: z.string(),
});
const legacyRecordSchema = z.object({
  sessionId: z.string(),
  scenarioId: z.enum(['corroboration', 'uncertain', 'conflict', 'anomaly', 'quality']),
  analyticTask: z.enum([
    'compare_categories',
    'analyze_trends',
    'detect_anomalies',
    'examine_source_conflict',
    'assess_confidence',
    'explore_provenance',
  ]),
  chartSelected: z.string(),
  filters: filtersSchema,
  visualInteractions: z.array(
    z.object({ type: z.string(), value: z.string(), timestamp: z.string() }),
  ),
  selectedReports: z.array(z.string()),
  timeToAnswerMs: z.number().nonnegative(),
  submittedAnswer: z.string(),
  expectedAnswer: z.string(),
  correct: z.boolean(),
  userConfidence: z.number().min(1).max(5),
  timestamp: z.string(),
  researchNote: z.string().max(2000).optional(),
});
const recordSchema = legacyRecordSchema.extend({
  schemaVersion: z.literal(2),
  questionId: z.string(),
  audienceMode: z.enum(['Commander', 'Analyst']),
  missionContext: missionContextSchema.optional(),
});
const KEY = 'avr-evaluations-v2';
const LEGACY_KEY = 'avr-evaluations-v1';

const ANSWERS: Record<ScenarioId, { expected: string; options: string[] }> = {
  corroboration: {
    expected:
      'Observation Team Cedar, Imagery Review Desk, Road Patrol Log, and Community Contact Network; similar counts, not unique inventory.',
    options: [
      'Observation Team Cedar, Imagery Review Desk, Road Patrol Log, and Community Contact Network; similar counts, not unique inventory.',
      'Observation Team Cedar only; no other source reported trucks.',
      'Twenty-four distinct trucks; add all report counts.',
    ],
  },
  conflict: {
    expected:
      'Observation Team Cedar and Road Patrol Log reported about 6, Imagery Review Desk reported 4, and Radio Log Monitor gave no count.',
    options: [
      'Observation Team Cedar and Road Patrol Log reported about 6, Imagery Review Desk reported 4, and Radio Log Monitor gave no count.',
      'All four sources reported 6.',
      'The reports establish a total inventory of 16 trucks.',
    ],
  },
  uncertain: {
    expected: '4 exercise hours.',
    options: ['1 exercise hour.', '2 exercise hours.', '4 exercise hours.', '6 exercise hours.'],
  },
  quality: {
    expected: 'No. The translated range is not human verified.',
    options: [
      'No. The translated range is not human verified.',
      'Yes. A source confidence score verifies the count.',
    ],
  },
  anomaly: {
    expected:
      'No. Report volume and reporting coverage increased; increased activity is not established.',
    options: [
      'No. Report volume and reporting coverage increased; increased activity is not established.',
      'Yes. More reports prove more vehicles were present.',
    ],
  },
};

export function expectedAnswer(scenario: ScenarioId): string {
  return ANSWERS[scenario].expected;
}
export function answerOptions(scenario: ScenarioId): string[] {
  return [...ANSWERS[scenario].options];
}
export function loadEvaluations(): EvaluationRecord[] {
  try {
    const currentValue = localStorage.getItem(KEY);
    if (currentValue !== null) {
      return z.array(recordSchema).parse(JSON.parse(currentValue)) as EvaluationRecord[];
    }
    const legacyValue = localStorage.getItem(LEGACY_KEY);
    if (!legacyValue) return [];
    return z
      .array(legacyRecordSchema)
      .parse(JSON.parse(legacyValue))
      .map((record) => ({
        ...record,
        schemaVersion: 2 as const,
        questionId: `${record.scenarioId}-legacy-v1`,
        audienceMode: 'Commander' as AudienceMode,
      }));
  } catch {
    return [];
  }
}
export function saveEvaluation(record: EvaluationRecord): EvaluationRecord[] {
  const next = [...loadEvaluations(), record];
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
export function clearEvaluations() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(LEGACY_KEY);
}
export function exportEvaluations(records: EvaluationRecord[]) {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          schemaVersion: 2,
          label: 'Fictional Research Dataset — Not Operational Data',
          evaluations: records,
        },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'evaluation-log.json';
  link.click();
  URL.revokeObjectURL(url);
}
export function evaluationSummary(records: EvaluationRecord[]) {
  const count = records.length;
  const mean = (values: number[]) => (count ? values.reduce((a, b) => a + b, 0) / count : 0);
  const accuracy = mean(records.map((r) => Number(r.correct)));
  const confidence = mean(records.map((r) => r.userConfidence));
  return {
    count,
    accuracy,
    meanTimeSeconds: mean(records.map((r) => r.timeToAnswerMs / 1000)),
    meanConfidence: confidence,
    calibrationGap: Math.abs(confidence / 5 - accuracy),
  };
}
export const scenarioQuestion = (id: ScenarioId) => SCENARIOS[id].question;
