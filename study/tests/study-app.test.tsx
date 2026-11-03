import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudyApp } from '../src/StudyApp';
import { assignTrials, saveSession, STORAGE_KEY, type PilotSession } from '../src/protocol';

vi.mock('../../src/components/charts/VegaChart', () => ({
  VegaChart: ({ ariaLabel }: { ariaLabel?: string }) => (
    <div role="img" aria-label={ariaLabel ?? 'Mock recommended chart'} />
  ),
}));

function sessionForGroup(group: number): PilotSession {
  const participantId = Array.from({ length: 1000 }, (_, index) => `participant-${index}`).find(
    (id) => assignTrials(id).group === group,
  )!;
  const assigned = assignTrials(participantId);
  return {
    schemaVersion: 1,
    protocolVersion: 'draft-1',
    participantId,
    sessionId: `session-group-${group}`,
    consentAccepted: true,
    sourceCommit: 'test',
    stimulusSeed: 271828,
    stimulusVersion: 'cedar-watch-generator-1',
    counterbalanceGroup: assigned.group,
    assignedOrder: assigned.trials.map((trial) => trial.trialId),
    status: 'in_progress',
    responses: [],
    usability: {
      evidenceClarity: null,
      conditionPreference: null,
      easierCondition: null,
    },
  };
}

function startTrial() {
  fireEvent.click(screen.getByRole('button', { name: 'Continue to draft consent' }));
  fireEvent.click(
    screen.getByLabelText(/I have read this draft and voluntarily agree to continue/),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Agree and begin practice' }));
  fireEvent.click(screen.getByRole('radio', { name: 'No' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check practice response' }));
  fireEvent.click(screen.getByRole('button', { name: 'Begin experimental trials' }));
}

describe('pilot participant flow', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('renders the fixed baseline and task-aware recommendation conditions', () => {
    const baseline = sessionForGroup(0);
    saveSession(baseline);
    const baselineView = render(<StudyApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume saved session' }));
    expect(screen.getByText(/Fixed baseline: report comparison table/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Task-aware recommendation' })).not.toBeInTheDocument();
    baselineView.unmount();

    const recommended = sessionForGroup(1);
    saveSession(recommended);
    render(<StudyApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume saved session' }));
    expect(screen.getByRole('region', { name: 'Task-aware recommendation' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Task-aware recommended/ })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /Source-reported observations/ })).toBeInTheDocument();
  });

  it('declines without creating a local participant session', () => {
    render(<StudyApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to draft consent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decline and exit' }));
    expect(screen.getByRole('heading', { name: 'You declined' })).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('requires all trial answers, preserves unknown responses, and completes a full synthetic session', () => {
    render(<StudyApp />);
    startTrial();

    const submit = screen.getByRole('button', { name: 'Record response and continue' });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getAllByRole('button', { name: /Inspect / })[0]);
    fireEvent.click(screen.getByRole('radio', { name: /I cannot determine an answer/ }));
    fireEvent.change(screen.getByLabelText('Confidence'), { target: { value: '3' } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Perceived difficulty'), { target: { value: '2' } });
    fireEvent.click(submit);

    for (let index = 1; index < 10; index += 1) {
      const choice = screen
        .getAllByRole('radio')
        .find((radio) => (radio as HTMLInputElement).value !== 'unknown');
      expect(choice).toBeDefined();
      fireEvent.click(choice!);
      fireEvent.change(screen.getByLabelText('Confidence'), { target: { value: '4' } });
      fireEvent.change(screen.getByLabelText('Perceived difficulty'), { target: { value: '3' } });
      fireEvent.click(screen.getByRole('button', { name: 'Record response and continue' }));
    }

    expect(screen.getByRole('heading', { name: 'Usability and preference' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Evidence clarity'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Condition preference'), { target: { value: 'recommended' } });
    fireEvent.change(screen.getByLabelText('Easier condition'), { target: { value: 'no-difference' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save responses and view debrief' }));

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    expect(saved).toMatchObject({
      status: 'complete',
      responses: expect.arrayContaining([
        expect.objectContaining({ answerKind: 'unknown', answerId: null, selectedReports: expect.any(Array) }),
      ]),
      usability: {
        evidenceClarity: 4,
        conditionPreference: 'recommended',
        easierCondition: 'no-difference',
      },
    });
    expect(saved.responses).toHaveLength(10);
    expect(saved.responses[0].evidenceInteractions).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'report_select' })]),
    );
    expect(saved).not.toHaveProperty('answerKey');
    expect(screen.getByRole('heading', { name: 'Thank you' })).toBeInTheDocument();
  });
});
