import type { ChartPattern, Report } from '../domain/types';
type Datum = Report & {
  day: string;
  source_type: string;
  source_display_name?: string;
  uncertainty_lower: number | null;
  uncertainty_upper: number | null;
  salience: number;
};
const tooltipFor = (fields: string[]) =>
  fields.map((field) => ({ field, title: field.replaceAll('_', ' ') }));
const compactSource = (name: string) =>
  name
    .replace('Observation Team ', 'Team ')
    .replace('Imagery Review Desk', 'Imagery desk')
    .replace('Field Report Liaison', 'Field liaison')
    .replace('Translation Review Desk', 'Translation desk')
    .replace('Community Contact Network', 'Community network');
const reportAxis = {
  field: 'chart_label',
  type: 'nominal',
  title: null,
  sort: { field: 'chart_order', order: 'ascending' },
  axis: { labelLimit: 200, labelPadding: 12 },
};
const base = (data: Datum[]) => ({
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  data: {
    values: data.map((row, index) => ({
      ...row,
      chart_order: index,
      chart_label: `${String(index + 1).padStart(2, '0')} · ${compactSource(row.source_display_name ?? row.source_id)} · ${row.observed_at.slice(11, 16)}`,
    })),
  },
  width: 'container',
  height: 300,
  padding: { top: 16, right: 24, bottom: 14, left: 8 },
  autosize: { type: 'fit-x', contains: 'padding' },
  background: '#101827',
  config: {
    font: 'Inter, system-ui, sans-serif',
    view: { stroke: null },
    axis: {
      labelColor: '#cbd5e1',
      titleColor: '#e2e8f0',
      gridColor: '#263448',
      domainColor: '#475569',
      tickColor: '#475569',
      labelFontSize: 12,
      titleFontSize: 12,
      titleFontWeight: 500,
      titlePadding: 16,
      labelPadding: 8,
      labelLimit: 160,
      labelOverlap: true,
      tickCount: 5,
    },
    axisX: { labelAngle: 0 },
    axisY: { minExtent: 36 },
    legend: {
      labelColor: '#cbd5e1',
      titleColor: '#e2e8f0',
      orient: 'bottom',
      labelFontSize: 12,
      labelLimit: 220,
      columns: 2,
      rowPadding: 8,
      padding: 12,
    },
    range: {
      category: ['#5eead4', '#93c5fd', '#fbbf24', '#c4b5fd', '#fda4af', '#67e8f9', '#bef264'],
    },
    text: { color: '#e2e8f0', fontSize: 12 },
  },
});
export function createVegaSpec(pattern: ChartPattern, data: Datum[]): Record<string, unknown> {
  const common = base(data);
  if (pattern === 'observation_timeline')
    return {
      ...common,
      height: Math.max(220, data.length * 44),
      layer: [
        {
          mark: { type: 'rule', stroke: '#64748b', strokeWidth: 2 },
          encoding: {
            x: { field: 'observed_at', type: 'temporal', title: 'Cedar Watch exercise time' },
            x2: { field: 'received_at' },
            y: reportAxis,
            tooltip: [
              { field: 'report_title', title: 'Report' },
              { field: 'source_display_name', title: 'Source' },
              { field: 'observed_at', title: 'Observation time', type: 'temporal' },
              { field: 'received_at', title: 'Receipt time', type: 'temporal' },
              { field: 'receipt_delay_hours', title: 'Receipt delay (exercise hours)' },
            ],
          },
        },
        {
          transform: [{ fold: ['observed_at', 'received_at'], as: ['time_type', 'time_value'] }],
          mark: { type: 'point', filled: true, size: 90 },
          encoding: {
            x: { field: 'time_value', type: 'temporal', title: 'Cedar Watch exercise time' },
            y: reportAxis,
            color: {
              field: 'time_type',
              type: 'nominal',
              title: 'Time',
              scale: { domain: ['observed_at', 'received_at'], range: ['#5eead4', '#fbbf24'] },
            },
            tooltip: [
              { field: 'report_title', title: 'Report' },
              { field: 'source_display_name', title: 'Source' },
              { field: 'time_type', title: 'Time type' },
              { field: 'time_value', title: 'Time', type: 'temporal' },
            ],
          },
        },
      ],
    };
  if (pattern === 'parallel_coordinates') {
    const dimensions = [
      'source_confidence',
      'validation_score',
      'corroboration_count',
      'conflict_score',
      'report_age_hours',
      'missingness_score',
    ];
    return {
      ...common,
      transform: [
        { fold: dimensions, as: ['dimension', 'raw_value'] },
        { filter: 'isValid(datum.raw_value)' },
        {
          calculate:
            "datum.dimension === 'corroboration_count' ? datum.raw_value / 5 : datum.dimension === 'report_age_hours' ? datum.raw_value / 72 : datum.raw_value",
          as: 'normalized_value',
        },
      ],
      mark: { type: 'line', point: true, opacity: 0.45 },
      encoding: {
        x: {
          field: 'dimension',
          type: 'ordinal',
          sort: dimensions,
          title: 'Evidence dimension',
          axis: {
            labelAngle: -20,
            labelLimit: 115,
            labelExpr:
              "datum.label === 'source_confidence' ? 'Confidence' : datum.label === 'validation_score' ? 'Validation' : datum.label === 'corroboration_count' ? 'Corroboration' : datum.label === 'conflict_score' ? 'Conflict' : datum.label === 'report_age_hours' ? 'Report age' : 'Missingness'",
          },
        },
        y: {
          field: 'normalized_value',
          type: 'quantitative',
          scale: { domain: [0, 1] },
          title: 'Normalized position (0–1; raw values in tooltip)',
        },
        detail: { field: 'report_id' },
        color: { field: 'report_id', type: 'nominal', legend: null },
        tooltip: [
          { field: 'report_id', title: 'Report ID' },
          { field: 'dimension', title: 'Dimension' },
          { field: 'raw_value', title: 'Raw value' },
          { field: 'normalized_value', title: 'Normalized position' },
        ],
      },
    };
  }
  if (pattern === 'bar')
    return {
      ...common,
      height: Math.max(220, new Set(data.map((row) => row.observation_type)).size * 44),
      mark: { type: 'bar', color: '#5eead4', cornerRadiusEnd: 4, height: 24 },
      encoding: {
        y: { field: 'observation_type', type: 'nominal', title: null, axis: { labelLimit: 180 } },
        x: {
          aggregate: 'count',
          type: 'quantitative',
          title: 'Number of reports',
          axis: { tickMinStep: 1 },
        },
        color: {
          aggregate: 'max',
          field: 'is_selected',
          type: 'nominal',
          scale: { domain: [false, true], range: ['#5eead4', '#fbbf24'] },
          legend: null,
        },
        tooltip: [
          { field: 'observation_type' },
          { aggregate: 'count', title: 'Number of reports' },
        ],
      },
    };
  if (pattern === 'line' || pattern === 'error_band' || pattern === 'area')
    return {
      ...common,
      params: [{ name: 'timeBrush', select: { type: 'interval', encodings: ['x'] } }],
      layer: [
        ...(pattern === 'error_band'
          ? [
              {
                mark: { type: 'area', opacity: 0.2, color: '#6276a5' },
                encoding: {
                  x: {
                    field: 'observed_at',
                    type: 'temporal',
                    timeUnit: 'yearmonthdatehours',
                    title: 'Observation hour',
                    axis: { format: '%b %d, %H:%M', tickCount: 5 },
                  },
                  y: {
                    aggregate: 'mean',
                    field: 'uncertainty_lower',
                    type: 'quantitative',
                    title: 'Illustrative model interval',
                  },
                  y2: { aggregate: 'mean', field: 'uncertainty_upper' },
                  tooltip: [
                    { field: 'observed_at', type: 'temporal', timeUnit: 'yearmonthdatehours' },
                    { aggregate: 'mean', field: 'uncertainty_lower', title: 'Mean lower bound' },
                    { aggregate: 'mean', field: 'uncertainty_upper', title: 'Mean upper bound' },
                  ],
                },
              },
            ]
          : []),
        {
          mark: { type: pattern === 'area' ? 'area' : 'line', point: true, color: '#5eead4' },
          encoding: {
            x: {
              field: 'observed_at',
              type: 'temporal',
              timeUnit: 'yearmonthdatehours',
              title: 'Observation hour',
              axis: { format: '%b %d, %H:%M', tickCount: 5 },
            },
            y: {
              aggregate: 'count',
              type: 'quantitative',
              title: 'Number of reports',
            },
            tooltip: [
              { field: 'observed_at', type: 'temporal', timeUnit: 'yearmonthdatehours' },
              { aggregate: 'count', title: 'Number of reports' },
            ],
          },
        },
      ],
    };
  if (pattern === 'map' || pattern === 'scatter' || pattern === 'layered_scatter')
    return {
      ...common,
      transform: [
        {
          calculate: "datum.human_verified ? 'Human verified' : 'Not human verified'",
          as: 'verification_label',
        },
      ],
      params: [
        { name: 'reportSelect', select: { type: 'point', fields: ['report_id'], on: 'click' } },
      ],
      mark: { type: 'point', filled: true, size: 95, opacity: 0.78 },
      encoding: {
        x: {
          field: pattern === 'map' ? 'grid_x' : 'source_confidence',
          type: 'quantitative',
          title: pattern === 'map' ? 'Fictional grid X (0–100)' : 'Source confidence',
        },
        y: {
          field: pattern === 'map' ? 'grid_y' : 'validation_score',
          type: 'quantitative',
          title: pattern === 'map' ? 'Fictional grid Y (0–100)' : 'Validation score',
        },
        color: {
          field: 'observation_type',
          type: 'nominal',
          scale: { range: ['#5eead4', '#93c5fd', '#fbbf24', '#c4b5fd', '#fda4af'] },
        },
        shape: { field: 'verification_label', type: 'nominal', title: 'Verification status' },
        stroke: {
          condition: { test: 'datum.is_selected', value: '#fbbf24' },
          value: '#101827',
        },
        strokeWidth: { condition: { test: 'datum.is_selected', value: 3 }, value: 0.5 },
        opacity: { condition: { test: 'datum.is_selected', value: 1 }, value: 0.55 },
        tooltip: tooltipFor(
          pattern === 'map'
            ? ['report_title', 'location_name', 'grid_x', 'grid_y', 'verification_label']
            : pattern === 'layered_scatter'
              ? [
                  'report_id',
                  'source_confidence',
                  'validation_score',
                  'conflict_score',
                  'event_category',
                  'verification_label',
                ]
              : [
                  'report_id',
                  'source_confidence',
                  'validation_score',
                  'event_category',
                  'verification_label',
                ],
        ),
      },
    };
  if (pattern === 'heatmap')
    return {
      ...common,
      height: Math.max(220, new Set(data.map((row) => row.source_id)).size * 44),
      mark: { type: 'rect', cornerRadius: 3, strokeWidth: 2 },
      encoding: {
        y: {
          field: 'source_display_name',
          type: 'nominal',
          title: null,
          axis: { labelLimit: 200 },
        },
        x: {
          field: 'item_type',
          type: 'nominal',
          title: 'Reported item type',
          axis: { labelLimit: 140 },
        },
        color: {
          aggregate: 'mean',
          field: 'conflict_score',
          type: 'quantitative',
          title: 'Mean conflict',
          scale: { range: ['#193947', '#5eead4'], domain: [0, 1] },
        },
        stroke: {
          aggregate: 'max',
          field: 'is_selected',
          type: 'nominal',
          scale: { domain: [false, true], range: ['#101827', '#fbbf24'] },
          legend: null,
        },
        tooltip: [
          { field: 'source_display_name', title: 'Source' },
          { field: 'item_type', title: 'Reported item type' },
          { aggregate: 'mean', field: 'conflict_score', title: 'Mean conflict' },
        ],
      },
    };
  if (pattern === 'error_bar')
    return {
      ...common,
      height: Math.max(220, data.length * 44),
      layer: [
        {
          mark: 'rule',
          encoding: {
            x: {
              field: 'reported_count_lower',
              type: 'quantitative',
              title: 'Source-reported quantity range (not statistical interval)',
            },
            x2: { field: 'reported_count_upper' },
            y: reportAxis,
            color: {
              condition: { test: 'datum.is_selected', value: '#fbbf24' },
              value: '#5eead4',
            },
            tooltip: tooltipFor([
              'report_title',
              'source_display_name',
              'reported_count_lower',
              'reported_count_upper',
              'count_precision',
            ]),
          },
        },
        {
          mark: { type: 'point', color: '#5eead4', filled: true },
          encoding: {
            x: { field: 'reported_count', type: 'quantitative', title: 'Reported quantity' },
            y: reportAxis,
            color: {
              condition: { test: 'datum.is_selected', value: '#fbbf24' },
              value: '#5eead4',
            },
            size: { condition: { test: 'datum.is_selected', value: 120 }, value: 55 },
            tooltip: tooltipFor([
              'report_title',
              'source_display_name',
              'reported_count',
              'count_unit',
              'count_precision',
            ]),
          },
        },
      ],
    };
  if (pattern === 'table_detail') {
    return {
      ...common,
      width: { step: 170 },
      height: Math.max(220, data.length * 44),
      autosize: { type: 'pad' },
      transform: [
        {
          fold: [
            'source_display_name',
            'reported_count',
            'count_unit',
            'count_precision',
            'human_verified',
          ],
          as: ['field', 'value'],
        },
        { calculate: "isValid(datum.value) ? datum.value : 'Unknown'", as: 'display_value' },
      ],
      mark: { type: 'text', align: 'left', dx: -76, limit: 155 },
      encoding: {
        x: {
          field: 'field',
          type: 'nominal',
          sort: [
            'source_display_name',
            'reported_count',
            'count_unit',
            'count_precision',
            'human_verified',
          ],
          title: null,
          axis: {
            orient: 'top',
            labelExpr:
              "datum.label === 'source_display_name' ? 'Source' : datum.label === 'reported_count' ? 'Quantity' : datum.label === 'count_unit' ? 'Unit' : datum.label === 'count_precision' ? 'Precision' : 'Human verified'",
          },
        },
        y: reportAxis,
        text: { field: 'display_value', type: 'nominal' },
        detail: { field: 'report_id' },
        color: {
          condition: { test: 'datum.is_selected', value: '#fbbf24' },
          value: '#e2e8f0',
        },
        tooltip: [
          { field: 'report_title', title: 'Reported observation' },
          { field: 'report_id', title: 'Internal report ID' },
          { field: 'field', title: 'Detail' },
          { field: 'value', title: 'Value' },
        ],
      },
    };
  }
  if (pattern === 'dot_plot')
    return {
      ...common,
      height: Math.max(180, data.length * 48),
      layer: [
        {
          transform: [
            {
              filter: 'isValid(datum.reported_count_lower) && isValid(datum.reported_count_upper)',
            },
          ],
          mark: { type: 'rule', strokeWidth: 4, opacity: 0.65 },
          encoding: {
            x: {
              field: 'reported_count_lower',
              type: 'quantitative',
              title: `${data[0]?.count_unit ?? 'Reported quantity'} (source-reported bounds)`,
            },
            x2: { field: 'reported_count_upper' },
            y: reportAxis,
            color: { field: 'source_display_name', type: 'nominal', title: 'Source' },
            tooltip: tooltipFor([
              'report_title',
              'source_display_name',
              'reported_count_lower',
              'reported_count_upper',
              'count_precision',
              'observed_at',
            ]),
          },
        },
        {
          transform: [{ filter: 'isValid(datum.reported_count)' }],
          mark: { type: 'point', filled: true, size: 90 },
          encoding: {
            x: {
              field: 'reported_count',
              type: 'quantitative',
              title: `${data[0]?.count_unit ?? 'Reported quantity'} (not summed)`,
            },
            y: reportAxis,
            color: { field: 'source_display_name', type: 'nominal', title: 'Source' },
            stroke: {
              condition: { test: 'datum.is_selected', value: '#fbbf24' },
              value: '#101827',
            },
            strokeWidth: { condition: { test: 'datum.is_selected', value: 3 }, value: 1 },
            tooltip: tooltipFor([
              'report_title',
              'report_id',
              'source_display_name',
              'reported_count',
              'count_unit',
              'count_precision',
              'observed_at',
            ]),
          },
        },
      ],
    };
  return {
    ...common,
    transform: [
      {
        calculate: "datum.human_verified ? 'Human verified' : 'Not human verified'",
        as: 'verification_label',
      },
    ],
    mark: { type: 'point', filled: true, color: '#5eead4', size: 90 },
    encoding: {
      x: { field: 'source_confidence', type: 'quantitative', title: 'Source confidence' },
      y: { field: 'conflict_score', type: 'quantitative', title: 'Conflict score' },
      color: {
        condition: { test: 'datum.is_selected', value: '#fbbf24' },
        value: '#5eead4',
      },
      shape: {
        field: 'verification_label',
        type: 'nominal',
        title: 'Human verification',
      },
      opacity: { condition: { test: 'datum.is_selected', value: 1 }, value: 0.55 },
      tooltip: tooltipFor([
        'report_title',
        'report_id',
        'event_id',
        'source_display_name',
        'source_confidence',
        'conflict_score',
        'verification_label',
      ]),
    },
  };
}
export function createBaselineSpec(data: Datum[]): Record<string, unknown> {
  return createVegaSpec('bar', data);
}
