import type { VisualizationRecommendation } from '../../domain/types';
import {
  SUITABILITY_CAVEAT,
  compareFactors,
  formatSigned,
  type DecisionStep,
} from '../../lib/explanations';

const MAX_FACTOR = 22;

function FactorBar({ value }: { value: number }) {
  const width = `${Math.min(100, (Math.abs(value) / MAX_FACTOR) * 100)}%`;
  const kind = value < 0 ? 'penalty' : value > 0 ? 'contribution' : 'zero';
  return (
    <span className="factor-cell">
      <span className="factor-track" aria-hidden="true">
        <span className={`factor-bar ${kind}`} style={{ width }} />
      </span>
      <span className={`factor-value ${kind}`}>
        {formatSigned(value)}
        <span className="visually-hidden">
          {value < 0 ? ' (penalty)' : value > 0 ? ' (contribution)' : ' (no contribution)'}
        </span>
      </span>
    </span>
  );
}

export function FactorComparisonView({
  recommendations,
}: {
  recommendations: VisualizationRecommendation[];
}) {
  const comparison = compareFactors(recommendations, 3);
  if (!comparison.charts.length) return null;
  const [winner, runnerUp] = comparison.charts;
  return (
    <section className="factor-comparison" aria-labelledby="factor-comparison-title">
      <h3 id="factor-comparison-title">Recommendation factor comparison</h3>
      <p className="help">
        {SUITABILITY_CAVEAT} Values come from the engine’s scoreBreakdown; green bars are positive
        contributions and red bars are negative penalties.
      </p>
      <div className="tablewrap">
        <table>
          <caption className="visually-hidden">
            Signed factor values for the selected recommendation and closest alternatives
          </caption>
          <thead>
            <tr>
              <th scope="col">Factor</th>
              {comparison.charts.map((chart) => (
                <th scope="col" key={chart.id}>
                  #{chart.rank} {chart.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.factor} className={row.differs ? 'factor-differs' : undefined}>
                <th scope="row">{row.label}</th>
                {row.values.map((value, index) => (
                  <td key={comparison.charts[index].id}>
                    <FactorBar value={value} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{`Rule-based suitability (sum)`}</th>
              {comparison.charts.map((chart) => (
                <td key={chart.id}>{chart.suitabilityScore}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {runnerUp ? (
        <div className="factor-differences">
          <h4>
            Why #{winner.rank} ranks {comparison.tied ? 'equal to' : 'above'} #{runnerUp.rank}
          </h4>
          <p>
            Rule-based suitability difference:{' '}
            <strong>{formatSigned(comparison.scoreDifference ?? 0)}</strong>
            {comparison.tied ? ' (tied; curated candidate order breaks the tie)' : ''}.
          </p>
          {comparison.winnerVsRunnerUp.length ? (
            <ul>
              {comparison.winnerVsRunnerUp.map((row) => (
                <li key={row.factor}>
                  {row.label}: {formatSigned(row.values[0])} vs {formatSigned(row.values[1])} (
                  {formatSigned(row.deltaVsRunnerUp ?? 0)} for the higher-ranked chart)
                </li>
              ))}
            </ul>
          ) : (
            <p>No factor differs between these two charts.</p>
          )}
          {comparison.sharedFactors.length > 0 && (
            <p className="help">
              Shared, non-differentiating factors:{' '}
              {comparison.sharedFactors.map((row) => row.label).join(', ')}.
            </p>
          )}
        </div>
      ) : (
        <p className="help">Only one eligible chart; there is no alternative to compare.</p>
      )}
    </section>
  );
}

export function DecisionPathView({ steps }: { steps: DecisionStep[] }) {
  return (
    <section className="decision-path" aria-labelledby="decision-path-title">
      <h3 id="decision-path-title">Decision path</h3>
      <p className="help">
        Each step is derived from the recommender’s rules and inputs. It is not hidden AI reasoning.
      </p>
      <ol>
        {steps.map((step) => (
          <li key={step.id}>
            <details>
              <summary>
                <strong>{step.label}</strong> — {step.summary}
              </summary>
              <ul>
                {step.details.map((detail, index) => (
                  <li key={`${index}-${detail}`}>{detail}</li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
