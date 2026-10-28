import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'vega-lite';
import { logger } from 'vega';
import type { TopLevelSpec } from 'vega-lite';
import { useEffect } from 'react';
import StudyApp from '../study/StudyApp';
import { frequencyRows, parseCondition, STUDY_SCENARIOS } from '../study/model';
import { studySpec } from '../study/specs';
import type { ScenarioId } from '../domain/types';

vi.mock('../components/charts/VegaChart', () => ({
  VegaChart: ({ onReady }: { onReady: () => void }) => {
    useEffect(() => {
      onReady();
    }, [onReady]);
    return <div role="img" aria-label="Assigned visualization" />;
  },
}));
afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
  localStorage.clear();
});

describe('assigned participant trial', () => {
  it('guides the participant, requires a response and confidence, then completes without correctness feedback', () => {
    render(<StudyApp />);
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start trial' }));
    const submit = screen.getByRole('button', { name: 'Submit response' });
    expect(submit).toBeDisabled();
    expect(screen.queryByText('Recommendations & Rationale')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('radio')[0]);
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Confidence 4 of 5'));
    fireEvent.click(submit);
    expect(
      screen.getByRole('heading', { name: 'Thank you. Your response is complete.' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/correct answer|accuracy|expected answer/i)).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });

  it('locks the assigned condition during a trial and renders the actual table condition', () => {
    window.history.replaceState({}, '', '/?scenario=uncertain&technique=table');
    render(<StudyApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Start trial' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Field Report Liaison', { selector: 'th' })).toBeInTheDocument();
    expect(screen.getByLabelText('Assigned technique')).toBeDisabled();
    expect(screen.getByLabelText('Scenario')).toBeDisabled();
    expect(screen.queryByRole('img', { name: 'Assigned visualization' })).not.toBeInTheDocument();
  });

  it('blocks incompatible conditions instead of substituting an unrelated chart', () => {
    window.history.replaceState({}, '', '/?scenario=quality&technique=line');
    render(<StudyApp />);
    expect(
      screen.getByRole('heading', { name: 'This preview condition is unavailable.' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start trial' })).not.toBeInTheDocument();
    expect(parseCondition({ scenario: '__proto__', technique: 'dot' })).toBeNull();
  });
});

describe('study stimuli', () => {
  it('retains empty observation hours and counts distinct sources rather than inventory', () => {
    expect(frequencyRows()).toEqual([
      { hour: '07:00', reports: 2, sources: 1 },
      { hour: '08:00', reports: 0, sources: 0 },
      { hour: '09:00', reports: 3, sources: 3 },
      { hour: '10:00', reports: 3, sources: 3 },
    ]);
  });

  it('compiles every supported Vega-Lite condition without warnings', () => {
    for (const [id, config] of Object.entries(STUDY_SCENARIOS)) {
      for (const technique of config.techniques.filter((technique) => technique !== 'table')) {
        const warnings: string[] = [];
        const chartLogger = logger();
        chartLogger.warn = (...values: unknown[]) => {
          warnings.push(values.join(' '));
          return chartLogger;
        };
        compile(studySpec(id as ScenarioId, technique) as unknown as TopLevelSpec, {
          logger: chartLogger,
        });
        expect(warnings, `${id}/${technique}`).toEqual([]);
      }
    }
  });
});
