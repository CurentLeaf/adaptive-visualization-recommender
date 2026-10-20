import { TASKS } from '../../domain/constants';
import type { AnalyticTask, AudienceMode } from '../../domain/types';
import { formatSigned } from '../../lib/explanations';
import type { Sensitivity, WhatIfResult, WhatIfSubset } from '../../lib/whatIf';

export type WhatIfState = { task: AnalyticTask; audience: AudienceMode; subset: WhatIfSubset };

const SENSITIVITY_TEXT: Record<Sensitivity, string> = {
  none: 'No hypothetical change is set; the hypothetical run equals the active analysis.',
  context: 'Context sensitivity: only the task and/or audience differ; the evidence is the same.',
  evidence_subset:
    'Evidence-subset sensitivity: only the report subset differs; the task and audience are the same.',
  both: 'Both context and evidence subset differ; the isolated runs below separate their effects.',
};

const rankText = (rank: number | null) => (rank === null ? 'not eligible' : `#${rank}`);

export function WhatIfPanel({
  state,
  onChange,
  result,
  selectedReportId,
  onReset,
}: {
  state: WhatIfState;
  onChange: (next: WhatIfState) => void;
  result: WhatIfResult;
  selectedReportId?: string;
  onReset: () => void;
}) {
  const subset = state.subset;
  const setSubset = (patch: Partial<WhatIfSubset>) =>
    onChange({ ...state, subset: { ...subset, ...patch } });
  const topName = (r: WhatIfResult['current']) => r.ranked[0]?.title ?? 'No eligible chart';
  return (
    <section className="what-if" aria-labelledby="what-if-title">
      <h3 id="what-if-title">What-if comparison (hypothetical)</h3>
      <p className="help">
        Runs the actual recommender on hypothetical inputs. The active analysis, selected
        visualization, filters and evidence are not changed. Suitability is rule-based, not a
        probability or confidence. Fictional data only.
      </p>
      <div className="two-fields">
        <label className="field">
          Hypothetical task
          <select
            value={state.task}
            onChange={(event) => onChange({ ...state, task: event.target.value as AnalyticTask })}
          >
            {(Object.keys(TASKS) as AnalyticTask[]).map((task) => (
              <option key={task} value={task}>
                {TASKS[task].label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Hypothetical audience
          <select
            value={state.audience}
            onChange={(event) =>
              onChange({ ...state, audience: event.target.value as AudienceMode })
            }
          >
            <option value="Commander">Commander</option>
            <option value="Analyst">Analyst</option>
          </select>
        </label>
      </div>
      <fieldset className="what-if-subset">
        <legend>Hypothetical report subset (recorded metadata only)</legend>
        <label>
          <input
            type="checkbox"
            checked={subset.independentOnly}
            onChange={(event) => setSubset({ independentOnly: event.target.checked })}
          />{' '}
          Only reports recorded as source-independent
        </label>
        <label>
          <input
            type="checkbox"
            checked={subset.humanVerifiedOnly}
            onChange={(event) => setSubset({ humanVerifiedOnly: event.target.checked })}
          />{' '}
          Only reports with recorded human verification
        </label>
        <label>
          <input
            type="checkbox"
            disabled={!selectedReportId}
            checked={!!selectedReportId && subset.excludeReportIds.includes(selectedReportId)}
            onChange={(event) =>
              selectedReportId &&
              setSubset({
                excludeReportIds: event.target.checked
                  ? [...subset.excludeReportIds, selectedReportId]
                  : subset.excludeReportIds.filter((id) => id !== selectedReportId),
              })
            }
          />{' '}
          Exclude the selected report{selectedReportId ? ` (${selectedReportId})` : ''}
        </label>
      </fieldset>
      <div className="button-row">
        <button type="button" className="button secondary" onClick={onReset}>
          Reset hypothetical
        </button>
      </div>
      <p aria-live="polite" className="uncertainty-cautions">
        {SENSITIVITY_TEXT[result.sensitivity]}{' '}
        {result.rankingUnchanged
          ? 'The ranking is unchanged.'
          : result.topChanged
            ? 'The top-ranked chart changes.'
            : 'The top-ranked chart is unchanged, but lower ranks differ.'}
      </p>
      <p className="help">
        Reports: {result.currentReportCount} active vs {result.hypotheticalReportCount}{' '}
        hypothetical.
        {result.hypotheticalReportCount === 0 && ' The hypothetical subset is empty.'}
      </p>
      <div className="what-if-columns">
        {(['current', 'hypothetical'] as const).map((key) => (
          <div key={key}>
            <h4>{key === 'current' ? 'Current ranking' : 'Hypothetical ranking'}</h4>
            {result[key].ranked.length ? (
              <ol>
                {result[key].ranked.map((chart) => (
                  <li key={chart.id}>
                    {chart.title} — {chart.suitabilityScore} rule-based suitability
                  </li>
                ))}
              </ol>
            ) : (
              <p className="help">No eligible chart.</p>
            )}
          </div>
        ))}
      </div>
      {result.rankChanges.some((c) => c.currentRank !== c.hypotheticalRank) && (
        <ul>
          {result.rankChanges
            .filter((c) => c.currentRank !== c.hypotheticalRank)
            .map((c) => (
              <li key={c.id}>
                {c.title}: {rankText(c.currentRank)} → {rankText(c.hypotheticalRank)}
              </li>
            ))}
        </ul>
      )}
      {result.factorChanges.length > 0 && (
        <div>
          <h4>Factor differences (hypothetical minus current)</h4>
          <ul>
            {result.factorChanges.map((chart) => (
              <li key={chart.id}>
                {chart.title}:{' '}
                {chart.changes
                  .map(
                    (c) =>
                      `${c.label} ${formatSigned(c.current)} → ${formatSigned(c.hypothetical)} (${formatSigned(c.delta)})`,
                  )
                  .join('; ')}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.attribution && (
        <div>
          <h4>Separating the two effects</h4>
          <p>
            Context change only (same evidence): top is {topName(result.attribution.contextOnly)}.
            Evidence-subset change only (same context): top is{' '}
            {topName(result.attribution.subsetOnly)}.
          </p>
        </div>
      )}
    </section>
  );
}
