import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse as parseVega, View } from 'vega';
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
        removeSignalListener: vi.fn(),
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

  it('preserves calendar dates and commits a real compiled brush selection on mouseup', async () => {
    const spec = createVegaSpec('line', [
      { report_id: 'one', observed_at: '2024-06-01T09:30:00Z' },
      { report_id: 'two', observed_at: '2024-06-03T12:45:00Z' },
    ] as never[]);
    const compiled = compile(spec as never).spec;
    expect(compiled.signals?.some((signal) => signal.name === 'timeBrush_utcyearmonthdatehours_observed_at')).toBe(true);
    const view = new View(parseVega(compiled), { renderer: 'none' }).initialize();
    await view.runAsync();
    const removeSignalListener = vi.spyOn(view, 'removeSignalListener');
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');
    mocks.embed.mockResolvedValue({ view, finalize: vi.fn() });
    const onBrush = vi.fn();

    render(<VegaChart spec={spec} onBrush={onBrush} />);

    await waitFor(() => expect(view.getState({ signals: (name) => name === 'timeBrush' }).signals).toHaveProperty('timeBrush'));
    view.signal('timeBrush_x', [10, 100]);
    await view.runAsync();
    expect(onBrush).not.toHaveBeenCalled();
    view.signal('timeBrush_x', [10, 200]);
    await view.runAsync();

    const selection = view.signal('timeBrush') as Record<string, [number, number]>;
    expect(selection.utcyearmonthdatehours_observed_at[0]).toBeGreaterThan(Date.parse('2024-06-01'));
    expect(selection.utcyearmonthdatehours_observed_at[1]).toBeLessThan(Date.parse('2024-06-04'));
    expect(onBrush).not.toHaveBeenCalled();

    window.dispatchEvent(new MouseEvent('mouseup'));
    await waitFor(() => expect(onBrush).toHaveBeenCalledOnce());
    expect(onBrush.mock.calls[0][0]).toBe('2024-06-01');
    expect(onBrush.mock.calls[0][1]).toBe('2024-06-03');
    cleanup();
    expect(removeSignalListener).toHaveBeenCalledWith('timeBrush', expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
    removeSignalListener.mockRestore();
    removeWindowListener.mockRestore();
  });
});
