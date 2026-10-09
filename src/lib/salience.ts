import type { Report, SalienceResult, SalienceWeights } from '../domain/types';
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function scoreSalience(report: Report, weights: SalienceWeights): SalienceResult {
  const components = { relevance: clamp(report.importance_score), sourceConfidence: clamp(report.source_confidence), freshness: clamp(1 - report.report_age_hours / 96), impact: clamp(report.importance_score), disagreement: clamp(report.conflict_score), anomaly: clamp(report.anomaly_score) };
  const sum = Object.values(weights).reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const contributions = Object.fromEntries(Object.entries(components).map(([key, value]) => [key, value * Math.max(0, weights[key as keyof SalienceWeights]) / sum])) as SalienceResult['contributions'];
  const score = clamp(Object.values(contributions).reduce((a, b) => a + b, 0));
  const reasonCodes = [...report.reason_codes, ...(components.disagreement > 0.7 ? ['high_disagreement'] : []), ...(report.missingness_score > 0.5 ? ['incomplete_record'] : [])];
  return { score, components, contributions, reasonCodes: [...new Set(reasonCodes)], explanation: `Salience ${Math.round(score * 100)}/100 reflects attention priority, not truthfulness. Source confidence is ${Math.round(report.source_confidence * 100)}%; validation is ${Math.round(report.validation_score * 100)}% and remains separate.` };
}
