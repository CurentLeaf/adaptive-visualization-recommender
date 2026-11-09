import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VegaChart } from '../components/charts/VegaChart';

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
});
