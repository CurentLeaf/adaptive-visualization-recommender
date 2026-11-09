import { z } from 'zod';
import type { ScenarioId } from '../../src/domain/types';
import { getQuestion } from './questions';

export const PROTOCOL_VERSION = 'draft-1';
export const RESPONSE_SCHEMA_VERSION = 1;
export const STIMULUS_SEED = 271828;
export const STIMULUS_VERSION = 'cedar-watch-generator-1';
export const STORAGE_KEY = 'avr-cedar-watch-pilot-v1';
export const STUDY_UI_VERSION = 'rehearsal-2026.11.06.2';
const TRIAL_DRAFT_PREFIX = `${STORAGE_KEY}:draft:`;

export const scenarioOrder: ScenarioId[] = [
  'corroboration',
  'conflict',
  'uncertain',
  'quality',
  'anomaly',
];
const scenarioIdSchema = z.enum(['corroboration', 'conflict', 'uncertain', 'quality', 'anomaly']);

export type StudyCondition = 'baseline' | 'recommended';
export type TaskVariant = 'A' | 'B';
export type TrialAssignment = {
  trialId: string;
  scenarioFamily: ScenarioId;
  taskVariant: TaskVariant;
  condition: StudyCondition;
};

export function isValidTrialTuple(
  trialId: string,
  scenarioFamily: ScenarioId,
  taskVariant: TaskVariant,
  condition: StudyCondition,
): boolean {
  return trialId === `${scenarioFamily}-${taskVariant}-${condition}`;
}

const interactionSchema = z
  .object({
    type: z.enum(['report_select', 'visualization_select']),
    value: z.string().max(120),
    elapsedMs: z.number().int().nonnegative(),
  })
  .strict();

export const trialRecordSchema = z
  .object({
    trialId: z.string(),
    trialIndex: z.number().int().min(0).max(9),
    scenarioFamily: scenarioIdSchema,
    taskVariant: z.enum(['A', 'B']),
    condition: z.enum(['baseline', 'recommended']),
    recommendedVisualization: z.string().max(120).nullable(),
    selectedVisualization: z.string().max(120),
    selectedReports: z.array(z.string().max(120)),
    evidenceInteractions: z.array(interactionSchema),
    answerKind: z.enum(['choice', 'unknown']),
    answerId: z.string().max(120).nullable(),
    confidence: z.number().int().min(1).max(5),
    perceivedDifficulty: z.number().int().min(1).max(5),
    activeTrialTimeMs: z.number().int().nonnegative(),
    visibilityInterruptions: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    (trial) =>
      (trial.answerKind === 'unknown' && trial.answerId === null) ||
      (trial.answerKind === 'choice' && trial.answerId !== null),
    'Unknown responses must remain null; selected choices must include an answer ID.',
  );

export const pilotSessionSchema = z
  .object({
    schemaVersion: z.literal(RESPONSE_SCHEMA_VERSION),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    uiVersion: z.string().max(80).optional(),
    participantId: z.string().min(1).max(80),
    sessionId: z.string().min(1).max(80),
    consentAccepted: z.literal(true),
    sourceCommit: z.string().max(80),
    stimulusSeed: z.number().int(),
    stimulusVersion: z.string().max(80),
    counterbalanceGroup: z.number().int().min(0).max(3),
    assignedOrder: z.array(z.string()).length(10),
    status: z.enum(['in_progress', 'complete']),
    responses: z.array(trialRecordSchema).max(10),
    usability: z
      .object({
        evidenceClarity: z.number().int().min(1).max(5).nullable(),
        conditionPreference: z.enum(['baseline', 'recommended', 'no-preference']).nullable(),
        easierCondition: z.enum(['baseline', 'recommended', 'no-difference']).nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((session, context) => {
    if (new Set(session.assignedOrder).size !== session.assignedOrder.length) {
      context.addIssue({
        code: 'custom',
        path: ['assignedOrder'],
        message: 'Assigned trial IDs must be unique.',
      });
    }

    session.responses.forEach((trial, index) => {
      if (trial.trialIndex !== index || session.assignedOrder[index] !== trial.trialId) {
        context.addIssue({
          code: 'custom',
          path: ['responses', index],
          message: 'Responses must follow the assigned trial order.',
        });
      }
      if (
        trial.answerKind === 'choice' &&
        !getQuestion(trial.scenarioFamily, trial.taskVariant).options.some(
          (option) => option.id === trial.answerId,
        )
      ) {
        context.addIssue({
          code: 'custom',
          path: ['responses', index, 'answerId'],
          message: 'Choice response must match a valid option for the assigned question.',
        });
      }
    });

    if (
      session.status === 'complete' &&
      (session.responses.length !== 10 ||
        session.usability.evidenceClarity === null ||
        session.usability.conditionPreference === null ||
        session.usability.easierCondition === null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'A complete session must include ten trials and all usability answers.',
      });
    }
  });

export type TrialRecord = z.infer<typeof trialRecordSchema>;
export type PilotSession = z.infer<typeof pilotSessionSchema>;

export const trialDraftSchema = z
  .object({
    sessionId: z.string().min(1).max(80),
    trialId: z.string().min(1).max(120),
    selectedReportId: z.string().max(120),
    selectedVisualizationId: z.string().max(120),
    answerKind: z.enum(['choice', 'unknown']).nullable(),
    answerId: z.string().max(120),
    confidence: z.enum(['', '1', '2', '3', '4', '5']),
    difficulty: z.enum(['', '1', '2', '3', '4', '5']),
    interactions: z.array(interactionSchema).max(1000),
    activeTrialTimeMs: z.number().int().nonnegative(),
    visibilityInterruptions: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    (draft) =>
      (draft.answerKind !== 'unknown' || draft.answerId === '') &&
      (draft.answerKind !== 'choice' || draft.answerId.length > 0),
    'Choice drafts require an option and unknown drafts must not contain a choice.',
  );
export type TrialDraft = z.infer<typeof trialDraftSchema>;

export function emptyTrialDraft(
  sessionId: string,
  trialId: string,
  selectedVisualizationId: string,
): TrialDraft {
  return {
    sessionId,
    trialId,
    selectedReportId: '',
    selectedVisualizationId,
    answerKind: null,
    answerId: '',
    confidence: '',
    difficulty: '',
    interactions: [],
    activeTrialTimeMs: 0,
    visibilityInterruptions: 0,
  };
}

function trialDraftKey(sessionId: string, trialId: string): string {
  return `${TRIAL_DRAFT_PREFIX}${encodeURIComponent(sessionId)}:${encodeURIComponent(trialId)}`;
}

export function loadTrialDraft(sessionId: string, trialId: string): TrialDraft | null {
  try {
    const raw = localStorage.getItem(trialDraftKey(sessionId, trialId));
    if (raw === null) return null;
    const draft = trialDraftSchema.parse(JSON.parse(raw));
    return draft.sessionId === sessionId && draft.trialId === trialId ? draft : null;
  } catch {
    return null;
  }
}

export function saveTrialDraft(draft: TrialDraft): void {
  const validDraft = trialDraftSchema.parse(draft);
  localStorage.setItem(
    trialDraftKey(validDraft.sessionId, validDraft.trialId),
    JSON.stringify(validDraft),
  );
}

export function clearTrialDraft(sessionId: string, trialId: string): void {
  localStorage.removeItem(trialDraftKey(sessionId, trialId));
}

export function assignTrials(participantId: string): {
  group: number;
  trials: TrialAssignment[];
} {
  let hash = 2166136261;
  for (const character of participantId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const group = (hash >>> 0) % 4;
  const familyOrder =
    group < 2
      ? [...scenarioOrder.slice(group), ...scenarioOrder.slice(0, group)]
      : [...scenarioOrder].reverse();
  const trials: TrialAssignment[] = [];

  familyOrder.forEach((scenarioFamily, index) => {
    const baselineVariant: TaskVariant = (Math.floor(group / 2) + index) % 2 === 0 ? 'A' : 'B';
    const recommendedVariant = baselineVariant === 'A' ? 'B' : 'A';
    const baselineFirst = (group + index) % 2 === 0;
    const firstCondition: StudyCondition = baselineFirst ? 'baseline' : 'recommended';
    const secondCondition: StudyCondition = baselineFirst ? 'recommended' : 'baseline';
    const assignmentByCondition: Record<StudyCondition, TaskVariant> = {
      baseline: baselineVariant,
      recommended: recommendedVariant,
    };
    const conditionOrder: StudyCondition[] = [firstCondition, secondCondition];
    for (const condition of conditionOrder) {
      const taskVariant = assignmentByCondition[condition];
      trials.push({
        trialId: `${scenarioFamily}-${taskVariant}-${condition}`,
        scenarioFamily,
        taskVariant,
        condition,
      });
    }
  });

  return { group, trials };
}

export function saveSession(session: PilotSession): void {
  const validSession = pilotSessionSchema.parse(session);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(validSession));
}

export function loadSession(): PilotSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : pilotSessionSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(TRIAL_DRAFT_PREFIX)) localStorage.removeItem(key);
  }
}

export function sessionExportJson(session: PilotSession): string {
  return JSON.stringify(
    { schemaVersion: RESPONSE_SCHEMA_VERSION, sessions: [pilotSessionSchema.parse(session)] },
    null,
    2,
  );
}

const csvColumns = [
  'schemaVersion',
  'protocolVersion',
  'uiVersion',
  'participantId',
  'sessionId',
  'sourceCommit',
  'stimulusSeed',
  'stimulusVersion',
  'counterbalanceGroup',
  'assignedOrder',
  'sessionStatus',
  'trialIndex',
  'trialId',
  'scenarioFamily',
  'taskVariant',
  'condition',
  'recommendedVisualization',
  'selectedVisualization',
  'selectedReports',
  'evidenceInteractions',
  'answerKind',
  'answerId',
  'confidence',
  'perceivedDifficulty',
  'activeTrialTimeMs',
  'visibilityInterruptions',
  'evidenceClarity',
  'conditionPreference',
  'easierCondition',
] as const;

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function sessionExportCsv(session: PilotSession): string {
  const validSession = pilotSessionSchema.parse(session);
  const rows =
    validSession.responses.length > 0
      ? validSession.responses
      : [null];
  return [
    csvColumns.join(','),
    ...rows.map((trial) =>
      csvColumns
        .map((column) => {
          const value =
            column === 'schemaVersion'
              ? validSession.schemaVersion
              : column === 'protocolVersion'
                ? validSession.protocolVersion
                : column === 'uiVersion'
                  ? validSession.uiVersion
                : column === 'participantId'
                  ? validSession.participantId
                  : column === 'sessionId'
                    ? validSession.sessionId
                    : column === 'sourceCommit'
                      ? validSession.sourceCommit
                      : column === 'stimulusSeed'
                        ? validSession.stimulusSeed
                        : column === 'stimulusVersion'
                          ? validSession.stimulusVersion
                          : column === 'counterbalanceGroup'
                            ? validSession.counterbalanceGroup
                            : column === 'assignedOrder'
                              ? JSON.stringify(validSession.assignedOrder)
                              : column === 'sessionStatus'
                                ? validSession.status
                                : column === 'trialIndex'
                                  ? trial?.trialIndex
                                  : column === 'trialId'
                                    ? trial?.trialId
                                    : column === 'scenarioFamily'
                                      ? trial?.scenarioFamily
                                      : column === 'taskVariant'
                                        ? trial?.taskVariant
                                        : column === 'condition'
                                          ? trial?.condition
                                          : column === 'recommendedVisualization'
                                            ? trial?.recommendedVisualization
                                            : column === 'selectedVisualization'
                                              ? trial?.selectedVisualization
                                              : column === 'selectedReports'
                                                ? JSON.stringify(trial?.selectedReports ?? [])
                                                : column === 'evidenceInteractions'
                                                  ? JSON.stringify(trial?.evidenceInteractions ?? [])
                                                  : column === 'answerKind'
                                                    ? trial?.answerKind
                                                    : column === 'answerId'
                                                      ? trial?.answerId
                                                      : column === 'confidence'
                                                        ? trial?.confidence
                                                        : column === 'perceivedDifficulty'
                                                          ? trial?.perceivedDifficulty
                                                          : column === 'activeTrialTimeMs'
                                                            ? trial?.activeTrialTimeMs
                                                            : column === 'visibilityInterruptions'
                                                              ? trial?.visibilityInterruptions
                                                              : column === 'evidenceClarity'
                                                                ? validSession.usability.evidenceClarity
                                                                : column === 'conditionPreference'
                                                                  ? validSession.usability.conditionPreference
                                                                  : validSession.usability.easierCondition;
          return csvCell(value);
        })
        .join(','),
    ),
  ].join('\r\n');
}

export function downloadExport(filename: string, content: string, contentType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: contentType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
