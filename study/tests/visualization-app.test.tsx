import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VisualizationParams } from '../src/visualizationContract';
import { VisualizationApp } from '../src/VisualizationApp';

const mocks = vi.hoisted(() => ({
  onParams: null as ((params: VisualizationParams | null) => void) | null,
  viewReady: vi.fn(),
  viewNotReady: vi.fn(),
  chartInstances: [] as Array<{ onReady?: () => void; onError?: () => void; title: string }>,
}));

vi.mock('../src/visualizationContract', () => ({
  createVisualizationHandshake: () => ({
    enabled: true,
    start: (callback: (params: VisualizationParams | null) => void) => { mocks.onParams = callback; },
    viewReady: mocks.viewReady,
    viewNotReady: mocks.viewNotReady,
    dispose: vi.fn(),
  }),
}));

vi.mock('../src/studyModel', () => ({
  containsTextMark: (spec: Record<string, unknown>) => spec.mark === 'text',
  getScenarioView: () => ({
    data: { sources: [], reports: [], locations: [], provenance: [], model_outputs: [] },
    reports: [], recommendations: [
      { id: 'chart-one', title: 'Chart one', technique: 'line', rationale: ['Rationale one'], doesNotEstablish: 'Caveat', vegaLiteSpec: { mark: 'line' } },
      { id: 'chart-two', title: 'Chart two', technique: 'line', rationale: ['Rationale two'], doesNotEstablish: 'Caveat', vegaLiteSpec: { mark: 'line' } },
    ],
    analysis: new Map(), salience: new Map(), modeling: {},
  }),
}));

vi.mock('../../src/components/charts/VegaChart', () => ({
  VegaChart: ({ onReady, onError, ariaLabel }: { onReady?: () => void; onError?: () => void; ariaLabel: string }) => {
    const chart = useRef({ onReady, onError, title: ariaLabel });
    chart.current = { onReady, onError, title: ariaLabel };
    useEffect(() => {
      mocks.chartInstances.push(chart.current);
    }, []);
    return <div>
      <button type="button" onClick={onReady}>Resolve {ariaLabel}</button>
      <button type="button" onClick={onError}>Fail {ariaLabel}</button>
    </div>;
  },
}));

vi.mock('../../src/components/charts/SituationEvidenceViews', () => ({
  FictionalGridPlot: () => <div />,
  ObservationTimeline: () => <div />,
  ReportComparisonTable: () => <div />,
}));
vi.mock('../../src/components/details/EvidencePanel', () => ({ EvidencePanel: () => <div /> }));

const firstTrial: VisualizationParams = {
  contractVersion: 1, trialId: 'conflict-A-recommended', scenarioFamily: 'conflict',
  taskVariant: 'A', condition: 'recommended', stimulusSeed: 271828,
};

function secondTrial(): VisualizationParams {
  return { ...firstTrial, trialId: 'quality-B-recommended', scenarioFamily: 'quality', taskVariant: 'B' };
}

function deliver(params: VisualizationParams | null) {
  act(() => mocks.onParams?.(params));
}

describe('VisualizationApp readiness lifecycle', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/visualization.html?id=widget&trialid=host-component&parentOrigin=https%3A%2F%2Fhost.example');
    mocks.onParams = null;
    mocks.chartInstances.length = 0;
    mocks.viewReady.mockClear();
    mocks.viewNotReady.mockClear();
  });
  afterEach(cleanup);

  it('ignores a stale prior-trial chart callback and mounts a new generation', async () => {
    render(<VisualizationApp />);
    await waitFor(() => expect(mocks.onParams).toBeTypeOf('function'));
    deliver(firstTrial);
    await waitFor(() => expect(mocks.chartInstances).toHaveLength(1));
    const oldChart = mocks.chartInstances[0];
    deliver(secondTrial());
    await waitFor(() => expect(mocks.chartInstances).toHaveLength(2));
    act(() => oldChart.onReady?.());
    expect(mocks.viewReady).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Resolve Task-aware recommended Chart one/ }));
    await waitFor(() => expect(mocks.viewReady).toHaveBeenCalledTimes(1));
  });

  it('remounts cached specs after recommendation changes and only accepts the current chart completion', async () => {
    render(<VisualizationApp />);
    await waitFor(() => expect(mocks.onParams).toBeTypeOf('function'));
    deliver(firstTrial);
    await waitFor(() => expect(mocks.chartInstances).toHaveLength(1));
    const initial = mocks.chartInstances[0];
    fireEvent.click(screen.getByRole('button', { name: /Resolve Task-aware recommended Chart one/ }));
    await waitFor(() => expect(mocks.viewReady).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Select visualization'), { target: { value: 'chart-two' } });
    await waitFor(() => expect(mocks.chartInstances).toHaveLength(2));
    expect(mocks.viewNotReady).toHaveBeenCalledTimes(1);
    act(() => initial.onReady?.());
    expect(mocks.viewReady).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Resolve Task-aware recommended Chart two/ }));
    await waitFor(() => expect(mocks.viewReady).toHaveBeenCalledTimes(2));
  });

  it('clears invalid-data errors on valid recovery and withholds ready on async chart failure', async () => {
    render(<VisualizationApp />);
    await waitFor(() => expect(mocks.onParams).toBeTypeOf('function'));
    deliver(null);
    expect(screen.getByRole('alert')).toHaveTextContent('invalid or mismatched');
    deliver(firstTrial);
    await waitFor(() => expect(mocks.chartInstances).toHaveLength(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Fail Task-aware recommended Chart one/ }));
    expect(mocks.viewNotReady).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be rendered');
    expect(mocks.viewReady).not.toHaveBeenCalled();
  });
});
