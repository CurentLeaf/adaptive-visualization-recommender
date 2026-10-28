import { useEffect, useRef } from 'react';
import embed from 'vega-embed';
import type { VisualizationSpec } from 'vega-embed';

export function VegaChart({
  spec,
  onSelect,
  onSelectDatum,
  onHoverDatum,
  onBrush,
  onReady,
  onError,
  ariaLabel,
}: {
  spec: Record<string, unknown>;
  onSelect?: (id: string) => void;
  onSelectDatum?: (datum: Record<string, unknown>) => void;
  onHoverDatum?: (datum: Record<string, unknown>) => void;
  onBrush?: (start: string, end: string) => void;
  onReady?: () => void;
  onError?: (message: string) => void;
  ariaLabel?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onSelect, onSelectDatum, onHoverDatum, onBrush, onReady, onError });
  useEffect(() => {
    handlers.current = { onSelect, onSelectDatum, onHoverDatum, onBrush, onReady, onError };
  }, [onSelect, onSelectDatum, onHoverDatum, onBrush, onReady, onError]);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    // Each render owns a mount so an older asynchronous embed cannot replace a newer chart.
    const mount = document.createElement('div');
    mount.style.width = '100%';
    container.appendChild(mount);
    let active = true;
    let finalize: (() => void) | undefined;
    let observer: ResizeObserver | undefined;
    embed(mount, spec as VisualizationSpec, {
      actions: false,
      renderer: 'svg',
      tooltip: { theme: 'dark' },
    })
      .then((result) => {
        if (!active) {
          result.finalize();
          return;
        }
        finalize = result.finalize;
        result.view.addEventListener('click', (_event, item) => {
          const datum = item?.datum as Record<string, unknown> | undefined;
          const id = datum?.report_id;
          if (typeof id === 'string') handlers.current.onSelect?.(id);
          else if (datum) handlers.current.onSelectDatum?.(datum);
        });
        result.view.addEventListener('mouseover', (_event, item) => {
          const datum: unknown = item?.datum;
          if (active && datum !== null && typeof datum === 'object' && !Array.isArray(datum))
            handlers.current.onHoverDatum?.(datum as Record<string, unknown>);
        });
        if (Array.isArray(spec.params) && spec.params.some((param) => param.name === 'timeBrush')) {
          result.view.addSignalListener('timeBrush', (_name, value) => {
            // Vega-Lite names the selected field after any time-unit transform.
            const range = Object.values((value ?? {}) as Record<string, unknown>).find(
              (candidate): candidate is [number, number] =>
                Array.isArray(candidate) &&
                candidate.length === 2 &&
                candidate.every((item) => typeof item === 'number' && Number.isFinite(item)),
            );
            if (range)
              handlers.current.onBrush?.(
                new Date(range[0]).toISOString().slice(0, 10),
                new Date(range[1]).toISOString().slice(0, 10),
              );
          });
        }
        if (typeof ResizeObserver !== 'undefined') {
          let lastWidth = container.clientWidth;
          observer = new ResizeObserver(([entry]) => {
            const width = entry.contentRect.width;
            if (!active || width <= 0 || Math.abs(width - lastWidth) < 1) return;
            lastWidth = width;
            void result.view
              .resize()
              .runAsync()
              .catch(() => {
                // A pending resize can finish after its view has been finalized.
              });
          });
          observer.observe(container);
        }
        handlers.current.onReady?.();
      })
      .catch((error) => {
        if (active) {
          const message = `Chart unavailable: ${String(error)}`;
          mount.textContent = message;
          handlers.current.onError?.(message);
        }
      });
    return () => {
      active = false;
      observer?.disconnect();
      finalize?.();
      mount.remove();
    };
  }, [spec]);
  return (
    <div
      className="chart"
      ref={host}
      role="img"
      aria-label={
        ariaLabel ??
        'Interactive Vega-Lite chart. Data values are also available in report details and the dataset profile.'
      }
    />
  );
}
