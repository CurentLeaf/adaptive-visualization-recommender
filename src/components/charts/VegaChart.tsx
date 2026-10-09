import { useEffect, useRef } from 'react';
import embed from 'vega-embed';
import type { VisualizationSpec } from 'vega-embed';
export function VegaChart({
  spec,
  onSelect,
  onSelectDatum,
  onBrush,
  ariaLabel,
}: {
  spec: Record<string, unknown>;
  onSelect?: (id: string) => void;
  onSelectDatum?: (datum: Record<string, unknown>) => void;
  onBrush?: (start: string, end: string) => void;
  ariaLabel?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    let active = true;
    let finalize: (() => void) | undefined;
    embed(host.current, spec as VisualizationSpec, { actions: false, renderer: 'svg' })
      .then((result) => {
        if (!active) {
          result.finalize();
          return;
        }
        finalize = result.finalize;
        result.view.addEventListener('click', (_event, item) => {
          const datum = item?.datum as Record<string, unknown> | undefined;
          const id = datum?.report_id;
          if (typeof id === 'string') onSelect?.(id);
          else if (datum) onSelectDatum?.(datum);
        });
        if (onBrush) {
          try {
            result.view.addSignalListener('timeBrush', (_name, value) => {
              const range = (value as { day?: [number, number] })?.day;
              if (range?.length === 2)
                onBrush(
                  new Date(range[0]).toISOString().slice(0, 10),
                  new Date(range[1]).toISOString().slice(0, 10),
                );
            });
          } catch {
            /* A chart without a brush has no signal. */
          }
        }
      })
      .catch((error) => {
        if (host.current) host.current.textContent = `Chart unavailable: ${String(error)}`;
      });
    return () => {
      active = false;
      finalize?.();
    };
  }, [spec, onSelect, onSelectDatum, onBrush]);
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
