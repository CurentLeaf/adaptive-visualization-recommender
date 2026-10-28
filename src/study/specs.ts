import type { ScenarioId } from '../domain/types';
import { frequencyRows, reportRows, type Technique } from './model';

export function studySpec(scenario: ScenarioId, technique: Technique): Record<string, unknown> {
  const rows = reportRows(scenario);
  const sourceOrder = rows.map((r) => r.source);
  const base = {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    background: '#101b2c',
    width: 'container',
    height: Math.max(240, rows.length * 62),
    padding: { left: 8, right: 65, top: 24, bottom: 12 },
    autosize: { type: 'fit', contains: 'padding', resize: true },
    data: { values: rows },
    config: {
      font: 'Inter, system-ui, sans-serif',
      view: { stroke: null },
      axis: {
        labelColor: '#b4c3d7',
        titleColor: '#b4c3d7',
        gridColor: '#253449',
        domain: false,
        tickColor: '#36465b',
        labelFontSize: 12,
        titleFontSize: 12,
        titleFontWeight: 'normal',
        labelPadding: 12,
        titlePadding: 18,
      },
      legend: {
        labelColor: '#dbe6f3',
        titleColor: '#b4c3d7',
        labelFontSize: 12,
        titleFontSize: 12,
        orient: 'bottom',
        padding: 20,
      },
      text: { color: '#e2e8f0', fontSize: 12 },
    },
  };
  const y = {
    field: 'source',
    type: 'nominal',
    sort: sourceOrder,
    title: null,
    axis: { labelLimit: 240, labelFontSize: 12, ticks: false, grid: false },
  };
  const tooltip = [
    { field: 'source', title: 'Source' },
    { field: 'quantity', title: 'Reported quantity' },
    { field: 'independent', title: 'Independence' },
    { field: 'observed', title: 'Observed (exercise time)' },
    { field: 'received', title: 'Received (exercise time)' },
  ];
  if (scenario === 'anomaly') {
    const values = frequencyRows().flatMap((r) => [
      { hour: r.hour, series: 'Reports', value: r.reports },
      { hour: r.hour, series: 'Sources', value: r.sources },
    ]);
    return {
      ...base,
      height: 290,
      data: { values },
      mark:
        technique === 'bar'
          ? { type: 'bar', cornerRadiusTopLeft: 3, cornerRadiusTopRight: 3 }
          : { type: 'line', point: { filled: true, size: 85 }, strokeWidth: 3 },
      encoding: {
        x: {
          field: 'hour',
          type: 'ordinal',
          title: 'Observation hour · exercise time (UTC−04:00)',
          axis: { labelAngle: 0 },
        },
        ...(technique === 'bar' ? { xOffset: { field: 'series' } } : {}),
        y: {
          field: 'value',
          type: 'quantitative',
          title: 'Number per hour',
          scale: { zero: true },
          axis: { tickMinStep: 1 },
        },
        color: {
          field: 'series',
          type: 'nominal',
          title: null,
          scale: { domain: ['Reports', 'Sources'], range: ['#5eead4', '#a5b4fc'] },
        },
        strokeDash: technique === 'line' ? { field: 'series', type: 'nominal' } : undefined,
        tooltip: [
          { field: 'hour', title: 'Observation hour' },
          { field: 'series', title: 'Measure' },
          { field: 'value', title: 'Count' },
        ],
      },
    };
  }
  if (scenario === 'quality') {
    return {
      ...base,
      height: 270,
      transform: [{ fold: ['translation', 'verification'], as: ['dimension', 'status'] }],
      layer: [
        {
          mark: { type: 'rect', cornerRadius: 5, stroke: '#101b2c', strokeWidth: 8 },
          encoding: {
            color: {
              field: 'dimension',
              type: 'nominal',
              legend: null,
              scale: { domain: ['translation', 'verification'], range: ['#243d4a', '#303952'] },
            },
          },
        },
        {
          mark: { type: 'text', color: '#e2e8f0', fontSize: 12 },
          encoding: { text: { field: 'status' } },
        },
      ],
      encoding: {
        y,
        x: {
          field: 'dimension',
          type: 'nominal',
          sort: ['translation', 'verification'],
          title: null,
          axis: {
            labelAngle: 0,
            labelExpr: "datum.label === 'translation' ? 'Translation' : 'Human verification'",
            orient: 'top',
            ticks: false,
          },
        },
        tooltip: [
          { field: 'source', title: 'Source' },
          { field: 'translation', title: 'Translation' },
          { field: 'verification', title: 'Human verification' },
          { field: 'quantity', title: 'Reported count' },
        ],
      },
    };
  }
  if (scenario === 'uncertain') {
    if (technique === 'bar')
      return {
        ...base,
        layer: [
          {
            mark: { type: 'bar', color: '#5eead4', height: 16, cornerRadiusEnd: 3 },
            encoding: {
              x: {
                field: 'delay',
                type: 'quantitative',
                title: 'Observation-to-receipt delay (hours)',
                scale: { zero: true },
              },
              y,
            },
          },
          {
            mark: { type: 'text', align: 'left', dx: 10, color: '#dbe6f3' },
            encoding: {
              x: { field: 'delay', type: 'quantitative' },
              y,
              text: { field: 'delay', format: '.2~f' },
            },
          },
        ],
        encoding: { tooltip: [...tooltip, { field: 'delay', title: 'Delay (hours)' }] },
      };
    return {
      ...base,
      encoding: { y, tooltip: [...tooltip, { field: 'delay', title: 'Delay (hours)' }] },
      layer: [
        {
          mark: { type: 'rule', stroke: '#60748f', strokeWidth: 3 },
          encoding: {
            x: {
              field: 'observed_plot',
              type: 'temporal',
              scale: { type: 'utc' },
              title: 'Exercise time (UTC−04:00)',
              axis: { format: '%H:%M', tickCount: 5 },
            },
            x2: { field: 'received_plot' },
          },
        },
        {
          transform: [{ fold: ['observed_plot', 'received_plot'], as: ['time_type', 'time'] }],
          mark: { type: 'point', filled: true, size: 120 },
          encoding: {
            x: {
              field: 'time',
              type: 'temporal',
              scale: { type: 'utc' },
              title: 'Exercise time (UTC−04:00)',
              axis: { format: '%H:%M', tickCount: 5 },
            },
            color: {
              field: 'time_type',
              type: 'nominal',
              title: null,
              scale: { domain: ['observed_plot', 'received_plot'], range: ['#5eead4', '#a5b4fc'] },
              legend: { labelExpr: "datum.label === 'observed_plot' ? 'Observed' : 'Received'" },
            },
          },
        },
      ],
    };
  }
  const domainMax = Math.max(...rows.map((r) => r.upper ?? r.count ?? 0)) + 2;
  const x = {
    field: 'count',
    type: 'quantitative',
    title: 'Cargo trucks · source-reported quantity',
    scale: { domain: [0, domainMax] },
    axis: { tickMinStep: 1 },
  };
  return {
    ...base,
    encoding: { y, tooltip },
    layer: [
      ...(technique === 'bar'
        ? [
            {
              transform: [{ filter: 'isValid(datum.count)' }],
              mark: {
                type: 'bar',
                color: '#5eead4',
                opacity: 0.65,
                height: 16,
                cornerRadiusEnd: 3,
              },
              encoding: { x },
            },
          ]
        : []),
      {
        transform: [{ filter: 'isValid(datum.lower) && isValid(datum.upper)' }],
        mark: { type: 'rule', color: '#99f6e4', strokeWidth: 3 },
        encoding: { x: { ...x, field: 'lower' }, x2: { field: 'upper' } },
      },
      {
        transform: [{ filter: 'isValid(datum.count)' }],
        mark: {
          type: 'point',
          filled: true,
          color: '#5eead4',
          size: 100,
          stroke: '#101b2c',
          strokeWidth: 2,
        },
        encoding: { x },
      },
      {
        transform: [{ filter: '!isValid(datum.count)' }],
        mark: { type: 'text', align: 'left', color: '#b4c3d7', fontStyle: 'italic' },
        encoding: { x: { datum: 0 }, text: { value: 'Unknown quantity' } },
      },
    ],
  };
}
