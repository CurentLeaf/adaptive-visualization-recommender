import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VegaChart } from '../components/charts/VegaChart';

const { embed } = vi.hoisted(() => ({ embed: vi.fn() }));
vi.mock('vega-embed', () => ({ default: embed }));

afterEach(() => vi.clearAllMocks());

describe('Vega chart lifecycle', () => {
  it('uses current selection and hover callbacks without restarting the chart', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const ready = vi.fn();
    const firstHover = vi.fn();
    const secondHover = vi.fn();
    let hover: (event: unknown, item?: { datum?: unknown }) => void = () => {};
    let select: (event: unknown, item: { datum: { report_id: string } }) => void = () => {};
    const finalize = vi.fn();
    embed.mockImplementation(async (mount: HTMLElement) => {
      mount.textContent = 'Chart';
      mount.onclick = () => select(null, { datum: { report_id: 'report-1' } });
      mount.onmouseover = () => hover(null, { datum: { report_id: 'report-1' } });
      return {
        finalize,
        view: {
          addEventListener: (name: string, handler: typeof hover) => {
            if (name === 'click') select = handler;
            if (name === 'mouseover') hover = handler;
          },
        },
      };
    });
    const spec = { mark: 'point' };
    const rendered = render(
      <VegaChart spec={spec} onSelect={first} onHoverDatum={firstHover} onReady={ready} />,
    );
    await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
    rendered.rerender(
      <VegaChart spec={spec} onSelect={second} onHoverDatum={secondHover} onReady={ready} />,
    );
    fireEvent.click(rendered.getByText('Chart'));
    expect(second).toHaveBeenCalledWith('report-1');
    fireEvent.mouseOver(rendered.getByText('Chart'));
    expect(secondHover).toHaveBeenCalledWith({ report_id: 'report-1' });
    expect(firstHover).not.toHaveBeenCalled();
    hover(null);
    hover(null, { datum: null });
    hover(null, { datum: [] });
    hover(null, { datum: 'axis label' });
    expect(secondHover).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(embed).toHaveBeenCalledTimes(1);
    rendered.unmount();
    expect(finalize).toHaveBeenCalledTimes(1);
    hover(null, { datum: { report_id: 'stale' } });
    expect(secondHover).toHaveBeenCalledTimes(1);
  });

  it('isolates stale asynchronous renders and finalizes them', async () => {
    let resolveOld!: (result: { finalize: () => void }) => void;
    const oldFinalizer = vi.fn();
    const ready = vi.fn();
    const currentFinalizer = vi.fn();
    let oldMount!: HTMLElement;
    embed.mockImplementationOnce((mount: HTMLElement) => {
      oldMount = mount;
      return new Promise((resolve) => {
        resolveOld = resolve;
      });
    });
    embed.mockImplementationOnce(async (mount: HTMLElement) => {
      mount.textContent = 'Current chart';
      return { finalize: currentFinalizer, view: { addEventListener: vi.fn() } };
    });
    const rendered = render(<VegaChart spec={{ mark: 'point' }} onReady={ready} />);
    rendered.rerender(<VegaChart spec={{ mark: 'bar' }} onReady={ready} />);
    await waitFor(() => expect(rendered.getByText('Current chart')).toBeInTheDocument());
    await act(async () => {
      oldMount.textContent = 'Stale chart';
      resolveOld({ finalize: oldFinalizer });
    });
    expect(rendered.queryByText('Stale chart')).not.toBeInTheDocument();
    expect(rendered.getByText('Current chart')).toBeInTheDocument();
    expect(oldFinalizer).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalledTimes(1);
    rendered.unmount();
    expect(currentFinalizer).toHaveBeenCalledTimes(1);
  });

  it('reports a failed render without marking the chart ready', async () => {
    const ready = vi.fn();
    const error = vi.fn();
    embed.mockRejectedValueOnce(new Error('Invalid chart'));
    const rendered = render(<VegaChart spec={{ mark: 'point' }} onReady={ready} onError={error} />);
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith('Chart unavailable: Error: Invalid chart'),
    );
    expect(ready).not.toHaveBeenCalled();
    expect(rendered.getByText('Chart unavailable: Error: Invalid chart')).toBeInTheDocument();
    rendered.unmount();
  });
});
