import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dataset } from '../data/seedData';
import { answerOptions } from '../lib/evaluation';
import App from '../app/App';

vi.mock('../components/charts/VegaChart', () => ({
  VegaChart: ({ onSelect }: { onSelect?: (id: string) => void }) => (
    <button type="button" onClick={() => onSelect?.('REP-CORROBORATION-001')}>
      Mock chart selection
    </button>
  ),
}));

describe('audience presentation state', () => {
  afterEach(cleanup);
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps the Commander overview compact while preserving visible uncertainty', () => {
    render(<App />);
    expect(screen.getByLabelText(/Audience/)).toHaveValue('Commander');
    expect(
      screen.getAllByText(/High salience means attention priority, not verified truth/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Model selection').closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('Advanced controls').closest('details')).not.toHaveAttribute('open');
    expect(
      screen.getByText('Level 4 · Local evaluation tools').closest('details'),
    ).not.toHaveAttribute('open');
  });

  it('presents the three workflow modules and records contextual recommendation feedback locally', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Task & Context' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Data & Filters' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Recommendations & Rationale' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('MDMP task preset')).toHaveValue('compare_reports');
    expect(
      screen.getByRole('option', { name: /Compare COAs.*unavailable in this dataset/ }),
    ).toBeDisabled();
    expect(screen.getByText(/no COA identifiers, outcome measures/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Useful' })[0]);
    expect(screen.getByRole('status')).toHaveTextContent('Feedback saved locally: useful');
    const saved = JSON.parse(localStorage.getItem('avr-recommendation-feedback-v1') ?? '[]');
    expect(saved[0]).toMatchObject({
      analyticTask: 'compare_categories',
      audienceMode: 'Commander',
      context: {
        mdmpPhase: 'mission_analysis',
        echelon: 'battalion',
        timeHorizon: '24_hours',
        variableClass: 'enemy',
      },
      decision: 'useful',
      dataCharacteristics: {
        uncertaintyFields: expect.arrayContaining(['source_confidence', 'validation_score']),
        rowCount: 4,
        fieldCount: expect.any(Number),
      },
    });
  });

  it('persists mission context between app visits in this browser', () => {
    const { unmount } = render(<App />);
    fireEvent.change(screen.getByLabelText('Echelon'), { target: { value: 'brigade' } });
    expect(JSON.parse(localStorage.getItem('avr-mission-context-v1') ?? '{}').echelon).toBe(
      'brigade',
    );
    unmount();

    render(<App />);
    expect(screen.getByLabelText('Echelon')).toHaveValue('brigade');
  });

  it('preserves filters, selected report, task, weights, and evaluation progress when switching modes', async () => {
    const { container, unmount } = render(<App />);
    const report = dataset.reports.find((row) => row.report_id === 'REP-CORROBORATION-001')!;
    const region = screen.getByLabelText('Fictional location');
    fireEvent.change(region, { target: { value: report.region } });
    fireEvent.change(screen.getByLabelText('Observed from'), {
      target: { value: report.report_time.slice(0, 10) },
    });
    fireEvent.change(screen.getByLabelText('Analytic task'), {
      target: { value: 'assess_confidence' },
    });
    const weight = screen.getByLabelText(/relevance ·/);
    fireEvent.change(weight, { target: { value: '2.5' } });

    fireEvent.click(screen.getAllByRole('button', { name: 'Mock chart selection' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Inspect evidence' })[0]);
    expect((await screen.findAllByText(report.report_id)).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'View alternatives' }));
    const availableCharts = screen
      .getAllByRole('button', { name: 'Use this visualization' })
      .filter((button) => !(button as HTMLButtonElement).disabled);
    expect(availableCharts.length).toBeGreaterThan(0);
    fireEvent.click(availableCharts[0]);
    const activeChartTitle = container.querySelector('.chart-panel h2')?.textContent;
    expect(activeChartTitle).toBeTruthy();
    const activeVisualizationNotice = () =>
      Array.from(container.querySelectorAll('p')).find((paragraph) =>
        paragraph.textContent?.startsWith('Active visualization:'),
      )?.textContent;
    expect(activeVisualizationNotice()).toContain(activeChartTitle);

    fireEvent.click(screen.getByText('Level 4 · Local evaluation tools'));
    fireEvent.change(screen.getByLabelText('Response'), {
      target: { value: answerOptions('corroboration')[0] },
    });
    fireEvent.change(screen.getByLabelText(/Qualified research interpretation/), {
      target: { value: 'Interpretation remains qualified.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }));
    expect(await screen.findByText(/1 completed/)).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem('avr-evaluations-v2') ?? '[]')[0].missionContext,
    ).toEqual(
      expect.objectContaining({
        mdmpPhase: 'mission_analysis',
        echelon: 'battalion',
      }),
    );

    fireEvent.change(screen.getByLabelText(/Audience/), { target: { value: 'Analyst' } });
    expect(screen.getByLabelText('Fictional location')).toHaveValue(report.region);
    expect(screen.getByLabelText('Observed from')).toHaveValue(report.report_time.slice(0, 10));
    expect(screen.getByLabelText('Analytic task')).toHaveValue('assess_confidence');
    expect(screen.getByLabelText(/relevance ·/)).toHaveValue('2.5');
    expect(screen.getAllByText(report.report_id).length).toBeGreaterThan(0);
    expect(activeVisualizationNotice()).toContain(activeChartTitle);
    expect(screen.getByText(/1 completed/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('avr-evaluations-v2') ?? '[]')[0].researchNote).toBe(
      'Interpretation remains qualified.',
    );
    expect(screen.getByText(/Data provenance and processing trail/)).toBeInTheDocument();

    const nextMatchingReport = dataset.reports.find(
      (candidate) =>
        candidate.scenario_id === 'corroboration' &&
        candidate.report_id !== report.report_id &&
        candidate.region === report.region &&
        candidate.report_time.slice(0, 10) >= report.report_time.slice(0, 10),
    )!;
    const parallelPlot = screen.getByRole('group', {
      name: 'Parallel coordinates of report evidence profiles',
    });
    fireEvent.click(
      within(parallelPlot).getByRole('button', {
        name: new RegExp(`^${nextMatchingReport.report_title}`),
      }),
    );
    expect(
      within(screen.getByRole('complementary', { name: 'Evidence inspector' })).getAllByText(
        nextMatchingReport.report_id,
      ).length,
    ).toBeGreaterThan(0);
    expect(localStorage.getItem('avr-audience-v1')).toBe('Analyst');

    unmount();
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText(/Audience/)).toHaveValue('Analyst'));
  });
});
