import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dataset } from '../data/seedData';
import { DEFAULT_WEIGHTS } from '../domain/constants';
import { DEFAULT_MISSION_CONTEXT } from '../domain/mdmp';
import type { AnalyticTask, AudienceMode, Report } from '../domain/types';
import { profileReports } from '../lib/profiler';
import { recommendModels } from '../lib/modelSelection';
import { recommend, type RecommendationDatum } from '../lib/recommendationEngine';
import { recommendVisualizations } from '../lib/visualizationRecommendations';
import { buildDecisionPath, compareFactors, formatSigned } from '../lib/explanations';
import { buildEvidenceQualityRows } from '../lib/evidenceQuality';
import { EMPTY_SUBSET, applySubset, runWhatIf } from '../lib/whatIf';
import { DecisionPathView, FactorComparisonView } from '../components/dashboard/ExplanationPanels';
import { EvidenceQualityMatrix } from '../components/details/EvidenceQualityMatrix';
import { WhatIfPanel } from '../components/dashboard/WhatIfPanel';
import App from '../app/App';

vi.mock('../components/charts/VegaChart', () => ({
  VegaChart: () => <div>Mock chart</div>,
}));

const toDatum = (report: Report): RecommendationDatum => ({
  ...report,
  day: report.observed_at.slice(0, 10),
  source_type: 'sensor',
  source_display_name: 'Source',
  uncertainty_lower: null,
  uncertainty_upper: null,
  salience: 0.5,
});
const reports = dataset.reports.filter((report) => report.scenario_id === 'corroboration');
const profile = profileReports(reports);
const data = reports.map(toDatum);
const request = (
  task: AnalyticTask = 'compare_categories',
  audience: AudienceMode = 'Commander',
) => ({
  profile,
  task,
  modeling: recommendModels(profile, task)[0],
  weights: DEFAULT_WEIGHTS,
  data,
  audience,
  context: DEFAULT_MISSION_CONTEXT,
});

describe('signed factor formatting and comparison', () => {
  it('formats signed values with an explicit sign and a true minus', () => {
    expect(formatSigned(8)).toBe('+8');
    expect(formatSigned(-10)).toBe('\u221210');
    expect(formatSigned(0)).toBe('0');
  });

  it('reports the engine scoreBreakdown values and the factors that differ', () => {
    const ranked = recommend(request('compare_categories', 'Commander')).ranked;
    expect(ranked.length).toBeGreaterThan(1);
    const comparison = compareFactors(ranked, 3);
    comparison.rows.forEach((row) =>
      row.values.forEach((value, index) =>
        expect(value).toBe(ranked[index].scoreBreakdown[row.factor]),
      ),
    );
    const total = comparison.winnerVsRunnerUp.reduce((sum, row) => sum + row.deltaVsRunnerUp!, 0);
    expect(total).toBe(comparison.scoreDifference);
    expect(comparison.winnerVsRunnerUp.every((row) => row.deltaVsRunnerUp !== 0)).toBe(true);
    expect(comparison.sharedFactors.every((row) => row.deltaVsRunnerUp === 0)).toBe(true);
  });

  it('renders signed values, penalty labels, and the not-a-probability caveat', () => {
    const ranked = recommend(request('examine_source_conflict', 'Commander')).ranked;
    const penalized = ranked.find((chart) => chart.scoreBreakdown.audienceComplexity < 0);
    expect(penalized).toBeDefined();
    render(<FactorComparisonView recommendations={ranked} />);
    expect(
      screen.getByText(/not a probability, not truth, and not report confidence/),
    ).toBeVisible();
    expect(screen.getAllByText('\u221210').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\(penalty\)/).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: /Why #1 ranks/ })).toBeInTheDocument();
    cleanup();
  });
});

describe('decision path derived from engine behavior', () => {
  it('lists exactly the ranked charts as eligible and gives typed exclusion reasons', () => {
    const result = recommend(request('compare_categories'));
    const eligible = result.candidates.filter((c) => c.eligible).map((c) => c.chartPattern);
    expect(result.ranked.map((chart) => chart.chartPattern).sort()).toEqual([...eligible].sort());
    expect(
      result.candidates.some((c) => c.reasons.some((r) => r.kind === 'curated_candidate_set')),
    ).toBe(true);
  });

  it('distinguishes mixed units from missing required fields', () => {
    const mixed = recommend({
      ...request('compare_categories'),
      data: [...data, { ...data[0], report_id: 'x', count_unit: 'people' }],
    });
    const dot = mixed.candidates.find((c) => c.chartPattern === 'dot_plot')!;
    expect(dot.eligible).toBe(false);
    expect(dot.reasons.map((r) => r.kind)).toContain('mixed_units');
    expect(mixed.excluded.some((e) => e.reason.includes('mixed units'))).toBe(true);

    const noCount = recommend({
      ...request('compare_categories'),
      profile: { ...profile, fields: profile.fields.filter((f) => f.name !== 'reported_count') },
    });
    const kinds = noCount.candidates
      .find((c) => c.chartPattern === 'dot_plot')!
      .reasons.map((r) => r.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['missing_required_fields', 'task_field_requirement']),
    );
    expect(noCount.ranked).toHaveLength(0);
  });

  it('builds six ordered steps and renders them as inspectable disclosures', () => {
    const result = recommend(request('compare_categories'));
    const steps = buildDecisionPath({
      task: 'compare_categories',
      audience: 'Commander',
      context: DEFAULT_MISSION_CONTEXT,
      profile,
      reportCount: data.length,
      result,
    });
    expect(steps.map((s) => s.id)).toEqual([
      'task_audience',
      'fields_reports',
      'compatibility',
      'eligibility',
      'scoring',
      'ranking',
    ]);
    expect(steps[0].details.join(' ')).toContain('does not change scores');
    render(<DecisionPathView steps={steps} />);
    expect(screen.getByText(/not hidden AI reasoning/)).toBeInTheDocument();
    expect(screen.getAllByRole('group').length).toBe(6);
    cleanup();
  });
});

describe('evidence-quality matrix', () => {
  const unknownCount = dataset.reports.find((r) => r.reported_count === null)!;
  it('shows unknown, not-recorded and not-applicable values without substituting zero', () => {
    const [row] = buildEvidenceQualityRows(
      [unknownCount],
      dataset.provenance,
      dataset.exerciseAsOfTime,
    );
    expect(row.cells.count.state).toBe('unknown');
    expect(row.cells.count.text).toContain('not zero');
    const original = buildEvidenceQualityRows(
      [{ ...unknownCount, translation_status: 'original', human_verified: false }],
      [],
      undefined,
    )[0];
    expect(original.cells.translation.state).toBe('not_applicable');
    expect(original.cells.humanReview.state).toBe('not_recorded');
    expect(original.cells.observationAge.state).toBe('unknown');
    expect(original.provenanceNote).toBe('No provenance record');
  });

  it('highlights the selected row and links selection to the provenance trail', () => {
    const onSelect = vi.fn();
    const sample = reports.slice(0, 3);
    render(
      <EvidenceQualityMatrix
        reports={sample}
        provenance={dataset.provenance}
        exerciseAsOfTime={dataset.exerciseAsOfTime}
        selectedId={sample[1].report_id}
        onSelect={onSelect}
      />,
    );
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.getByRole('button', { name: new RegExp(sample[1].report_id) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: new RegExp(sample[0].report_id) }));
    expect(onSelect).toHaveBeenCalledWith(sample[0].report_id);
    expect(screen.getAllByText(/recorded stage\(s\)/).length).toBe(3);
    cleanup();
  });
});

describe('what-if recomputation and isolation', () => {
  const base = {
    profile,
    data,
    weights: DEFAULT_WEIGHTS,
    missionContext: DEFAULT_MISSION_CONTEXT,
    current: { task: 'compare_categories' as const, audience: 'Commander' as const },
  };

  it('reports unchanged rankings when nothing is hypothetically changed', () => {
    const result = runWhatIf({ ...base, hypothetical: { ...base.current, subset: EMPTY_SUBSET } });
    expect(result.sensitivity).toBe('none');
    expect(result.rankingUnchanged).toBe(true);
    expect(result.factorChanges).toEqual([]);
  });

  it('runs the real recommender for a changed audience and labels it context sensitivity', () => {
    const before = JSON.stringify(data);
    const result = runWhatIf({
      ...base,
      hypothetical: { task: 'compare_categories', audience: 'Analyst', subset: EMPTY_SUBSET },
    });
    expect(result.sensitivity).toBe('context');
    expect(result.hypothetical.ranked).toEqual(
      recommendVisualizations(
        profile,
        'compare_categories',
        recommendModels(profile, 'compare_categories')[0],
        DEFAULT_WEIGHTS,
        data,
        'Analyst',
      ),
    );
    expect(JSON.stringify(data)).toBe(before);
    expect(result.attribution).toBeNull();
  });

  it('filters by recorded source_independent metadata and labels evidence-subset sensitivity', () => {
    const marked = data.map((row, index) => ({ ...row, source_independent: index === 0 }));
    const subset = { ...EMPTY_SUBSET, independentOnly: true };
    expect(applySubset(marked, subset)).toHaveLength(1);
    const result = runWhatIf({
      ...base,
      data: marked,
      hypothetical: { ...base.current, subset },
    });
    expect(result.sensitivity).toBe('evidence_subset');
    expect(result.hypotheticalReportCount).toBe(1);
    expect(result.currentReportCount).toBe(marked.length);
  });

  it('separates context and subset effects when both change', () => {
    const result = runWhatIf({
      ...base,
      hypothetical: {
        task: 'assess_confidence',
        audience: 'Analyst',
        subset: { ...EMPTY_SUBSET, excludeReportIds: [data[0].report_id] },
      },
    });
    expect(result.sensitivity).toBe('both');
    expect(result.attribution?.contextOnly.ranked.length).toBeGreaterThan(0);
  });

  it('panel states that the active analysis is not changed and names the sensitivity kind', () => {
    const hypothetical = {
      task: 'compare_categories' as const,
      audience: 'Analyst' as const,
      subset: EMPTY_SUBSET,
    };
    const result = runWhatIf({ ...base, hypothetical });
    render(
      <WhatIfPanel state={hypothetical} result={result} onChange={() => {}} onReset={() => {}} />,
    );
    expect(screen.getByText(/Context sensitivity/)).toBeInTheDocument();
    expect(
      screen.getByText(/active analysis, selected visualization, filters/i),
    ).toBeInTheDocument();
    cleanup();
  });
});

describe('App integration', () => {
  afterEach(cleanup);
  beforeEach(() => localStorage.clear());

  it('links an evidence-matrix row to the evidence inspector and selected state', () => {
    render(<App />);
    const matrix = screen
      .getByRole('heading', { name: 'Evidence-quality matrix' })
      .closest('section')!;
    const button = within(matrix).getAllByRole('button')[0];
    fireEvent.click(button);
    const inspector = screen.getByRole('complementary', { name: 'Evidence inspector' });
    expect(within(inspector).getAllByText(button.textContent!).length).toBeGreaterThan(0);
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the active task and audience unchanged when hypothetical inputs change', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Hypothetical audience'), {
      target: { value: 'Analyst' },
    });
    fireEvent.change(screen.getByLabelText('Hypothetical task'), {
      target: { value: 'assess_confidence' },
    });
    expect(screen.getByLabelText(/^Audience/)).toHaveValue('Commander');
    expect(screen.getByLabelText('Analytic task')).toHaveValue('compare_categories');
    expect(
      screen.getByText(/Both context and evidence subset|Context sensitivity/),
    ).toBeInTheDocument();
  });
});
