import type { Report } from '../domain/types';
export type AnalysisResult = {
  zScore: number | null;
  rollingMean: number | null;
  eventConflict: number;
  distinctSourceCount: number;
  clusterId: string;
  qualityFlags: string[];
};
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / (values.length || 1);
/** Transparent descriptive computations; no fitted or black-box model is involved. */
export function analyzeReports(reports: Report[]): Map<string, AnalysisResult> {
  const values = reports.map((r) => r.reported_value).filter((n): n is number => n !== null);
  const center = mean(values);
  const sd = Math.sqrt(mean(values.map((n) => (n - center) ** 2))) || 1;
  const byEvent = new Map<string, Report[]>();
  for (const report of reports)
    byEvent.set(report.event_id, [...(byEvent.get(report.event_id) ?? []), report]);
  const sorted = [...reports].sort((a, b) => a.report_time.localeCompare(b.report_time));
  const result = new Map<string, AnalysisResult>();
  sorted.forEach((report, index) => {
    const event = byEvent.get(report.event_id)!;
    const categories = new Set(event.map((r) => r.event_category));
    const regions = new Set(event.map((r) => r.region));
    const eventValues = event.map((r) => r.reported_value).filter((n): n is number => n !== null);
    const spread = eventValues.length
      ? (Math.max(...eventValues) - Math.min(...eventValues)) / 100
      : 0;
    const eventConflict = Math.min(
      1,
      ((categories.size - 1) / 3) * 0.4 + ((regions.size - 1) / 3) * 0.3 + spread * 0.3,
    );
    const windowStart = new Date(report.report_time).getTime() - 7 * 86400000;
    const windowValues = sorted
      .slice(0, index + 1)
      .filter((r) => new Date(r.report_time).getTime() >= windowStart && r.reported_value !== null)
      .map((r) => r.reported_value as number);
    const qualityFlags = [
      report.validation_score < 0.4 && 'low validation',
      report.missingness_score > 0.5 && 'incomplete',
      report.report_age_hours > 24 && 'delayed',
      report.translation_status === 'machine' && 'machine translated',
    ].filter((v): v is string => Boolean(v));
    result.set(report.report_id, {
      zScore:
        report.reported_value === null
          ? null
          : Math.round(((report.reported_value - center) / sd) * 100) / 100,
      rollingMean: windowValues.length ? Math.round(mean(windowValues) * 100) / 100 : null,
      eventConflict: Math.round(eventConflict * 100) / 100,
      distinctSourceCount: new Set(event.map((r) => r.source_id)).size,
      clusterId: `BIN-${report.event_category}-${report.reported_value === null ? 'unknown' : Math.floor(report.reported_value / 25)}`,
      qualityFlags,
    });
  });
  return result;
}
