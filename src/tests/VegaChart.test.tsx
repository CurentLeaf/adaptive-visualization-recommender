import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'vega-lite';
import { VegaChart } from '../components/charts/VegaChart';
import { createVegaSpec } from '../lib/vegaSpecFactory';

const mocks = vi.hoisted(() => ({ embed: vi.fn() }));
vi.mock('vega-embed', () => ({ default: mocks.embed }));

afterEach(() => {
  cleanup();
  mocks.embed.mockReset();
});

describe('VegaChart readiness', () => {
  it('signals ready only after click and brush listeners are registered', async () => {
    const order: string[] = [];
    mocks.embed.mockResolvedValue({
      view: {
        getState: vi.fn(() => ({ signals: { timeBrush: null } })),
        addEventListener: vi.fn(() => order.push('click')),
        addSignalListener: vi.fn(() => order.push('brush')),
      },
      finalize: vi.fn(),
    });
    const onReady = vi.fn(() => order.push('ready'));

    render(<VegaChart spec={{}} onBrush={() => {}} onReady={onReady} />);

    await waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    expect(order).toEqual(['click', 'brush', 'ready']);
  });

  it('reports listener-registration failures without signaling ready', async () => {
    const error = new Error('click listener failed');
    mocks.embed.mockResolvedValue({
      view: {
        getState: vi.fn(() => ({ signals: {} })),
        addEventListener: vi.fn(() => {
          throw error;
        }),
        addSignalListener: vi.fn(),
      },
      finalize: vi.fn(),
    });
    const onReady = vi.fn();
    const onError = vi.fn();

    render(<VegaChart spec={{}} onReady={onReady} onError={onError} />);

    await waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(onReady).not.toHaveBeenCalled();
  });

  it('treats an absent brush signal as optional even when onBrush is provided', async () => {
    const addSignalListener = vi.fn();
    const onReady = vi.fn();
    const onError = vi.fn();
    mocks.embed.mockResolvedValue({
      view: {
        getState: vi.fn(() => ({ signals: {} })),
        addEventListener: vi.fn(),
        addSignalListener,
      },
      finalize: vi.fn(),
    });

    render(<VegaChart spec={{}} onBrush={() => {}} onReady={onReady} onError={onError} />);

    await waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    expect(addSignalListener).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports a failure registering an existing brush signal', async () => {
    const error = new Error('brush listener failed');
    const onReady = vi.fn();
    const onError = vi.fn();
    mocks.embed.mockResolvedValue({
      view: {
        getState: vi.fn(() => ({ signals: { timeBrush: null } })),
        addEventListener: vi.fn(),
        addSignalListener: vi.fn(() => {
          throw error;
        }),
      },
      finalize: vi.fn(),
    });

    render(<VegaChart spec={{}} onBrush={() => {}} onReady={onReady} onError={onError} />);

    await waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(onReady).not.toHaveBeenCalled();
  });

  it('forwards the compiled temporal selection range to onBrush', async () => {
    const spec = createVegaSpec('line', []);
    const compiled = compile(spec as never).spec;
    const fieldSignal = compiled.signals?.find((signal) => signal.name === 'timeBrush_hours_observed_at');
    expect(fieldSignal).toBeDefined();
    const field = fieldSignal!.name.slice('timeBrush_'.length);
    let brushListener: ((_name: string, value: unknown) => void) | undefined;
    mocks.embed.mockResolvedValue({
      view: {
        getState: vi.fn(() => ({ signals: { timeBrush: null } })),
        addEventListener: vi.fn(),
        addSignalListener: vi.fn((_name, listener) => {
          brushListener = listener;
        }),
      },
      finalize: vi.fn(),
    });
    const onBrush = vi.fn();

    render(<VegaChart spec={spec} onBrush={onBrush} />);

    await waitFor(() => expect(brushListener).toBeTypeOf('function'));
    brushListener!('timeBrush', {
      [field]: [Date.parse('2024-01-01T00:00:00Z'), Date.parse('2024-01-02T00:00:00Z')],
    });

    expect(onBrush).toHaveBeenCalledWith('2024-01-01', '2024-01-02');
  });
});
