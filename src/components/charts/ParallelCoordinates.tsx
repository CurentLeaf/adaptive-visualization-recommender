import { useMemo, useState } from 'react';
import type { Report } from '../../domain/types';

type ParallelRow = Report & {
  anomaly_score: number;
  day: string;
  source_type: string;
  uncertainty_lower: number | null;
  uncertainty_upper: number | null;
  salience: number;
};

export const PARALLEL_DIMENSIONS = [
  {
    field: 'source_confidence',
    label: 'Source confidence',
    min: 0,
    max: 1,
    unit: '0–1',
    direction: 'Higher = more confidence',
  },
  {
    field: 'validation_score',
    label: 'Validation score',
    min: 0,
    max: 1,
    unit: '0–1',
    direction: 'Higher = higher validation score',
  },
  {
    field: 'corroboration_count',
    label: 'Corroboration count',
    min: 0,
    max: 5,
    unit: 'reports',
    direction: 'Higher = more reported support',
  },
  {
    field: 'conflict_score',
    label: 'Conflict score',
    min: 0,
    max: 1,
    unit: '0–1',
    direction: 'Higher = more conflict',
  },
  {
    field: 'report_age_hours',
    label: 'Report age',
    min: 0,
    max: 72,
    unit: 'hours',
    direction: 'Higher = older report',
  },
  {
    field: 'missingness_score',
    label: 'Missingness score',
    min: 0,
    max: 1,
    unit: '0–1',
    direction: 'Higher = more missing information',
  },
  {
    field: 'anomaly_score',
    label: 'Anomaly score',
    min: 0,
    max: 1,
    unit: '0–1',
    direction: 'Higher = more anomalous under the descriptive rule',
  },
] as const;

export type ParallelDimension = (typeof PARALLEL_DIMENSIONS)[number]['field'];
export type DimensionRanges = Partial<Record<ParallelDimension, [number, number]>>;

export const createDefaultParallelRanges = (): DimensionRanges =>
  Object.fromEntries(
    PARALLEL_DIMENSIONS.map(({ field, min, max }) => [field, [min, max]]),
  ) as DimensionRanges;

export function normalizeWithinBounds(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

export function normalizeDimensionValue(
  field: ParallelDimension,
  value: unknown,
): number | undefined {
  const dimension = PARALLEL_DIMENSIONS.find((item) => item.field === field)!;
  return normalizeWithinBounds(value, Number(dimension.min), Number(dimension.max));
}

export function filterByDimensionRanges<T extends object>(
  records: T[],
  ranges: DimensionRanges,
): T[] {
  return records.filter((record) =>
    Object.entries(ranges).every(([field, range]) => {
      if (!range) return true;
      const value: unknown = Reflect.get(record, field);
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= range[0] &&
        value <= range[1]
      );
    }),
  );
}

const palette = [
  '#345e9b',
  '#b45309',
  '#047857',
  '#7c3aed',
  '#be123c',
  '#0e7490',
  '#4d7c0f',
  '#a21caf',
];
const colorFor = (id: string) => {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
};
const rawValue = (row: ParallelRow, field: ParallelDimension): number | undefined =>
  normalizeDimensionValue(field, row[field]);

export function ParallelCoordinates({
  records,
  selectedId,
  audience,
  ranges,
  onRangesChange,
  onSelect,
}: {
  records: ParallelRow[];
  selectedId: string;
  audience: 'Commander' | 'Analyst';
  ranges: DimensionRanges;
  onRangesChange: (ranges: DimensionRanges) => void;
  onSelect: (id: string) => void;
}) {
  const [visible, setVisible] = useState<ParallelDimension[]>(
    PARALLEL_DIMENSIONS.slice(0, 6).map((dimension) => dimension.field),
  );
  const displayedRecords = useMemo(() => {
    if (audience !== 'Commander') return records;
    const compact = records.slice(0, 12);
    const selected = records.find((record) => record.report_id === selectedId);
    return selected && !compact.includes(selected) ? [...compact.slice(0, 11), selected] : compact;
  }, [audience, records, selectedId]);
  const width = 900;
  const height = 330;
  const left = 48;
  const right = width - 30;
  const top = 35;
  const bottom = height - 55;
  const xAt = (index: number) => left + (right - left) * (index / Math.max(1, visible.length - 1));
  const yAt = (normalized: number) => bottom - normalized * (bottom - top);

  const moveAxis = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= visible.length) return;
    setVisible((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const toggleAxis = (field: ParallelDimension) => {
    if (visible.includes(field)) {
      if (visible.length > 2) {
        setVisible(visible.filter((item) => item !== field));
        const dimension = PARALLEL_DIMENSIONS.find((item) => item.field === field)!;
        onRangesChange({ ...ranges, [field]: [dimension.min, dimension.max] });
      }
      return;
    }
    setVisible([...visible, field]);
  };
  const setBound = (field: ParallelDimension, bound: 0 | 1, value: number) => {
    const dimension = PARALLEL_DIMENSIONS.find((item) => item.field === field)!;
    const current = ranges[field] ?? [dimension.min, dimension.max];
    const next: [number, number] = [...current];
    next[bound] = value;
    if (next[0] > next[1]) next[bound === 0 ? 1 : 0] = value;
    onRangesChange({ ...ranges, [field]: next });
  };
  const resetPlot = () => {
    setVisible(PARALLEL_DIMENSIONS.slice(0, 6).map((dimension) => dimension.field));
    onRangesChange(createDefaultParallelRanges());
    onSelect('');
  };

  return (
    <section className="panel parallel-panel" aria-labelledby="parallel-title">
      <div className="section-title">
        <div>
          <h2 id="parallel-title">Parallel coordinates plot</h2>
          <p>
            Parallel coordinates plot · one report per line · fixed full-dataset bounds, not
            filtered rows. {displayedRecords.length} of {records.length} matching reports shown.
          </p>
        </div>
        <button className="button ghost" type="button" onClick={resetPlot}>
          Reset axes, ranges, and selection
        </button>
      </div>
      <p className="help">
        Each line represents one report. The plot compares evidence profiles and tradeoffs; it does
        not establish causes. Axis order changes which relationships are easiest to see. Raw values
        and units are available in the selectable report table below. Modeling/display operation:
        fixed-bound min-max normalization only; it is not an inferential model.
        {audience === 'Commander'
          ? ` Commander mode plots the first 12 matching reports in deterministic dataset order, including the selected report if it is outside that set; ${records.length - displayedRecords.length} reports are omitted.`
          : ''}
      </p>
      <fieldset className="axis-chooser">
        <legend>Visible axes (choose at least two)</legend>
        {PARALLEL_DIMENSIONS.map((dimension) => (
          <label key={dimension.field}>
            <input
              type="checkbox"
              checked={visible.includes(dimension.field)}
              onChange={() => toggleAxis(dimension.field)}
            />
            {dimension.label}
          </label>
        ))}
      </fieldset>
      <div className="axis-order" aria-label="Reorder visible axes">
        <strong>Axis order:</strong>
        {visible.map((field, index) => {
          const dimension = PARALLEL_DIMENSIONS.find((item) => item.field === field)!;
          return (
            <span className="axis-order-item" key={field}>
              {dimension.label}
              <button
                type="button"
                className="icon-button"
                aria-label={`Move ${dimension.label} left`}
                disabled={index === 0}
                onClick={() => moveAxis(index, -1)}
              >
                ←
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`Move ${dimension.label} right`}
                disabled={index === visible.length - 1}
                onClick={() => moveAxis(index, 1)}
              >
                →
              </button>
            </span>
          );
        })}
      </div>
      <svg
        className="parallel-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label="Parallel coordinates of report evidence profiles"
      >
        {visible.map((field, index) => {
          const dimension = PARALLEL_DIMENSIONS.find((item) => item.field === field)!;
          const x = xAt(index);
          return (
            <g key={field}>
              <line x1={x} x2={x} y1={top} y2={bottom} stroke="#8b9aab" />
              {[0, 0.5, 1].map((tick) => (
                <g key={tick}>
                  <line x1={x - 4} x2={x + 4} y1={yAt(tick)} y2={yAt(tick)} stroke="#8b9aab" />
                  <text x={x - 8} y={yAt(tick) + 4} textAnchor="end" className="axis-tick">
                    {tick.toFixed(1)}
                  </text>
                </g>
              ))}
              <text x={x} y={top - 14} textAnchor="middle" className="axis-label">
                {dimension.label}
              </text>
              <text x={x} y={bottom + 20} textAnchor="middle" className="axis-direction">
                {dimension.direction}
              </text>
              <text x={x} y={bottom + 36} textAnchor="middle" className="axis-direction">
                Normalized 0–1 · raw unit: {dimension.unit}
              </text>
            </g>
          );
        })}
        {displayedRecords.map((record) => {
          let path = '';
          visible.forEach((field, index) => {
            const normalized = rawValue(record, field);
            if (normalized === undefined) return;
            const command =
              index > 0 && rawValue(record, visible[index - 1]) !== undefined ? 'L' : 'M';
            path += `${command}${xAt(index)},${yAt(normalized)} `;
          });
          const selected = selectedId === record.report_id;
          const valueSummary = visible
            .map((field) => {
              const dimension = PARALLEL_DIMENSIONS.find((item) => item.field === field)!;
              return `${dimension.label}: ${record[field] === null ? 'Unknown' : `${record[field]} ${dimension.unit}`}`;
            })
            .join('; ');
          return (
            <path
              key={record.report_id}
              d={path}
              fill="none"
              stroke={selected ? '#b42318' : colorFor(record.report_id)}
              strokeWidth={selected ? 3.5 : 1.5}
              opacity={selected ? 1 : 0.28}
              tabIndex={0}
              role="button"
              aria-pressed={selected}
              aria-label={`${record.report_title}. Internal ID ${record.report_id}. ${valueSummary}`}
              onClick={() => onSelect(record.report_id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(record.report_id);
                }
              }}
            >
              <title>{`${record.report_title} · ${record.report_id} · ${valueSummary}`}</title>
            </path>
          );
        })}
      </svg>
      <div className="parallel-ranges">
        <h3>Shared dimension range filters</h3>
        <p className="help">
          These ranges filter the shared report set, including the other charts and table. Bounds
          stay fixed when filters change.
        </p>
        {visible.map((field) => {
          const dimension = PARALLEL_DIMENSIONS.find((item) => item.field === field)!;
          const range = ranges[field] ?? [dimension.min, dimension.max];
          return (
            <fieldset className="range-control" key={field}>
              <legend>
                {dimension.label} ({dimension.unit})
              </legend>
              <label>
                Minimum {range[0].toFixed(2)}
                <input
                  type="range"
                  min={dimension.min}
                  max={dimension.max}
                  step={(dimension.max - dimension.min) / 100}
                  value={range[0]}
                  onChange={(event) => setBound(field, 0, Number(event.target.value))}
                />
              </label>
              <label>
                Maximum {range[1].toFixed(2)}
                <input
                  type="range"
                  min={dimension.min}
                  max={dimension.max}
                  step={(dimension.max - dimension.min) / 100}
                  value={range[1]}
                  onChange={(event) => setBound(field, 1, Number(event.target.value))}
                />
              </label>
            </fieldset>
          );
        })}
      </div>
      <ReportTable records={records} selectedId={selectedId} onSelect={onSelect} />
    </section>
  );
}

export function ReportTable({
  records,
  selectedId,
  onSelect,
}: {
  records: (Report & { source_display_name?: string })[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (!records.length) return <p className="empty">No reports match the current filters.</p>;
  return (
    <div className="tablewrap">
      <table>
        <caption>
          Selectable report table. Quantity columns show source-reported claims; unknown is not
          treated as zero and reports are not summed.
        </caption>
        <thead>
          <tr>
            <th scope="col">Reported observation</th>
            <th scope="col">Source</th>
            <th scope="col">Reported quantity</th>
            <th scope="col">Observation time</th>
            <th scope="col">Source confidence</th>
            <th scope="col">Validation status</th>
            <th scope="col">Conflict</th>
            <th scope="col">Age at exercise reference time (hours)</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr
              key={record.report_id}
              className={selectedId === record.report_id ? 'selected-row' : ''}
            >
              <th scope="row">
                <button
                  className="table-select"
                  type="button"
                  aria-pressed={selectedId === record.report_id}
                  onClick={() => onSelect(record.report_id)}
                >
                  {record.report_title}
                </button>
                <small className="secondary-id">{record.report_id}</small>
              </th>
              <td>{record.source_display_name ?? record.source_id}</td>
              <td>
                {record.count_precision === 'unknown' || record.reported_count === null
                  ? `Unknown ${record.count_unit} count`
                  : record.count_precision === 'range'
                    ? `${record.reported_count_lower}–${record.reported_count_upper} ${record.count_unit} reported`
                    : record.count_precision === 'approximate'
                      ? `Approximately ${record.reported_count} ${record.count_unit}`
                      : `${record.reported_count} ${record.count_unit} as reported`}
              </td>
              <td>{record.observed_at.slice(0, 10)} {record.observed_at.slice(11, 16)}</td>
              <td>{Math.round(record.source_confidence * 100)}%</td>
              <td>{record.validation_status.replaceAll('_', ' ')}</td>
              <td>{Math.round(record.conflict_score * 100)}%</td>
              <td>{record.report_age_hours}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
