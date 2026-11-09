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
        addEventListener: vi.fn((type) => order.push(type)),
        removeEventListener: vi.fn(),
      },
      finalize: vi.fn(),
    });
    const onReady = vi.fn(() => order.push('ready'));

    render(<VegaChart spec={{}} onBrush={() => {}} onReady={onReady} />);

    await waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    expect(order).toEqual(['click', 'pointerdown', 'ready']);
  });

  it('reports listener-registration failures without signaling ready', async () => {
    const error = new Error('click listener failed');
    mocks.embed.mockResolvedValue({
      view: {
        getState: vi.fn(() => ({ signals: {} })),
        addEventListener: vi.fn((type) => {
          if (type === 'click') throw error;
        }),
        removeEventListener: vi.fn(),
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
    const addEventListener = vi.fn();
    const onReady = vi.fn();
    const onError = vi.fn();
    mocks.embed.mockResolvedValue({
      view: {
        getState: vi.fn(() => ({ signals: {} })),
        addEventListener,
        removeEventListener: vi.fn(),
      },
      finalize: vi.fn(),
    });

    render(<VegaChart spec={{}} onBrush={() => {}} onReady={onReady} onError={onError} />);

    await waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    expect(addEventListener).toHaveBeenCalledOnce();
    expect(addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports a failure registering the pointer-drag listener', async () => {
    const error = new Error('pointer listener failed');
    const onReady = vi.fn();
    const onError = vi.fn();
    mocks.embed.mockResolvedValue({
      view: {
        getState: vi.fn(() => ({ signals: { timeBrush: null } })),
        addEventListener: vi.fn((type) => {
          if (type === 'pointerdown') throw error;
        }),
        removeEventListener: vi.fn(),
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
    const param = (spec.layer as Array<{ params: Array<{ select: Record<string, unknown> }> }>).at(-1)!.params[0];
    expect(param.select).toMatchObject({
      on: '[pointerdown[event.isPrimary && event.button === 0], window:pointerup[event.isPrimary]] > window:pointermove![event.isPrimary]',
      clear: 'dblclick, window:pointercancel[event.isPrimary]',
      translate: false,
      zoom: false,
    });
    const compiled = compile(spec as never).spec;
    expect(compiled.signals?.some((signal) => signal.name === 'timeBrush_utcyearmonthdatehours_observed_at')).toBe(true);
    const runtimeView = new View(parseVega(compiled), { renderer: 'none' }).initialize();
    await runtimeView.runAsync();
    runtimeView.signal('timeBrush_x', [10, 100]);
    await runtimeView.runAsync();
    runtimeView.signal('timeBrush_x', [10, 200]);
    await runtimeView.runAsync();
    const selection = runtimeView.signal('timeBrush') as Record<string, [number, number]>;
    expect(selection.utcyearmonthdatehours_observed_at[0]).toBeGreaterThan(Date.parse('2024-06-01'));
    expect(selection.utcyearmonthdatehours_observed_at[1]).toBeLessThan(Date.parse('2024-06-04'));

    const order: string[] = [];
    let pointerDown: ((event: PointerEvent) => void) | undefined;
    const chartView = {
      getState: runtimeView.getState.bind(runtimeView),
      addEventListener: vi.fn((type, listener) => {
        if (type === 'pointerdown') pointerDown = listener;
      }),
      removeEventListener: vi.fn(),
      runAsync: vi.fn(async () => {
        order.push('runAsync');
        await runtimeView.runAsync();
      }),
      signal: vi.fn((name: string) => {
        order.push(`signal:${name}`);
        return runtimeView.signal(name);
      }),
    };
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');
    mocks.embed.mockResolvedValue({ view: chartView, finalize: vi.fn() });
    const makePointerEvent = (type: string, pointerId: number, pointerType = 'touch') => {
      const event = new Event(type);
      Object.defineProperties(event, {
        pointerId: { value: pointerId },
        pointerType: { value: pointerType },
        isPrimary: { value: true },
        button: { value: 0 },
      });
      return event as PointerEvent;
    };
    const onBrush = vi.fn();

    render(<VegaChart spec={spec} onBrush={onBrush} />);

    await waitFor(() => expect(pointerDown).toBeTypeOf('function'));
    pointerDown!(makePointerEvent('pointerdown', 13, 'pen'));
    window.dispatchEvent(makePointerEvent('pointerup', 13, 'pen'));
    await waitFor(() => expect(chartView.runAsync).toHaveBeenCalledOnce());
    await waitFor(() => expect(onBrush).toHaveBeenCalledOnce());
    expect(onBrush.mock.calls[0][0]).toBe('2024-06-01');
    expect(onBrush.mock.calls[0][1]).toBe('2024-06-03');
    expect(order.slice(-2)).toEqual(['runAsync', 'signal:timeBrush']);
    cleanup();
    expect(chartView.removeEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith('pointercancel', expect.any(Function));
    removeWindowListener.mockRestore();
    runtimeView.finalize();
  });

  it('ignores unrelated, non-primary, and cancelled pointerups while supporting touch and pen', async () => {
    const order: string[] = [];
    const range = {
      utcyearmonthdatehours_observed_at: [
        Date.parse('2024-06-01T09:00:00Z'),
        Date.parse('2024-06-03T12:00:00Z'),
      ],
    };
    let pointerDown: ((event: PointerEvent) => void) | undefined;
    const view = {
      getState: vi.fn(() => ({ signals: { timeBrush: null } })),
      addEventListener: vi.fn((type, listener) => {
        if (type === 'pointerdown') pointerDown = listener;
      }),
      removeEventListener: vi.fn(),
      runAsync: vi.fn(async () => { order.push('runAsync'); }),
      signal: vi.fn(() => { order.push('signal:timeBrush'); return range; }),
    };
    mocks.embed.mockResolvedValue({ view, finalize: vi.fn() });
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');
    const dispatchWindowEvent = vi.spyOn(window, 'dispatchEvent');
    const makePointerEvent = (
      type: string,
      pointerId: number,
      pointerType = 'touch',
      isPrimary = true,
      button = 0,
    ) => {
      const event = new Event(type);
      Object.defineProperties(event, {
        pointerId: { value: pointerId },
        pointerType: { value: pointerType },
        isPrimary: { value: isPrimary },
        button: { value: button },
      });
      return event as PointerEvent;
    };
    const onBrush = vi.fn();

    render(<VegaChart spec={{}} onBrush={onBrush} />);
    await waitFor(() => expect(pointerDown).toBeTypeOf('function'));
    window.dispatchEvent(new Event('mouseup'));
    window.dispatchEvent(makePointerEvent('pointerup', 1));
    pointerDown!(makePointerEvent('pointerdown', 2, 'touch', false));
    window.dispatchEvent(makePointerEvent('pointerup', 2));
    pointerDown!(makePointerEvent('pointerdown', 3, 'mouse', true, 2));
    window.dispatchEvent(makePointerEvent('pointerup', 3, 'mouse'));
    pointerDown!(makePointerEvent('pointerdown', 4, 'touch'));
    window.dispatchEvent(makePointerEvent('pointercancel', 4));
    expect(dispatchWindowEvent.mock.calls.some(([event]) =>
      event.type === 'pointerup' && (event as PointerEvent).pointerId === 4,
    )).toBe(true);
    window.dispatchEvent(makePointerEvent('pointerup', 4));
    expect(view.runAsync).not.toHaveBeenCalled();
    expect(onBrush).not.toHaveBeenCalled();

    pointerDown!(makePointerEvent('pointerdown', 5, 'touch'));
    window.dispatchEvent(makePointerEvent('pointerup', 6, 'touch'));
    expect(view.runAsync).not.toHaveBeenCalled();
    window.dispatchEvent(makePointerEvent('pointerup', 5, 'touch'));
    await waitFor(() => expect(onBrush).toHaveBeenCalledOnce());
    expect(order).toEqual(['runAsync', 'signal:timeBrush']);

    pointerDown!(makePointerEvent('pointerdown', 7, 'pen'));
    window.dispatchEvent(makePointerEvent('pointerup', 7, 'pen'));
    await waitFor(() => expect(onBrush).toHaveBeenCalledTimes(2));
    expect(order).toEqual([
      'runAsync', 'signal:timeBrush',
      'runAsync', 'signal:timeBrush',
    ]);

    cleanup();
    expect(view.removeEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith('pointercancel', expect.any(Function));
    dispatchWindowEvent.mockRestore();
    removeWindowListener.mockRestore();
  });
});
