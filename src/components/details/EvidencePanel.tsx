import type {
  AudienceMode,
  ModelOutput,
  ModelingRecommendation,
  Provenance,
  Report,
  SalienceResult,
  Source,
  Location,
  VisualizationRecommendation,
} from '../../domain/types';
import type { AnalysisResult } from '../../lib/analysis';

const percent = (value: number) => `${Math.round(value * 100)}%`;
const exerciseTime = (value: string) => value.slice(0, 10) + ' ' + value.slice(11, 16);
const reportedQuantity = (report: Report) => {
  if (report.count_precision === 'unknown' || report.reported_count === null) {
    return `Unknown ${report.count_unit} count; missing is not zero`;
  }
  if (report.count_precision === 'range') {
    return `Reported range ${report.reported_count_lower}–${report.reported_count_upper} ${report.count_unit} (source estimate, not a statistical interval)`;
  }
  if (report.count_precision === 'approximate') {
    return `Approximately ${report.reported_count} ${report.count_unit}`;
  }
  return `${report.reported_count} ${report.count_unit} (exact as reported, not independently verified)`;
};
const attributionText = (report: Report) => {
  if (report.actor_attribution_status === 'unknown') return 'Unknown; the source did not identify an actor';
  return `${report.reported_actor_name} — ${report.actor_attribution_status.replaceAll('_', ' ')}`;
};
const meanings: Record<string, string> = {
  source_confidence: 'Source-level confidence indicator; not report truth',
  validation_score: 'Synthetic validation/quality score',
  corroboration_count: 'Count of reports recorded as supporting',
  conflict_score: 'Synthetic report disagreement score',
  report_age_hours: 'Elapsed age at receipt, in hours',
  missingness_score: 'Synthetic incompleteness score',
  anomaly_score: 'Descriptive synthetic anomaly indicator',
  event_category: 'Synthetic report category',
  event_id: 'Synthetic event grouping identifier',
  report_id: 'Synthetic report identity',
  source_id: 'Synthetic source identity',
  report_time: 'Time associated with the synthetic report',
  day: 'Report time grouped to a day',
  report_count: 'Derived count of reports within category',
  mean_reported_value: 'Derived mean of reported values by day',
  mean_conflict_score: 'Derived mean of conflict scores by source and category',
  mean_uncertainty_lower: 'Derived mean of synthetic illustrative lower bounds',
  mean_uncertainty_upper: 'Derived mean of synthetic illustrative upper bounds',
  normalized_value: 'Position mapped to a fixed 0–1 display scale',
  verification_label: 'Verbal label derived from the human_verification field',
  reported_value: 'Value reported in the synthetic record',
  uncertainty_lower: 'Illustrative synthetic lower bound; not calibrated',
  uncertainty_upper: 'Illustrative synthetic upper bound; not calibrated',
  human_verified: 'Whether human verification is recorded',
};

function fieldEncoding(field: string, recommendation?: VisualizationRecommendation): string {
  if (!recommendation) return 'Not used by selected visualization';
  if (field === 'mean_reported_value') return 'Aggregate mean on y';
  if (field === 'mean_conflict_score') return 'Aggregate color';
  if (field === 'report_count') return 'Count on y';
  if (field === 'normalized_value') return 'Normalized position on y';
  const encodings = recommendation.visualEncodings;
  const matches = Object.entries(encodings).flatMap(([encoding, value]) =>
    Array.isArray(value)
      ? value.includes(field)
        ? [encoding]
        : []
      : typeof value === 'string' && value.includes(field)
        ? [encoding]
        : [],
  );
  return matches.length ? [...new Set(matches)].join(', ') : 'Tooltip or detail';
}

export function EvidencePanel({
  report,
  source,
  sources = [],
  relatedReports = [],
  location,
  provenance,
  output,
  analysis,
  salience,
  recommendation,
  modeling,
  audience = 'Analyst',
  onClose,
}: {
  report?: Report;
  source?: Source;
  sources?: Source[];
  relatedReports?: Report[];
  location?: Location;
  provenance?: Provenance;
  output?: ModelOutput;
  analysis?: AnalysisResult;
  salience?: SalienceResult;
  recommendation?: VisualizationRecommendation;
  modeling?: ModelingRecommendation;
  audience?: AudienceMode;
  onClose?: () => void;
}) {
  const verificationWarning = report && !report.human_verified;
  const conflictWarning = report && report.conflict_score >= 0.7;
  const missingWarning = report && report.missingness_score >= 0.5;
  const translationWarning = report && report.translation_status === 'machine';
  const modelFields = modeling?.inputFields ?? [];
  const mappedFields = recommendation?.fieldsUsed ?? [];
  const visualInputs = new Set(mappedFields);
  const inputRows = [...new Set([...modelFields, ...mappedFields])];
  const sourceNames = new Map(sources.map((item) => [item.source_id, item.display_name]));
  const stageStatus = provenance ? provenance.analyst_review_status : 'Not recorded.';
  const assumptions = recommendation?.assumptions.join(' ') ?? 'Not recorded.';

  return (
    <aside className="panel evidence" aria-labelledby="evidence-title">
      <div className="section-title">
        <h2 id="evidence-title">Evidence inspector</h2>
        {onClose && (
          <button className="button ghost" type="button" onClick={onClose}>
            Close evidence
          </button>
        )}
      </div>
      {!report ? (
        <p>
          Select a report using a chart or the accessible report table to inspect its evidence and
          provenance.
        </p>
      ) : (
        <>
          <div className="eyebrow">Synthetic source report · {report.report_id}</div>
          <h3>{report.report_title}</h3>
          <section className="inspector-section" aria-labelledby="reported-observation-title">
            <h4 id="reported-observation-title">1. Reported observation</h4>
            <p>{report.narrative_summary}</p>
            <dl className="detail-grid">
              <dt>Who, as attributed by source</dt>
              <dd>{attributionText(report)}</dd>
              <dt>What was reported</dt>
              <dd>{report.activity_description}</dd>
              <dt>Where</dt>
              <dd>
                {report.location_name} — {location?.description ?? 'Fictional exercise location'}
              </dd>
              <dt>Observation time</dt>
              <dd>{exerciseTime(report.observed_at)} ({'UTC−04:00 exercise time'})</dd>
              <dt>Report received</dt>
              <dd>
                {exerciseTime(report.received_at)} ·                 {report.receipt_delay_hours.toFixed(2)} exercise
                hours after observation
              </dd>
              <dt>Reported quantity</dt>
              <dd>{reportedQuantity(report)}</dd>
            </dl>
          </section>
          <section className="inspector-section" aria-labelledby="support-title">
            <h4 id="support-title">2. What supports or challenges it</h4>
            {relatedReports.length ? (
              <ul>
                {relatedReports.map((related) => (
                  <li key={related.report_id}>
                    {sourceNames.get(related.source_id) ?? 'Unnamed source'}: {related.report_title}
                    {' — '}
                    {related.reported_count === null
                      ? `unknown ${related.count_unit} count`
                      : `${related.count_precision.replaceAll('_', ' ')} count ${related.reported_count} ${related.count_unit}`}
                    ; observed {exerciseTime(related.observed_at)};{' '}
                    {related.source_independent && !related.derived_from_report_id
                      ? 'source marked independent'
                      : 'not independent corroboration'}.
                  </li>
                ))}
              </ul>
            ) : (
              <p>No related report is recorded for this observation episode.</p>
            )}
            <p>{report.comparison_notes}</p>
            <p>
              {report.corroboration_count} independent, non-derived report
              {report.corroboration_count === 1 ? '' : 's'} with similar recorded quantities are
              linked. This does not mean the observations describe distinct items.
            </p>
          </section>
          <section className="inspector-section" aria-labelledby="uncertainty-title">
            <h4 id="uncertainty-title">3. Uncertainty</h4>
            <div className="uncertainty-cautions" role="note">
              <p>Actor attribution: {attributionText(report)}.</p>
              <p>Quantity precision: {report.count_precision.replaceAll('_', ' ')}.</p>
              <p>
                Validation: {report.validation_status.replaceAll('_', ' ')} (
                {percent(report.validation_score)} score).
              </p>
              <p>Missing information score: {percent(report.missingness_score)}.</p>
              <p>
                Translation: {report.translation_status}; human verification:{' '}
                {report.human_verified ? 'recorded' : 'not recorded'}.
                {translationWarning ? ' The translated quantity remains unverified.' : ''}
              </p>
              <p>
                Freshness is measured from observation to the fixed exercise reference time
                (2035-04-02 12:00, UTC−04:00): {report.report_age_hours.toFixed(1)} exercise hours.
              </p>
              {conflictWarning && (
                <p>Recorded conflict indicator: {percent(report.conflict_score)}.</p>
              )}
              {verificationWarning && <p>Human verification is not recorded.</p>}
              {missingWarning && <p>Some expected report information is missing.</p>}
            </div>
          </section>
          <section className="inspector-section" aria-labelledby="source-history-title">
            <h4 id="source-history-title">4. Source and processing history</h4>
            <p>
              {source?.display_name ?? 'Source name not recorded'} ·{' '}
              {source?.source_type ?? 'Source type not recorded'} · source ID {report.source_id}
            </p>
            <p>
              Source confidence: {percent(report.source_confidence)} (source-level measure; not
              truth verification). Validation and confidence remain separate.
            </p>
            <p>
              Observation: {exerciseTime(report.observed_at)} · received:{' '}
              {exerciseTime(report.received_at)} · review:{' '}
              {provenance?.analyst_review_status ?? 'Not recorded'}.
            </p>
            <ol>
              {(provenance?.provenance_chain ?? []).map((stage, index) => (
                <li key={`${index}-${stage}`}>{stage}</li>
              ))}
            </ol>
          </section>
          <details className="technical-details" open={audience === 'Analyst'}>
            <summary>5. Technical details, analysis, and mappings</summary>
            <dl className="detail-grid">
              <dt>Internal event ID</dt>
              <dd>{report.event_id}</dd>
              <dt>Internal report ID</dt>
              <dd>{report.report_id}</dd>
              <dt>Corroboration count</dt>
              <dd>{report.corroboration_count} similar, independent report(s); not item totals</dd>
              <dt>Conflict</dt>
              <dd>{percent(report.conflict_score)} — source-reported disagreement indicator</dd>
              <dt>Salience</dt>
              <dd>{salience ? percent(salience.score) : 'Unknown'} — attention priority only</dd>
              <dt>Illustrative model bounds</dt>
              <dd>
                {output?.uncertainty_lower !== null && output?.uncertainty_lower !== undefined &&
                output?.uncertainty_upper !== null && output?.uncertainty_upper !== undefined
                  ? `${output.uncertainty_lower}–${output.uncertainty_upper}`
                  : 'Not recorded for unknown quantities'} — synthetic illustration, not a statistical interval
              </dd>
              <dt>Z-score</dt>
              <dd>{analysis?.zScore ?? 'Unknown'} — descriptive, not confidence</dd>
              <dt>Event disagreement</dt>
              <dd>{analysis ? percent(analysis.eventConflict) : 'Unknown'}</dd>
              <dt>Distinct sources</dt>
              <dd>{analysis?.distinctSourceCount ?? 'Unknown'} for this event</dd>
              <dt>Quality flags</dt>
              <dd>{analysis?.qualityFlags.join(', ') || 'None recorded'}</dd>
            </dl>
            <p className="notice-text">
              High salience means attention priority, not verified truth.
            </p>
          <details open={audience === 'Analyst'}>
            <summary>Level 3 · Inputs and visual mapping</summary>
            <p className="help">
              Available dataset fields are listed separately in Dataset profile. Modeling inputs and
              selected visualization inputs below are deduplicated; the table lists fields used by
              either method.
            </p>
            <p>
              <strong>Modeling inputs:</strong> {modelFields.join(', ') || 'Not recorded'}.
            </p>
            <p>
              <strong>Modeling outputs:</strong>{' '}
              {modeling?.outputFields.join(', ') || 'Not recorded'}.
            </p>
            <p>
              <strong>Visualization inputs:</strong>{' '}
              {mappedFields.length ? mappedFields.join(', ') : 'No visualization selected.'}
            </p>
            {recommendation && (
              <p>
                <strong>Required:</strong> {recommendation.requiredInputFields.join(', ')}.{' '}
                <strong>Optional:</strong> {recommendation.optionalInputFields.join(', ') || 'None'}
                .
              </p>
            )}
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Field</th>
                    <th scope="col">Meaning</th>
                    <th scope="col">Origin</th>
                    <th scope="col">Visual encoding</th>
                    <th scope="col">Missing-data handling</th>
                  </tr>
                </thead>
                <tbody>
                  {inputRows.map((field) => (
                    <tr key={field}>
                      <th scope="row">{field}</th>
                      <td>
                        {meanings[field] ?? 'Synthetic or derived field; definition not recorded'}
                      </td>
                      <td>
                        {['uncertainty_lower', 'uncertainty_upper'].includes(field)
                          ? 'Synthetic model output'
                          : [
                                'day',
                                'report_count',
                                'mean_reported_value',
                                'mean_conflict_score',
                                'normalized_value',
                                'mean_uncertainty_lower',
                                'mean_uncertainty_upper',
                              ].includes(field)
                            ? 'Derived'
                            : 'Raw synthetic field'}
                      </td>
                      <td>
                        {visualInputs.has(field)
                          ? fieldEncoding(field, recommendation)
                          : 'Modeling input only'}
                      </td>
                      <td>
                        {field === 'reported_value' || field.startsWith('uncertainty_')
                          ? 'Missing remains unknown; not replaced with zero'
                          : 'Not recorded for this field'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details open={audience === 'Analyst'}>
            <summary>Level 3 · Data provenance and processing trail</summary>
            <p className="help">
              Recorded pipeline metadata is shown as recorded. A visualization explanation is not
              evidence that a report is true.
            </p>
            <ol className="stage-trail">
              <li>
                <strong>1. Synthetic source/observation</strong>
                <dl>
                  <dt>Inputs</dt>
                  <dd>{source?.source_id ?? 'Not recorded'}</dd>
                  <dt>Operation</dt>
                  <dd>
                    {source
                      ? `${source.collection_method}; fictional ${report.event_category.toLowerCase()} observation`
                      : 'Not recorded'}
                  </dd>
                  <dt>Outputs</dt>
                  <dd>
                    {report.report_id}, {report.event_id}
                  </dd>
                  <dt>Timestamp/version</dt>
                  <dd>Not recorded</dd>
                  <dt>Review status</dt>
                  <dd>{stageStatus}</dd>
                  <dt>Assumptions/warnings</dt>
                  <dd>Synthetic observation only; it does not establish real-world truth.</dd>
                </dl>
              </li>
              <li>
                <strong>2. Ingestion</strong>
                <dl>
                  <dt>Inputs</dt>
                  <dd>{report.report_id}</dd>
                  <dt>Operation</dt>
                  <dd>
                    {provenance?.ingest_time
                      ? 'Recorded ingestion time associated with received report.'
                      : 'Not recorded'}
                  </dd>
                  <dt>Outputs</dt>
                  <dd>{report.received_time || 'Not recorded'}</dd>
                  <dt>Timestamp/version</dt>
                  <dd>{provenance?.ingest_time ?? 'Not recorded'}</dd>
                  <dt>Review status</dt>
                  <dd>{stageStatus}</dd>
                  <dt>Assumptions/warnings</dt>
                  <dd>No missing ingestion metadata is inferred.</dd>
                </dl>
              </li>
              <li>
                <strong>3. Validation and quality checks</strong>
                <dl>
                  <dt>Inputs</dt>
                  <dd>
                    source_confidence, validation_score, conflict_score, missingness_score,
                    translation_status
                  </dd>
                  <dt>Operation</dt>
                  <dd>
                    Stored synthetic indicators and available quality flags; no truth verification.
                  </dd>
                  <dt>Outputs</dt>
                  <dd>
                    validation_score, human_verified,{' '}
                    {analysis?.qualityFlags.join(', ') || 'quality flags none recorded'}
                  </dd>
                  <dt>Timestamp/version</dt>
                  <dd>Not recorded</dd>
                  <dt>Review status</dt>
                  <dd>{provenance?.analyst_review_status ?? 'Not recorded'}</dd>
                  <dt>Assumptions/warnings</dt>
                  <dd>These distinct measures are not combined into a trust score.</dd>
                </dl>
              </li>
              <li>
                <strong>4. Transformation or aggregation</strong>
                <dl>
                  <dt>Inputs</dt>
                  <dd>
                    {report.report_id}, {provenance?.source_id ?? 'Not recorded'}
                  </dd>
                  <dt>Operation</dt>
                  <dd>{provenance?.transformation_step ?? 'Not recorded'}</dd>
                  <dt>Outputs</dt>
                  <dd>{report.report_id} normalized synthetic record</dd>
                  <dt>Timestamp/version</dt>
                  <dd>{provenance ? `Version ${provenance.version}` : 'Not recorded'}</dd>
                  <dt>Review status</dt>
                  <dd>{stageStatus}</dd>
                  <dt>Assumptions/warnings</dt>
                  <dd>{provenance?.provenance_chain.join('; ') ?? 'Not recorded'}</dd>
                </dl>
              </li>
              <li>
                <strong>5. Analysis/model calculation</strong>
                <dl>
                  <dt>Inputs</dt>
                  <dd>
                    {modeling?.inputFields.join(', ') || 'Not recorded'}; analysis utility fields:
                    reported_value, report_time, event_id, event_category, region, source_id,
                    validation_score, missingness_score, report_age_hours, translation_status.
                  </dd>
                  <dt>Operation</dt>
                  <dd>
                    {analysis
                      ? 'Descriptive scenario z-score, seven-day rolling mean, event disagreement, and quality flags.'
                      : 'Not recorded'}
                  </dd>
                  <dt>Outputs</dt>
                  <dd>
                    {modeling?.outputFields.join(', ') || 'Not recorded'}; analysis utility outputs:
                    z_score, rolling_mean, event_conflict, distinct_source_count, quality_flags.
                    {output
                      ? ` Synthetic model output: illustrative bounds ${output.uncertainty_lower}–${output.uncertainty_upper}.`
                      : ''}
                  </dd>
                  <dt>Timestamp/version</dt>
                  <dd>
                    {provenance
                      ? `Source provenance version ${provenance.version}; model timestamp not recorded.`
                      : 'Not recorded'}
                  </dd>
                  <dt>Review status</dt>
                  <dd>Not recorded</dd>
                  <dt>Assumptions/warnings</dt>
                  <dd>
                    Descriptive synthetic outputs; bounds are not statistically calibrated
                    intervals.
                  </dd>
                </dl>
              </li>
              <li>
                <strong>6. Visualization mapping</strong>
                <dl>
                  <dt>Inputs</dt>
                  <dd>{recommendation?.fieldsUsed.join(', ') ?? 'Not recorded'}</dd>
                  <dt>Operation</dt>
                  <dd>
                    {recommendation
                      ? `${recommendation.technique}; ${recommendation.rationale[0]}`
                      : 'Not recorded'}
                  </dd>
                  <dt>Outputs</dt>
                  <dd>
                    {recommendation?.derivedOutputFields.join(', ') || 'No derived output recorded'}
                  </dd>
                  <dt>Timestamp/version</dt>
                  <dd>Not recorded</dd>
                  <dt>Review status</dt>
                  <dd>Not recorded</dd>
                  <dt>Assumptions/warnings</dt>
                  <dd>{assumptions}</dd>
                </dl>
              </li>
            </ol>
          </details>
          <details>
            <summary>Level 4 · Salience scoring breakdown</summary>
            <p>
              {salience?.explanation ?? 'Not recorded'} High salience means attention priority, not
              verified truth.
            </p>
            <div className="component-list">
              {salience &&
                Object.entries(salience.components).map(([key, value]) => (
                  <div key={key}>
                    <span>{key.replace(/([A-Z])/g, ' $1')}</span>
                    <meter min="0" max="1" value={value}>
                      {percent(value)}
                    </meter>
                    <strong>{percent(value)}</strong>
                  </div>
                ))}
            </div>
          </details>
          <details>
            <summary>Visualization rationale and suitability score</summary>
            {recommendation ? (
              <>
                <h3>{recommendation.title}</h3>
                <p>
                  <strong>Technique:</strong> {recommendation.technique}. <strong>Unit:</strong>{' '}
                  {recommendation.unitOfAnalysis}.
                </p>
                <p>
                  Visualization suitability: {recommendation.suitabilityScore}/100. Rule-based fit
                  score, not report confidence.
                </p>
                <ul>
                  {Object.entries(recommendation.scoreBreakdown).map(([key, value]) => (
                    <li key={key}>
                      {key.replace(/[A-Z]/g, ' $&')}: {value >= 0 ? '+' : ''}
                      {value}
                    </li>
                  ))}
                </ul>
                <p>{recommendation.rationale.join(' ')}</p>
                <h3>Assumptions and limitations</h3>
                <ul>
                  {[...recommendation.assumptions, ...recommendation.cautions].map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p>No compatible visualization is available for the current fields.</p>
            )}
          </details>
          </details>
        </>
      )}
    </aside>
  );
}
