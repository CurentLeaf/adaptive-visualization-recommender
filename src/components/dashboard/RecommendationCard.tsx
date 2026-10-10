import type { VisualizationRecommendation } from '../../domain/types';

const feedbackReasons = [
  'Fits the task',
  'Too complex for a brief',
  'Too simple for analysis',
  'Does not show uncertainty clearly',
  'Does not fit the available data',
];

function insightFocus(pattern: VisualizationRecommendation['chartPattern']): string {
  if (['line', 'area'].includes(pattern)) return 'Trend';
  if (['map', 'heatmap'].includes(pattern)) return 'Spatial pattern';
  if (['error_bar', 'error_band', 'scatter', 'parallel_coordinates'].includes(pattern)) {
    return 'Uncertainty and evidence';
  }
  if (pattern === 'observation_timeline') return 'Timing and provenance';
  if (pattern === 'dot_plot' || pattern === 'bar' || pattern === 'faceted_view') {
    return 'Comparison';
  }
  return 'Evidence detail';
}

function Preview({ pattern }: { pattern: VisualizationRecommendation['chartPattern'] }) {
  const focus = insightFocus(pattern);
  return (
    <svg
      className="recommendation-preview"
      viewBox="0 0 180 72"
      role="img"
      aria-label={`${focus} chart preview`}
    >
      <path d="M16 8v50h152" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
      {focus === 'Trend' ? (
        <>
          <path d="M23 47 55 38 84 43 112 23 157 16" fill="none" stroke="#315f9d" strokeWidth="3" />
          <path
            d="M23 54 55 44 84 51 112 31 157 25"
            fill="none"
            stroke="#93b7dd"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        </>
      ) : focus === 'Spatial pattern' ? (
        <>
          <circle cx="52" cy="40" r="5" fill="#315f9d" />
          <circle cx="78" cy="25" r="5" fill="#5283b7" />
          <circle cx="108" cy="45" r="5" fill="#b97712" />
          <circle cx="139" cy="19" r="5" fill="#315f9d" />
        </>
      ) : focus === 'Uncertainty and evidence' ? (
        <>
          {[42, 73, 104, 135].map((x, index) => (
            <g key={x}>
              <path d={`M${x} ${18 + (index % 2) * 8}v28`} stroke="#7e9fbe" strokeWidth="3" />
              <circle cx={x} cy={31 + (index % 2) * 8} r="4" fill="#315f9d" />
            </g>
          ))}
        </>
      ) : focus === 'Timing and provenance' ? (
        <>
          {[24, 54, 87, 119, 151].map((x, index) => (
            <g key={x}>
              <path d={`M${x} 20v30`} stroke="#cbd5e1" strokeWidth="2" />
              <circle cx={x} cy={index % 2 ? 37 : 23} r="4" fill="#315f9d" />
            </g>
          ))}
        </>
      ) : (
        <>
          {[36, 65, 94, 123, 151].map((x, index) => (
            <rect
              key={x}
              x={x}
              y={18 + ((index * 13) % 21)}
              width="9"
              height={38 - ((index * 7) % 19)}
              rx="2"
              fill={index === 2 ? '#b97712' : '#5283b7'}
            />
          ))}
        </>
      )}
    </svg>
  );
}

export function RecommendationCard({
  recommendation,
  active,
  feedbackReason,
  lastDecision,
  snapshotDisabled,
  onFeedbackReasonChange,
  onFeedback,
  onOpen,
  onSnapshot,
  onDuplicate,
}: {
  recommendation: VisualizationRecommendation;
  active: boolean;
  feedbackReason: string;
  lastDecision?: 'useful' | 'not_useful';
  snapshotDisabled: boolean;
  onFeedbackReasonChange: (reason: string) => void;
  onFeedback: (decision: 'useful' | 'not_useful') => void;
  onOpen: () => void;
  onSnapshot: () => void;
  onDuplicate: () => void;
}) {
  const rankingFactors = Object.entries(recommendation.scoreBreakdown)
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
    .slice(0, 3)
    .map(([factor, score]) => `${factor.replace(/([A-Z])/g, ' $1')} +${score}`)
    .join(' · ');
  return (
    <article className={`rec-card ${active ? 'active' : ''}`}>
      <div className="rec-top">
        <span>
          #{recommendation.rank} · {recommendation.title}
        </span>
        <strong>{recommendation.suitabilityScore}/100</strong>
      </div>
      <Preview pattern={recommendation.chartPattern} />
      <p className="rec-focus">
        <span className="pill">{insightFocus(recommendation.chartPattern)}</span>
        {active && <strong>Currently active</strong>}
      </p>
      <p>{recommendation.rationale[0]}</p>
      <small>
        {recommendation.technique} · {recommendation.modelingTechnique}
      </small>
      <details>
        <summary>Why this recommendation?</summary>
        <p>
          <strong>Question:</strong> {recommendation.answersQuestion}
        </p>
        <ul>
          {recommendation.rationale.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <p>
          <strong>Fields:</strong> {recommendation.fieldsUsed.join(', ')}.
        </p>
        <p>
          <strong>Limitations:</strong> {recommendation.doesNotEstablish}
        </p>
        <p>
          <strong>Fit score:</strong> {recommendation.suitabilityScore}/100; not a measure of report
          confidence.
        </p>
        <p>
          <strong>Largest scoring factors:</strong> {rankingFactors}.
        </p>
      </details>
      <div className="button-row rec-actions">
        <button className="button secondary" type="button" onClick={onOpen}>
          Open in analysis view
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={snapshotDisabled}
          title={
            snapshotDisabled
              ? 'Select this visualization before exporting its snapshot.'
              : undefined
          }
          onClick={onSnapshot}
        >
          Snapshot for brief
        </button>
        <button className="button ghost" type="button" onClick={onDuplicate}>
          Duplicate &amp; modify
        </button>
        <button className="button primary full" type="button" disabled={active} onClick={onOpen}>
          Use this visualization
        </button>
      </div>
      <div className="rec-feedback">
        <label className="field">
          <span>Feedback reason</span>
          <select
            value={feedbackReason}
            onChange={(event) => onFeedbackReasonChange(event.target.value)}
          >
            {feedbackReasons.map((reason) => (
              <option key={reason}>{reason}</option>
            ))}
          </select>
        </label>
        <div className="button-row">
          <button
            className="button ghost"
            type="button"
            aria-pressed={lastDecision === 'useful'}
            onClick={() => onFeedback('useful')}
          >
            Useful
          </button>
          <button
            className="button ghost"
            type="button"
            aria-pressed={lastDecision === 'not_useful'}
            onClick={() => onFeedback('not_useful')}
          >
            Not useful
          </button>
        </div>
      </div>
    </article>
  );
}
