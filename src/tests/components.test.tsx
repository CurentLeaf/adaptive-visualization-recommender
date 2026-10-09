import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfilePanel } from '../components/dashboard/ProfilePanel';
import { EvidencePanel } from '../components/details/EvidencePanel';
import {
  FictionalGridPlot,
  ObservationTimeline,
  ReportComparisonTable,
} from '../components/charts/SituationEvidenceViews';
import { generateSyntheticDataset } from '../data/syntheticGenerator';
import { profileReports } from '../lib/profiler';
import { scoreSalience } from '../lib/salience';
import { DEFAULT_WEIGHTS } from '../domain/constants';
const data = generateSyntheticDataset();
describe('accessible evidence components', () => {
  afterEach(cleanup);
  it('renders a readable field table', () => {
    render(<ProfilePanel profile={profileReports(data.reports)} />);
    expect(screen.getByRole('heading', { name: 'Dataset profile' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Missing' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'report_time' })).toBeInTheDocument();
  });
  it('keeps distinct quality indicators visible', () => {
    const report = data.reports[0];
    render(
      <EvidencePanel
        report={report}
        source={data.sources[0]}
        provenance={data.provenance[0]}
        output={data.model_outputs[0]}
        salience={scoreSalience(report, DEFAULT_WEIGHTS)}
      />,
    );
    expect(screen.getByText(/Source confidence:/)).toBeInTheDocument();
    expect(screen.getByText(/Validation:/)).toBeInTheDocument();
    expect(screen.getByText(/Data provenance and processing trail/)).toBeInTheDocument();
    expect(screen.getByText('6. Visualization mapping')).toBeInTheDocument();
    expect(
      screen.getByText(/synthetic illustration, not a statistical interval/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/not truth/).length).toBeGreaterThan(0);
  });
  it('labels a missing reported value as unknown rather than zero', () => {
    const report = data.reports.find(
      (row) => row.reported_value === null && row.count_unit === 'people',
    )!;
    render(<EvidencePanel report={report} audience="Analyst" />);
    expect(screen.getByText(/Unknown people count; missing is not zero/)).toBeInTheDocument();
  });
  it('compares source reports and links the timeline and fictional grid to report selection', () => {
    const reports = data.reports.filter((report) => report.scenario_id === 'corroboration');
    const onSelect = vi.fn();
    render(
      <>
        <ReportComparisonTable
          reports={reports}
          sources={data.sources}
          selectedId={reports[0].report_id}
          onSelect={onSelect}
        />
        <ObservationTimeline
          reports={reports}
          sources={data.sources}
          selectedId={reports[0].report_id}
          onSelect={onSelect}
        />
        <FictionalGridPlot reports={reports} locations={data.locations} onSelect={onSelect} />
      </>,
    );
    expect(screen.getByText(/counts are not added/)).toBeInTheDocument();
    expect(screen.getAllByText('Observation Team Cedar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Imagery Review Desk').length).toBeGreaterThan(0);

    fireEvent.click(
      within(screen.getByRole('table')).getByRole('button', {
        name: new RegExp(`^Inspect ${reports[1].report_title}`),
      }),
    );
    expect(onSelect).toHaveBeenCalledWith(reports[1].report_id);

    fireEvent.click(
      within(
        screen.getByRole('img', {
          name: 'Timeline showing separate observation and receipt times for each report',
        }),
      ).getByRole('button', {
        name: new RegExp(`^${reports[0].report_title}; observed`),
      }),
    );
    expect(onSelect).toHaveBeenCalledWith(reports[0].report_id);

    fireEvent.click(screen.getByRole('button', { name: /Cedar Junction, inspect related reports/ }));
    expect(onSelect).toHaveBeenCalledWith(reports[0].report_id);
  });
});
