import { beforeEach, describe, expect, it } from 'vitest';
import { getQuestion } from '../src/questions';
import {
  assignTrials,
  loadSession,
  RESPONSE_SCHEMA_VERSION,
  saveSession,
  sessionExportCsv,
  sessionExportJson,
  STORAGE_KEY,
  type PilotSession,
  type TrialRecord,
} from '../src/protocol';

function createSession(participantId: string): PilotSession {
  const { group, trials } = assignTrials(participantId);
  return {
    schemaVersion: RESPONSE_SCHEMA_VERSION,
    protocolVersion: 'draft-1',
    participantId,
    sessionId: 'session-test',
    consentAccepted: true,
    acceptedAt: '2026-01-01T00:00:00.000Z',
    sourceCommit: 'test-commit',
    stimulusSeed: 271828,
    stimulusVersion: 'cedar-watch-generator-1',
    counterbalanceGroup: group,
    assignedOrder: trials.map((trial) => trial.trialId),
    status: 'in_progress',
    responses: [],
    usability: {
      evidenceClarity: null,
      conditionPreference: null,
      easierCondition: null,
    },
    completedAt: null,
  };
}

describe('pilot assignment, response validation, and local export', () => {
  beforeEach(() => localStorage.clear());

  it('creates a repeatable four-group counterbalanced assignment with both conditions per family', () => {
    const first = assignTrials('participant-seed-01');
    expect(assignTrials('participant-seed-01')).toEqual(first);
    expect(first.trials).toHaveLength(10);
    for (const family of ['corroboration', 'conflict', 'uncertain', 'quality', 'anomaly']) {
      const familyTrials = first.trials.filter((trial) => trial.scenarioFamily === family);
      expect(familyTrials.map((trial) => trial.condition).sort()).toEqual(['baseline', 'recommended']);
      expect(new Set(familyTrials.map((trial) => trial.taskVariant)).size).toBe(2);
    }
    expect(new Set(Array.from({ length: 100 }, (_, index) => assignTrials(`p-${index}`).group))).toEqual(
      new Set([0, 1, 2, 3]),
    );
  });

  it('keeps the answer key separate from participant-facing questions', async () => {
    const key = await import('../analysis/answer-key.json');
    for (const [family, variants] of Object.entries(key.answerKey)) {
      for (const [variant, answerId] of Object.entries(variants)) {
        expect(
          getQuestion(family as keyof typeof key.answerKey, variant as 'A' | 'B').options.some(
            (option) => option.id === answerId,
          ),
        ).toBe(true);
      }
    }
  });

  it('persists and exports an explicit unknown answer without treating it as missing', () => {
    const session = createSession('participant-unknown');
    const first = assignTrials(session.participantId).trials[0];
    const unknown: TrialRecord = {
      ...first,
      trialIndex: 0,
      recommendedVisualization: null,
      selectedVisualization: 'report-comparison-table',
      selectedReports: [],
      evidenceInteractions: [],
      answerKind: 'unknown',
      answerId: null,
      confidence: 3,
      perceivedDifficulty: 4,
      activeTrialTimeMs: 12500,
      visibilityInterruptions: 1,
    };
    const saved = { ...session, responses: [unknown] };
    saveSession(saved);

    expect(loadSession()?.responses[0]).toMatchObject({
      answerKind: 'unknown',
      answerId: null,
      visibilityInterruptions: 1,
    });
    const json = sessionExportJson(saved);
    expect(JSON.parse(json).sessions[0].responses[0]).toMatchObject({
      answerKind: 'unknown',
      answerId: null,
    });
    expect(json).not.toMatch(/answerKey|expectedAnswer|correct/i);
    expect(sessionExportCsv(saved)).toContain('unknown,');
    expect(localStorage.getItem(STORAGE_KEY)).toContain('"answerId":null');
  });

  it('rejects invalid response combinations before persistence or export', () => {
    const session = createSession('participant-invalid');
    const first = assignTrials(session.participantId).trials[0];
    const invalid = {
      ...session,
      responses: [
        {
          ...first,
          trialIndex: 0,
          recommendedVisualization: null,
          selectedVisualization: 'report-comparison-table',
          selectedReports: [],
          evidenceInteractions: [],
          answerKind: 'unknown',
          answerId: 'choice',
          confidence: 3,
          perceivedDifficulty: 3,
          activeTrialTimeMs: 1,
          visibilityInterruptions: 0,
        },
      ],
    } as PilotSession;
    expect(() => saveSession(invalid)).toThrow();
    expect(() => sessionExportJson(invalid)).toThrow();
  });
});
