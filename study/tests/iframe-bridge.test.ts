import { describe, expect, it, vi } from 'vitest';
import { canSubmitHostedSession, createIframeBridge, isAllowedParentOrigin } from '../src/iframeBridge';
import { assignTrials, type PilotSession } from '../src/protocol';

function completedSession(): PilotSession {
  const participantId = 'existing-participant';
  const { group, trials } = assignTrials(participantId);
  return {
    schemaVersion: 1,
    protocolVersion: 'draft-1',
    participantId,
    sessionId: 'existing-session',
    consentAccepted: true,
    sourceCommit: 'test',
    stimulusSeed: 271828,
    stimulusVersion: 'cedar-watch-generator-1',
    counterbalanceGroup: group,
    assignedOrder: trials.map((trial) => trial.trialId),
    status: 'complete',
    responses: trials.map((trial, trialIndex) => ({
      ...trial,
      trialIndex,
      recommendedVisualization: null,
      selectedVisualization: 'report-comparison-table',
      selectedReports: [],
      evidenceInteractions: [],
      answerKind: 'unknown',
      answerId: null,
      confidence: 3,
      perceivedDifficulty: 3,
      activeTrialTimeMs: 1000,
      visibilityInterruptions: 0,
    })),
    usability: { evidenceClarity: 3, conditionPreference: 'baseline', easierCondition: 'baseline' },
  };
}

describe('ReVISit iframe bridge', () => {
  it('allows HTTP only for exact loopback origins under explicit development opt-in', () => {
    expect(isAllowedParentOrigin('http://localhost:8080', ['http://localhost:8080'], true)).toBe(true);
    expect(isAllowedParentOrigin('http://127.0.0.1:8080', ['http://127.0.0.1:8080'], true)).toBe(true);
    expect(isAllowedParentOrigin('http://localhost:8080', ['http://localhost:8080'], false)).toBe(false);
    expect(isAllowedParentOrigin('http://localhost.attacker.example:8080', ['http://localhost.attacker.example:8080'], true)).toBe(false);
    expect(isAllowedParentOrigin('http://example.com:8080', ['http://example.com:8080'], true)).toBe(false);
    expect(isAllowedParentOrigin('http://localhost:8080/path', ['http://localhost:8080/path'], true)).toBe(false);
    expect(isAllowedParentOrigin('https://host.example', ['https://host.example'], false)).toBe(true);
    expect(isAllowedParentOrigin('https://host.example', [], true)).toBe(false);
  });

  it('posts readiness to exact parent origin and only sends validated completed sessions after STUDY_DATA', () => {
    const listener = vi.fn();
    const parent = { postMessage: vi.fn() };
    const target = {
      parent,
      addEventListener: vi.fn((_type: string, callback: (event: MessageEvent) => void) => listener.mockImplementation(callback)),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const onData = vi.fn();
    const origin = 'https://host.example';
    const bridge = createIframeBridge({ search: '?id=widget_1&trialid=trial_1&parentOrigin=https%3A%2F%2Fhost.example', origin: 'https://study.example' } as Location, target, 'https://host.example/page', onData, ['https://host.example']);
    bridge.start();
    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: '@REVISIT_COMMS/WINDOW_READY', iframeId: 'widget_1' }), origin);
    bridge.postSession({} as never);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    const event = (eventOrigin: string, eventSource: Window, data: unknown) => listener({ origin: eventOrigin, source: eventSource, data } as MessageEvent);
    event(origin, {} as Window, { error: false, iframeId: 'widget_1', type: '@REVISIT_COMMS/STUDY_DATA', message: {} });
    expect(onData).not.toHaveBeenCalled();
    event(origin, parent as unknown as Window, { error: false, iframeId: 'widget_1', type: '@REVISIT_COMMS/STUDY_DATA', message: { seed: 1 } });
    expect(onData).toHaveBeenCalledWith({ seed: 1 });
    bridge.dispose();
    expect(target.removeEventListener).toHaveBeenCalled();
  });

  it('does not enable the bridge for invalid or incomplete query parameters', () => {
    const target = { parent: {}, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as Window;
    expect(createIframeBridge({ search: '?id=bad%20id&trialid=t&parentOrigin=https%3A%2F%2Fhost.example', origin: 'https://study.example' } as Location, target, 'https://host.example/page', vi.fn(), ['https://host.example']).enabled).toBe(false);
    expect(createIframeBridge({ search: '?id=widget&trialid=t&parentOrigin=https%3A%2F%2Fattacker.example', origin: 'https://study.example' } as Location, target, 'https://attacker.example/page', vi.fn(), ['https://host.example']).enabled).toBe(false);
    expect(createIframeBridge({ search: '?id=widget&trialid=t&parentOrigin=https%3A%2F%2Fhost.example', origin: 'https://study.example' } as Location, target, '', vi.fn(), ['https://host.example']).enabled).toBe(false);
  });

  it('does not submit an existing browser session after host navigation or reload', () => {
    const existingCompletedSession = completedSession();
    expect(canSubmitHostedSession(false, existingCompletedSession)).toBe(false);
    expect(canSubmitHostedSession(true, existingCompletedSession)).toBe(true);
  });

  it('cancels queued completion when reset before STUDY_DATA, then permits a fresh completion', () => {
    const listener = vi.fn();
    const parent = { postMessage: vi.fn() };
    const target = {
      parent,
      addEventListener: vi.fn((_type: string, callback: (event: MessageEvent) => void) => listener.mockImplementation(callback)),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const bridge = createIframeBridge({ search: '?id=widget_1&trialid=trial_1&parentOrigin=https%3A%2F%2Fhost.example', origin: 'https://study.example' } as Location, target, 'https://host.example/page', vi.fn(), ['https://host.example']);
    bridge.start();
    bridge.postSession(completedSession());
    bridge.resetCompletion();
    listener({ origin: 'https://host.example', source: parent as unknown as Window, data: { error: false, iframeId: 'widget_1', type: '@REVISIT_COMMS/STUDY_DATA', message: {} } } as MessageEvent);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    bridge.postSession(completedSession());
    expect(parent.postMessage).toHaveBeenCalledTimes(2);
    expect(parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: '@REVISIT_COMMS/ANSWERS' }), 'https://host.example');
  });
});
