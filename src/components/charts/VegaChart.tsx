import { useEffect, useRef } from 'react';
import embed from 'vega-embed';
import type { VisualizationSpec } from 'vega-embed';

function getBrushDateRange(value: unknown): [string, string] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const range = Object.values(value as Record<string, unknown>).find(
    (entry): entry is [unknown, unknown] => Array.isArray(entry) && entry.length === 2,
  );
  if (!range) return undefined;
  const toDate = (item: unknown) =>
    item instanceof Date ? item : new Date(item as string | number);
  const start = toDate(range[0]);
  const end = toDate(range[1]);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return undefined;
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

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
    let removePointerDown: (() => void) | undefined;
    let detachPointerUp: (() => void) | undefined;
    let detachPointerCancel: (() => void) | undefined;
    let activePointerId: number | undefined;
    let brushCommitTimer: number | undefined;
    const reportError = (error: unknown) => {
      if (!active) return;
      if (host.current) host.current.textContent = `Chart unavailable: ${String(error)}`;
      callbacks.current.onError?.(error);
    };
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
            const onPointerDown = (event: Event) => {
              const pointer = event as PointerEvent;
              if (pointer.isPrimary === false || pointer.button !== 0 || activePointerId !== undefined) return;
              activePointerId = pointer.pointerId;
            };
            const onPointerUp = (event: PointerEvent) => {
              if (activePointerId === undefined || event.pointerId !== activePointerId) return;
              activePointerId = undefined;
              if (brushCommitTimer !== undefined) window.clearTimeout(brushCommitTimer);
              brushCommitTimer = window.setTimeout(() => {
                brushCommitTimer = undefined;
                void result.view.runAsync()
                  .then(() => {
                    if (!active) return;
                    const range = getBrushDateRange(result.view.signal('timeBrush'));
                    if (range) callbacks.current.onBrush?.(...range);
                  })
                  .catch(reportError);
              }, 0);
            };
            const onPointerCancel = (event: PointerEvent) => {
              if (event.pointerId !== activePointerId) return;
              activePointerId = undefined;
              const pointerUp = new Event('pointerup');
              Object.defineProperties(pointerUp, {
                pointerId: { value: event.pointerId },
                isPrimary: { value: event.isPrimary },
              });
              window.dispatchEvent(pointerUp);
            };
            result.view.addEventListener('pointerdown', onPointerDown);
            removePointerDown = () => result.view.removeEventListener('pointerdown', onPointerDown);
            window.addEventListener('pointerup', onPointerUp);
            detachPointerUp = () => window.removeEventListener('pointerup', onPointerUp);
            window.addEventListener('pointercancel', onPointerCancel);
            detachPointerCancel = () => window.removeEventListener('pointercancel', onPointerCancel);
          }
        }
        callbacks.current.onReady?.();
      })
      .catch(reportError);
    return () => {
      active = false;
      if (brushCommitTimer !== undefined) window.clearTimeout(brushCommitTimer);
      removePointerDown?.();
      detachPointerUp?.();
      detachPointerCancel?.();
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
