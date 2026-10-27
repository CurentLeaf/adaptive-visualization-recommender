import type { TimelineRow } from './temporal';
import type { NumericRow } from './typing';

/**
 * Vega-Lite specs for imported data. Field names and expressions are fixed by this module; imported
 * strings appear only as data values (and as plain-text titles), never as fields or expressions.
 */
const base = (values: unknown[]) => ({
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  data: { values },
  width: 'container',
  height: 280,
  background: '#ffffff',
  config: {
    view: { stroke: null },
    axis: { labelColor: '#334155', titleColor: '#334155', gridColor: '#e2e8f0' },
    legend: { labelColor: '#334155' },
  },
});

const utcTime = (field: string, title: string) => ({
  field,
  type: 'temporal',
  scale: { type: 'utc' },
  title,
});

export function createValidityTimelineSpec(rows: TimelineRow[]): Record<string, unknown> {
  const tooltip = [
    { field: 'fact_id', title: 'Fact ID' },
    { field: 'label', title: 'Entity · predicate' },
    { field: 'start_raw', title: 'valid_from (original)' },
    { field: 'end_raw', title: 'valid_to (original)' },
    { field: 'endpoint_kind', title: 'Endpoint kind' },
  ];
  const y = { field: 'fact_id', type: 'nominal', title: 'Fact ID', sort: { field: 'start_ms' } };
  return {
    ...base(rows),
    height: Math.max(160, rows.length * 34),
    layer: [
      {
        transform: [
          { filter: { field: 'start_ms', valid: true } },
          { filter: { field: 'end_ms', valid: true } },
        ],
        mark: { type: 'rule', strokeWidth: 3, color: '#64748b' },
        encoding: {
          x: utcTime('start_ms', 'Supplied validity (UTC)'),
          x2: { field: 'end_ms' },
          y,
          tooltip,
        },
      },
      {
        transform: [{ filter: { field: 'start_ms', valid: true } }],
        mark: { type: 'point', filled: true, size: 90, color: '#2563eb' },
        encoding: {
          x: utcTime('start_ms', 'Supplied validity (UTC)'),
          y,
          shape: { field: 'endpoint_kind', type: 'nominal', title: 'Endpoints' },
          tooltip,
        },
      },
      {
        transform: [{ filter: { field: 'end_ms', valid: true } }],
        mark: { type: 'point', filled: false, size: 90, color: '#b45309' },
        encoding: {
          x: utcTime('end_ms', 'Supplied validity (UTC)'),
          y,
          shape: { field: 'endpoint_kind', type: 'nominal', title: 'Endpoints' },
          tooltip,
        },
      },
    ],
  };
}

/** Points only: no interpolation, so gaps in time are never bridged. */
export function createNumericObservationSpec(
  rows: NumericRow[],
  unit: string,
): Record<string, unknown> {
  return {
    ...base(rows),
    mark: { type: 'point', filled: true, size: 80 },
    encoding: {
      x: utcTime('time_ms', `${rows[0]?.time_field ?? 'timestamp'} (UTC)`),
      y: { field: 'value', type: 'quantitative', title: `Normalized numeric value (${unit})` },
      color: { field: 'series', type: 'nominal', title: 'Entity · predicate' },
      tooltip: [
        { field: 'fact_id', title: 'Fact ID' },
        { field: 'entity_id', title: 'Entity ID' },
        { field: 'predicate', title: 'Predicate' },
        { field: 'original_value', title: 'Original object_value' },
        { field: 'value', title: 'Normalized value', type: 'quantitative' },
        { field: 'unit', title: 'Unit' },
        { field: 'time_raw', title: 'Timestamp (original)' },
      ],
    },
  };
}
