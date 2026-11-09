import { useEffect, useRef } from 'react';
import embed from 'vega-embed';
import type { VisualizationSpec } from 'vega-embed';
export function VegaChart({
  spec,
  onSelect,
  onSelectDatum,
  onBrush,
  onReady,
  onError,
  ariaLabel,
}: {
  spec: Record<string, unknown>;
  onSelect?: (id: string) => void;
  onSelectDatum?: (datum: Record<string, unknown>) => void;
  onBrush?: (start: string, end: string) => void;
  onReady?: () => void;
  onError?: (error: unknown) => void;
  ariaLabel?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onSelect, onSelectDatum, onBrush, onReady, onError });
  callbacks.current = { onSelect, onSelectDatum, onBrush, onReady, onError };
  useEffect(() => {
    if (!host.current) return;
    let active = true;
    let finalize: (() => void) | undefined;
    let removeBrushListener: (() => void) | undefined;
    let detachMouseUp: (() => void) | undefined;
    let pendingBrush: [string, string] | undefined;
    let brushCommitTimer: number | undefined;
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
          if (typeof id === 'string') callbacks.current.onSelect?.(id);
          else if (datum) callbacks.current.onSelectDatum?.(datum);
        });
        if (callbacks.current.onBrush) {
          const state = result.view.getState({
            signals: (name) => name === 'timeBrush',
            data: () => false,
            recurse: false,
          });
          if (Object.prototype.hasOwnProperty.call(state.signals, 'timeBrush')) {
            const brushListener = (_name: string, value: unknown) => {
              const selection = value && typeof value === 'object'
                ? Object.values(value as Record<string, unknown>)
                : [];
              const range = selection.find(
                (entry): entry is [string | number, string | number] =>
                  Array.isArray(entry) && entry.length === 2,
              );
              if (range?.length === 2) {
                pendingBrush = [
                  new Date(range[0]).toISOString().slice(0, 10),
                  new Date(range[1]).toISOString().slice(0, 10),
                ];
              } else {
                pendingBrush = undefined;
              }
            };
            result.view.addSignalListener('timeBrush', brushListener);
            removeBrushListener = () => result.view.removeSignalListener('timeBrush', brushListener);
            const onMouseUp = () => {
              if (!pendingBrush) return;
              if (brushCommitTimer !== undefined) window.clearTimeout(brushCommitTimer);
              brushCommitTimer = window.setTimeout(() => {
                brushCommitTimer = undefined;
                const range = pendingBrush;
                pendingBrush = undefined;
                if (active && range) callbacks.current.onBrush?.(...range);
              }, 0);
            };
            window.addEventListener('mouseup', onMouseUp);
            detachMouseUp = () => window.removeEventListener('mouseup', onMouseUp);
          }
        }
        callbacks.current.onReady?.();
      })
      .catch((error) => {
        if (!active) return;
        if (host.current) host.current.textContent = `Chart unavailable: ${String(error)}`;
        callbacks.current.onError?.(error);
      });
    return () => {
      active = false;
      if (brushCommitTimer !== undefined) window.clearTimeout(brushCommitTimer);
      detachMouseUp?.();
      removeBrushListener?.();
      finalize?.();
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
