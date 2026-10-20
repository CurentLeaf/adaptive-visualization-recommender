import type { Provenance, Report } from '../domain/types';

export type CellState = 'known' | 'unknown' | 'not_recorded' | 'not_applicable';
export type QualityCell = { state: CellState; text: string };

export const QUALITY_DIMENSIONS = [
  'count',
  'translation',
  'humanReview',
  'independence',
  'observationAge',
  'reportingDelay',
] as const;
export type QualityDimension = (typeof QUALITY_DIMENSIONS)[number];

export const QUALITY_DIMENSION_LABELS: Record<QualityDimension, string> = {
  count: 'Count availability & precision',
  translation: 'Translation status',
  humanReview: 'Human review',
  independence: 'Source independence',
  observationAge: 'Observation age',
  reportingDelay: 'Reporting delay',
};

export type EvidenceQualityRow = {
  reportId: string;
  title: string;
  cells: Record<QualityDimension, QualityCell>;
  provenanceStages: number | null;
  provenanceNote: string;
};

const hours = (value: number) => `${Math.round(value * 10) / 10} h`;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function countCell(report: Report): QualityCell {
  if (report.count_precision === 'unknown' || report.reported_count === null) {
    return { state: 'unknown', text: `Unknown ${report.count_unit} count (not zero)` };
  }
  if (report.count_precision === 'range') {
    return finite(report.reported_count_lower) && finite(report.reported_count_upper)
      ? {
          state: 'known',
          text: `Range ${report.reported_count_lower}–${report.reported_count_upper} ${report.count_unit} (source estimate)`,
        }
      : { state: 'not_recorded', text: 'Range bounds not recorded' };
  }
  const precision = report.count_precision === 'approximate' ? 'approximate' : 'exact as reported';
  return { state: 'known', text: `${report.reported_count} ${report.count_unit} (${precision})` };
}

export function buildEvidenceQualityRows(
  reports: Report[],
  provenance: Provenance[],
  exerciseAsOfTime?: string,
): EvidenceQualityRow[] {
  const provenanceById = new Map(provenance.map((entry) => [entry.report_id, entry]));
  const asOf = exerciseAsOfTime ? Date.parse(exerciseAsOfTime) : NaN;
  return reports.map((report) => {
    const trail = provenanceById.get(report.report_id);
    const observed = Date.parse(report.observed_at);
    const received = Date.parse(report.received_at);
    const delay = finite(report.receipt_delay_hours)
      ? report.receipt_delay_hours
      : Number.isFinite(observed) && Number.isFinite(received)
        ? (received - observed) / 3_600_000
        : null;
    const age =
      Number.isFinite(asOf) && Number.isFinite(observed) ? (asOf - observed) / 3_600_000 : null;
    const cells: Record<QualityDimension, QualityCell> = {
      count: countCell(report),
      translation:
        report.translation_status === 'original'
          ? { state: 'not_applicable', text: 'Not applicable (original)' }
          : {
              state: 'known',
              text:
                report.translation_status === 'machine'
                  ? 'Machine translated'
                  : 'Translation reviewed',
            },
      humanReview: report.human_verified
        ? { state: 'known', text: 'Human review recorded' }
        : { state: 'not_recorded', text: 'No human review recorded' },
      independence:
        typeof report.source_independent === 'boolean'
          ? {
              state: 'known',
              text: report.source_independent
                ? 'Recorded as independent'
                : 'Recorded as not independent',
            }
          : { state: 'not_recorded', text: 'Not recorded' },
      observationAge:
        age === null
          ? { state: 'unknown', text: 'Unknown' }
          : { state: 'known', text: `${hours(age)} before exercise as-of time` },
      reportingDelay:
        delay === null
          ? { state: 'unknown', text: 'Unknown' }
          : { state: 'known', text: `${hours(delay)} from observation to receipt` },
    };
    return {
      reportId: report.report_id,
      title: report.report_title,
      cells,
      provenanceStages: trail ? trail.provenance_chain.length : null,
      provenanceNote: trail
        ? `${trail.provenance_chain.length} recorded stage(s); review: ${trail.analyst_review_status}`
        : 'No provenance record',
    };
  });
}
