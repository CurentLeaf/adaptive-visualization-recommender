import type { ChartPattern, Report } from '../domain/types';
type Datum = Report & {
  day: string;
  source_type: string;
  source_display_name?: string;
  uncertainty_lower: number | null;
  uncertainty_upper: number | null;
  salience: number;
};
const tooltipFor = (fields: string[]) => fields.map((field) => ({ field }));
const base = (data: Datum[]) => ({
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  data: { values: data },
  width: 'container',
  height: 280,
  background: '#ffffff',
  config: {
    view: { stroke: null },
    axis: { labelColor: '#334155', titleColor: '#334155', gridColor: '#e2e8f0' },
    legend: { labelColor: '#334155' },
  },
});
export function createVegaSpec(pattern: ChartPattern, data: Datum[]): Record<string, unknown> {
  const common = base(data);
  if (pattern === 'observation_timeline')
    return {
      ...common,
      height: Math.max(180, data.length * 42),
      layer: [
        {
          mark: { type: 'rule', stroke: '#64748b', strokeWidth: 2 },
          encoding: {
            x: { field: 'observed_at', type: 'temporal', title: 'Cedar Watch exercise time' },
            x2: { field: 'received_at' },
            y: { field: 'report_title', type: 'nominal', title: 'Reported observation' },
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
          transform: [
            { fold: ['observed_at', 'received_at'], as: ['time_type', 'time_value'] },
          ],
          mark: { type: 'point', filled: true, size: 90 },
          encoding: {
            x: { field: 'time_value', type: 'temporal', title: 'Cedar Watch exercise time' },
            y: { field: 'report_title', type: 'nominal', title: 'Reported observation' },
            color: {
              field: 'time_type',
              type: 'nominal',
              title: 'Time',
              scale: { domain: ['observed_at', 'received_at'], range: ['#2563eb', '#b45309'] },
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
          title: 'Evidence dimension (axis order is meaningful)',
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
      mark: { type: 'bar', color: '#4666a7' },
      encoding: {
        x: { field: 'observation_type', type: 'nominal', title: 'Observation type' },
        y: { aggregate: 'count', type: 'quantitative', title: 'Number of reports' },
        color: {
          aggregate: 'max',
          field: 'is_selected',
          type: 'nominal',
          scale: { domain: [false, true], range: ['#4666a7', '#b42318'] },
          legend: null,
        },
        tooltip: [{ field: 'observation_type' }, { aggregate: 'count', title: 'Number of reports' }],
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
                    timeUnit: 'hours',
                    title: 'Cedar Watch exercise hour',
                  },
                  y: {
                    aggregate: 'mean',
                    field: 'uncertainty_lower',
                    type: 'quantitative',
                    title: 'Illustrative model interval',
                  },
                  y2: { aggregate: 'mean', field: 'uncertainty_upper' },
                  tooltip: [
                    { field: 'observed_at', type: 'temporal', timeUnit: 'hours' },
                    { aggregate: 'mean', field: 'uncertainty_lower', title: 'Mean lower bound' },
                    { aggregate: 'mean', field: 'uncertainty_upper', title: 'Mean upper bound' },
                  ],
                },
              },
            ]
          : []),
        {
          mark: { type: pattern === 'area' ? 'area' : 'line', point: true, color: '#345e9b' },
          encoding: {
            x: {
              field: 'observed_at',
              type: 'temporal',
              timeUnit: 'hours',
              title: 'Cedar Watch exercise hour',
            },
            y: {
              aggregate: 'count',
              type: 'quantitative',
              title: 'Number of reports (not amount of activity)',
            },
            tooltip: [
              { field: 'observed_at', type: 'temporal', timeUnit: 'hours' },
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
        color: { field: 'observation_type', type: 'nominal', scale: { scheme: 'tableau10' } },
        shape: { field: 'verification_label', type: 'nominal', title: 'Verification status' },
        stroke: {
          condition: { test: 'datum.is_selected', value: '#b42318' },
          value: '#ffffff',
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
      mark: 'rect',
      encoding: {
        x: { field: 'source_display_name', type: 'nominal', title: 'Reporting source' },
        y: { field: 'item_type', type: 'nominal', title: 'Reported item type' },
        color: {
          aggregate: 'mean',
          field: 'conflict_score',
          type: 'quantitative',
          title: 'Mean conflict',
          scale: { scheme: 'blues' },
        },
        stroke: {
          aggregate: 'max',
          field: 'is_selected',
          type: 'nominal',
          scale: { domain: [false, true], range: ['#ffffff', '#b42318'] },
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
            y: { field: 'report_title', type: 'nominal', sort: '-x' },
            color: {
              condition: { test: 'datum.is_selected', value: '#b42318' },
              value: '#345e9b',
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
          mark: { type: 'point', color: '#345e9b', filled: true },
          encoding: {
            x: { field: 'reported_count', type: 'quantitative', title: 'Reported quantity' },
            y: { field: 'report_title', type: 'nominal', sort: '-x' },
            color: {
              condition: { test: 'datum.is_selected', value: '#b42318' },
              value: '#345e9b',
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
      transform: [
        {
          fold: [
            'report_title',
            'source_display_name',
            'event_id',
            'location_name',
            'item_type',
            'reported_count',
            'count_unit',
            'observed_at',
            'received_at',
            'actor_attribution_status',
            'source_confidence',
            'validation_score',
            'conflict_score',
            'human_verified',
            'anomaly_score',
          ],
          as: ['field', 'value'],
        },
      ],
      mark: { type: 'text', align: 'left', dx: 4 },
      encoding: {
        x: { field: 'field', type: 'nominal', title: 'Reported observation detail' },
        y: { field: 'report_title', type: 'nominal', title: 'Reported observation' },
        text: { field: 'value', type: 'nominal' },
        detail: { field: 'report_id' },
        color: {
          condition: { test: 'datum.is_selected', value: '#b42318' },
          value: '#334155',
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
              filter:
                'isValid(datum.reported_count_lower) && isValid(datum.reported_count_upper)',
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
            y: { field: 'report_title', type: 'nominal', title: 'Reported observation' },
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
            y: { field: 'report_title', type: 'nominal', title: 'Reported observation' },
            color: { field: 'source_display_name', type: 'nominal', title: 'Source' },
            stroke: {
              condition: { test: 'datum.is_selected', value: '#b42318' },
              value: '#ffffff',
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
    mark: { type: 'point', filled: true, color: '#4666a7', size: 90 },
    encoding: {
      x: { field: 'source_confidence', type: 'quantitative', title: 'Source confidence' },
      y: { field: 'conflict_score', type: 'quantitative', title: 'Conflict score' },
      color: {
        condition: { test: 'datum.is_selected', value: '#b42318' },
        value: '#4666a7',
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
