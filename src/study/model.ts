import { dataset } from '../data/seedData';
import type { Report, ScenarioId } from '../domain/types';

export type Technique = 'dot' | 'bar' | 'table' | 'timeline' | 'line' | 'matrix';
export const STUDY_SCENARIOS: Record<
  ScenarioId,
  {
    title: string;
    context: string;
    question: string;
    techniques: Technique[];
    chartTitle: string;
    hint: string;
  }
> = {
  corroboration: {
    title: 'Reports at Cedar Junction',
    context:
      'Four sources describe cargo trucks near the same junction during one morning. Compare the quantities and source independence in their reports.',
    question: 'Which sources independently reported similar cargo-truck counts at Cedar Junction?',
    techniques: ['dot', 'bar', 'table'],
    chartTitle: 'Reported cargo-truck counts',
    hint: 'Each row represents one report. Intervals show source-reported ranges; points show reported estimates.',
  },
  conflict: {
    title: 'Reports at East Depot',
    context:
      'Four reports describe cargo trucks during the same East Depot episode. Examine how the source-reported quantities compare.',
    question: 'How do the cargo-truck counts differ across the East Depot reports?',
    techniques: ['dot', 'bar', 'table'],
    chartTitle: 'Reported cargo-truck counts',
    hint: 'Each row represents one report. A missing quantity is labeled “Unknown”; it is never plotted as zero.',
  },
  uncertain: {
    title: 'A report from North Ridge',
    context:
      'Reports about personnel near North Ridge were observed and received at different times. Compare the observation and receipt times for each source.',
    question:
      'How long after observation did the Field Report Liaison’s North Ridge report arrive?',
    techniques: ['timeline', 'bar', 'table'],
    chartTitle: 'Observation and receipt times',
    hint: 'All times use the same fictional exercise clock (UTC−04:00). Each row represents one report.',
  },
  anomaly: {
    title: 'A morning at Cedar Junction',
    context:
      'Vehicle observations were reported throughout a morning. Examine the number of reports and the number of distinct reporting sources in each hour.',
    question: 'Does the report volume establish increased vehicle activity at Cedar Junction?',
    techniques: ['line', 'bar', 'table'],
    chartTitle: 'Reports and reporting sources by hour',
    hint: 'Both series use one-hour observation windows. “Sources” counts distinct sources reporting in that hour.',
  },
  quality: {
    title: 'A translated report at Pine Crossing',
    context:
      'Several sources describe personnel near Pine Crossing. Inspect the translation and human-verification status of the Translation Review Desk report.',
    question: 'Was the Translation Review Desk’s translated personnel-count range human verified?',
    techniques: ['matrix', 'table'],
    chartTitle: 'Translation and verification by source',
    hint: 'Translation status and human verification are separate fields. Each row represents one report.',
  },
};
export const TECHNIQUE_LABELS: Record<Technique, string> = {
  dot: 'Range-and-dot plot',
  bar: 'Bar chart',
  table: 'Data table',
  timeline: 'Observation-to-receipt timeline',
  line: 'Line chart',
  matrix: 'Status matrix',
};
export const sourceName = (id: string) =>
  dataset.sources.find((s) => s.source_id === id)?.display_name ?? id;
export const scenarioReports = (scenario: ScenarioId) =>
  dataset.reports.filter((r) => r.scenario_id === scenario);
export const exerciseClock = (iso: string) => iso.slice(11, 16);
export function quantityLabel(r: Report) {
  if (r.reported_count === null) return 'Unknown';
  if (r.count_precision === 'range')
    return `${r.reported_count_lower}–${r.reported_count_upper} (range)`;
  if (r.count_precision === 'approximate') return `≈ ${r.reported_count}`;
  return String(r.reported_count);
}
export function reportRows(scenario: ScenarioId) {
  return scenarioReports(scenario).map((r) => ({
    report_id: r.report_id,
    source: sourceName(r.source_id),
    count: r.reported_count,
    lower: r.reported_count_lower,
    upper: r.reported_count_upper,
    quantity: quantityLabel(r),
    observed: exerciseClock(r.observed_at),
    received: exerciseClock(r.received_at),
    // A common fixed date preserves exercise-clock labels independently of the viewer's timezone.
    observed_plot: `2000-01-01T${exerciseClock(r.observed_at)}:00Z`,
    received_plot: `2000-01-01T${exerciseClock(r.received_at)}:00Z`,
    delay: r.receipt_delay_hours,
    independent: r.source_independent ? 'Independent' : 'Relayed',
    verification: r.human_verified ? 'Verified' : 'Not verified',
    translation:
      r.translation_status === 'machine'
        ? 'Machine translated'
        : r.translation_status === 'reviewed'
          ? 'Translation reviewed'
          : 'Original language',
  }));
}
export function frequencyRows() {
  const reports = scenarioReports('anomaly');
  const hours = reports.map((r) => Number(r.observed_at.slice(11, 13)));
  const rows: { hour: string; reports: number; sources: number }[] = [];
  for (let hour = Math.min(...hours); hour <= Math.max(...hours); hour++) {
    const inHour = reports.filter((r) => Number(r.observed_at.slice(11, 13)) === hour);
    rows.push({
      hour: `${String(hour).padStart(2, '0')}:00`,
      reports: inHour.length,
      sources: new Set(inHour.map((r) => r.source_id)).size,
    });
  }
  return rows;
}

export type StudyCondition = { scenario: ScenarioId; technique: Technique };
export function parseCondition(input: unknown): StudyCondition | null {
  if (!input || typeof input !== 'object') return null;
  const { scenario, technique } = input as Record<string, unknown>;
  if (typeof scenario !== 'string' || !Object.hasOwn(STUDY_SCENARIOS, scenario)) return null;
  const config = STUDY_SCENARIOS[scenario as ScenarioId];
  if (typeof technique !== 'string' || !config.techniques.includes(technique as Technique))
    return null;
  return { scenario: scenario as ScenarioId, technique: technique as Technique };
}

// Reproducible response ordering; the actual order is included with every submission.
export function orderAnswers(options: string[], seed: string) {
  let state =
    [...seed].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261) >>>
    0;
  const ordered = [...options];
  for (let i = ordered.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }
  return ordered;
}
