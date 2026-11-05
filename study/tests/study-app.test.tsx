import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudyApp } from '../src/StudyApp';
import {
  assignTrials,
  clearSession,
  emptyTrialDraft,
  loadSession,
  loadTrialDraft,
  saveSession,
  saveTrialDraft,
  STUDY_UI_VERSION,
  STORAGE_KEY,
  type PilotSession,
} from '../src/protocol';
import { containsTextMark, getScenarioView } from '../src/studyModel';

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
    expect(screen.getByText('Evidence-only view')).toBeInTheDocument();
    expect(screen.getByText(/Fixed evidence-only view: report comparison table/)).toBeInTheDocument();
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

  it('audits every selectable recommendation for every scenario and detects text marks', () => {
    const audit = ['corroboration', 'conflict', 'uncertain', 'quality', 'anomaly'].map((family) => {
      const recommendations = getScenarioView(family as Parameters<typeof getScenarioView>[0])
        .recommendations;
      return {
        family,
        recommendations: recommendations.map(({ id, vegaLiteSpec }) => ({
          id,
          textMark: containsTextMark(vegaLiteSpec),
        })),
      };
    });
    expect(audit).toHaveLength(5);
    expect(audit.every((scenario) => scenario.recommendations.length > 0)).toBe(true);
    expect(audit.every((scenario) => scenario.recommendations.every((item) => item.id))).toBe(true);
    for (const [family, recommendationId] of [
      ['corroboration', 'compare_categories-table_detail'],
      ['conflict', 'examine_source_conflict-table_detail'],
      ['uncertain', 'explore_provenance-table_detail'],
      ['quality', 'assess_confidence-table_detail'],
      ['anomaly', 'analyze_trends-table_detail'],
    ] as const) {
      expect(
        audit
          .find((scenario) => scenario.family === family)
          ?.recommendations.find((recommendation) => recommendation.id === recommendationId)
          ?.textMark,
      ).toBe(true);
    }
  });

  it('preserves response drafts through report and chart selection, inspector expansion and resume', () => {
    const recommended = sessionForGroup(1);
    saveSession(recommended);
    const view = render(<StudyApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume saved session' }));

    expect(document.querySelector('.study-kicker')?.textContent).toContain('Trial 1 of 10');
    expect(screen.getByText('Task-aware recommended view')).toBeInTheDocument();
    const answer = screen.getByRole('radio', { name: /I cannot determine an answer/ });
    fireEvent.click(screen.getByRole('radio', { name: /I cannot determine an answer/ }));
    fireEvent.change(screen.getByLabelText('Confidence'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Perceived difficulty'), { target: { value: '2' } });

    fireEvent.click(screen.getAllByRole('button', { name: /Inspect / })[0]);
    const visualizationSelect = screen.getByLabelText('Select visualization');
    const options = Array.from((visualizationSelect as HTMLSelectElement).options);
    if (options.length > 1) {
      fireEvent.change(visualizationSelect, { target: { value: options[1].value } });
      expect(
        screen.getByRole('region', { name: /Readable table for Report detail table/ }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole('table', { name: /Source-reported observations/ }).length).toBe(2);
    }
    const technicalDetails = screen.getByText('5. Technical details, analysis, and mappings');
    fireEvent.click(technicalDetails);

    expect(answer).toBeChecked();
    expect(screen.getByLabelText('Confidence')).toHaveValue('4');
    expect(screen.getByLabelText('Perceived difficulty')).toHaveValue('2');
    expect(screen.getByRole('button', { name: 'Record response and continue' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Trial response panel' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Save and exit this draft session' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByRole('radio', { name: /I cannot determine an answer/ })).toBeChecked();
    expect(screen.getByLabelText('Confidence')).toHaveValue('4');
    expect(screen.getByLabelText('Perceived difficulty')).toHaveValue('2');
    expect(loadSession()?.uiVersion).toBeUndefined();

    view.unmount();
    render(<StudyApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume saved session' }));
    expect(screen.getByRole('radio', { name: /I cannot determine an answer/ })).toBeChecked();
    expect(screen.getByLabelText('Confidence')).toHaveValue('4');
    expect(screen.getByLabelText('Perceived difficulty')).toHaveValue('2');
  });

  it('clears only draft state alongside explicit session deletion', () => {
    const session = sessionForGroup(0);
    const firstTrial = assignTrials(session.participantId).trials[0];
    saveSession(session);
    saveTrialDraft(emptyTrialDraft(session.sessionId, firstTrial.trialId, 'report-comparison-table'));

    expect(loadTrialDraft(session.sessionId, firstTrial.trialId)).not.toBeNull();
    clearSession();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(loadTrialDraft(session.sessionId, firstTrial.trialId)).toBeNull();
  });

  it('focuses and returns the viewport to the top for each new trial', async () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const session = sessionForGroup(0);
    saveSession(session);
    render(<StudyApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume saved session' }));

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
    });
    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
    scroll.mockRestore();
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
    expect(screen.getAllByRole('radio').every((radio) => !(radio as HTMLInputElement).checked)).toBe(
      true,
    );
    expect(screen.getByLabelText('Confidence')).toHaveValue('');
    expect(screen.getByLabelText('Perceived difficulty')).toHaveValue('');

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
      uiVersion: STUDY_UI_VERSION,
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
