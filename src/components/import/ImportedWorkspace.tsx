import { useCallback, useMemo, useState } from 'react';
import type { AudienceMode } from '../../domain/types';
import { VegaChart } from '../charts/VegaChart';
import { recommend } from '../../lib/recommendationEngine';
import { buildNormalizedExport, downloadText, EXPORT_WARNING } from '../../imported/exporters';
import {
  EMPTY_FILTERS,
  FACETS,
  applyFilters,
  facetCounts,
  type FacetKey,
  type FactFilters,
} from '../../imported/grouping';
import { prepareImported } from '../../imported/profile';
import { epochOf, parseTimestamp } from '../../imported/timestamps';
import { fieldOf } from '../../imported/temporal';
import type { ImportedDataset, ImportedFact, ImportedSettings } from '../../imported/types';
import { InterpretationSettings } from './InterpretationSettings';
import {
  DeductionSearch,
  FactEvidence,
  FactTable,
  SnapshotView,
  SupersessionView,
} from './ImportedViews';

/**
 * Imported-data workspace. It is mounted per dataset (keyed by the caller), so switching datasets
 * discards filters and fact/chart selections. It never writes to the research evaluation or
 * feedback logs, and never persists imported values.
 */
export function ImportedWorkspace({
  dataset,
  audience,
  onSettingsChange,
  onClear,
}: {
  dataset: ImportedDataset;
  audience: AudienceMode;
  onSettingsChange: (settings: ImportedSettings) => void;
  onClear: () => void;
}) {
  const analyst = audience === 'Analyst';
  const ctx = useMemo(() => prepareImported(dataset), [dataset]);
  const [filters, setFilters] = useState<FactFilters>(EMPTY_FILTERS);
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [sortBy, setSortBy] = useState<'fact_id' | 'timestamp'>('fact_id');
  const [selectedFactId, setSelectedFactId] = useState('');
  const [activeId, setActiveId] = useState('');
  const [numericUnit, setNumericUnit] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const field = dataset.settings.temporal.timestampField;
  const fromMs = timeFrom
    ? epochOf({ state: 'value', raw: timeFrom, parsed: parseTimestamp(timeFrom) })
    : null;
  const toMs = timeTo
    ? epochOf({ state: 'value', raw: timeTo, parsed: parseTimestamp(timeTo) })
    : null;
  const timeInvalid = (!!timeFrom && fromMs === null) || (!!timeTo && toMs === null);

  const metas = useMemo(() => {
    const filtered = applyFilters(ctx.metas, filters);
    if (fromMs === null && toMs === null) return filtered;
    return filtered.filter((m) => {
      const t = epochOf(fieldOf(m.fact, field));
      return t !== null && (fromMs === null || t >= fromMs) && (toMs === null || t <= toMs);
    });
  }, [ctx, filters, fromMs, toMs, field]);
  const facts = useMemo(() => metas.map((m) => m.fact), [metas]);
  const counts = useMemo(() => facetCounts(ctx.metas, filters), [ctx, filters]);
  const factById = useMemo(() => new Map(dataset.facts.map((f) => [f.factId, f])), [dataset]);

  const result = useMemo(
    () =>
      recommend({
        dataset: 'imported',
        context: ctx,
        facts,
        audience,
        numericUnit: numericUnit || undefined,
      }),
    [ctx, facts, audience, numericUnit],
  );
  const active = result.ranked.find((r) => r.id === activeId) ?? result.ranked[0];
  const selectedFact: ImportedFact | undefined = factById.get(selectedFactId);

  // Chart marks carry the original fact_id; the exact fact is selected, never a lookalike.
  const onSelectDatum = useCallback(
    (datum: Record<string, unknown>) => {
      const id = datum.fact_id;
      if (typeof id === 'string' && factById.has(id)) setSelectedFactId(id);
    },
    [factById],
  );

  const toggleFacet = (key: FacetKey, value: string) =>
    setFilters((old) => {
      const current = old.facets[key] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...old, facets: { ...old.facets, [key]: next } };
    });

  const unresolved = {
    temporal: ctx.diagnostics.issues.filter((i) => i.severity === 'warning').length,
    dangling: ctx.evidence.dangling.length,
    conflicts: ctx.evidence.conflictedFactIds.size,
    collisions: dataset.collisions.length,
    excluded: dataset.excluded.filter((e) => e.code !== 'unsupported_file').length,
  };
  const hasUnresolved = Object.values(unresolved).some((n) => n > 0);
  const facetKeys = analyst
    ? FACETS
    : FACETS.filter((f) => ['topic', 'predicate', 'currentFlag', 'evidence'].includes(f.key));
  const unitGroups = result.artifacts.numeric.unitGroups;

  return (
    <div className="imported-workspace" aria-label="Imported data workspace" role="region">
      <section className="panel">
        <div className="eyebrow">IMPORTED DATA · BROWSER-LOCAL · IN MEMORY</div>
        <h2>{dataset.label}</h2>
        <p className="help">
          {dataset.synthetic ? 'Synthetic test data. ' : 'Not labeled synthetic. '}
          {dataset.facts.length} fact(s), {dataset.deductions.length} deduction(s). Imported records
          are not Cedar Watch reports and are not saved or sent anywhere.
        </p>
        {hasUnresolved && (
          <div className="warning" role="alert" style={{ maxWidth: 'none' }}>
            Unresolved data: {unresolved.temporal} temporal warning(s), {unresolved.dangling}{' '}
            unresolved link(s), {unresolved.conflicts} fact(s) with conflicting evidence,{' '}
            {unresolved.collisions} conflicting ID collision(s) excluded, {unresolved.excluded}{' '}
            excluded record(s). Facts remain usable; uncertainty is not removed by this view.
          </div>
        )}
        <p className="help">{result.explanation}</p>
      </section>

      <section className="panel" aria-label="Imported data filters">
        <h3>
          Filters ({facts.length} of {dataset.facts.length} facts)
        </h3>
        <label className="field">
          <span>Search facts</span>
          <input
            type="search"
            value={filters.text}
            onChange={(e) => setFilters((o) => ({ ...o, text: e.target.value }))}
          />
        </label>
        {facetKeys.map(({ key, label }) => (
          <fieldset key={key}>
            <legend>{label}</legend>
            {counts[key].map(({ value, count }) => (
              <label key={value} style={{ marginRight: 10 }}>
                <input
                  type="checkbox"
                  checked={(filters.facets[key] ?? []).includes(value)}
                  onChange={() => toggleFacet(key, value)}
                />{' '}
                {value} ({count})
              </label>
            ))}
          </fieldset>
        ))}
        {analyst && (
          <>
            <div className="two-fields">
              <label className="field">
                <span>{field === 'as_of' ? 'As-of timestamp' : field} from (with UTC offset)</span>
                <input
                  value={timeFrom}
                  onChange={(e) => setTimeFrom(e.target.value)}
                  placeholder="2025-01-01T00:00:00Z"
                />
              </label>
              <label className="field">
                <span>{field === 'as_of' ? 'As-of timestamp' : field} to (with UTC offset)</span>
                <input
                  value={timeTo}
                  onChange={(e) => setTimeTo(e.target.value)}
                  placeholder="2025-12-31T00:00:00Z"
                />
              </label>
            </div>
            {timeInvalid && (
              <p className="help" role="alert">
                Time bounds need an ISO 8601 timestamp with an explicit UTC offset; they are ignored
                until valid.
              </p>
            )}
            <label className="field">
              <span>Sort fact table by</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'fact_id' | 'timestamp')}
              >
                <option value="fact_id">Fact ID</option>
                <option value="timestamp">Selected timestamp field ({field})</option>
              </select>
            </label>
          </>
        )}
        <button
          type="button"
          className="button ghost"
          onClick={() => {
            setFilters(EMPTY_FILTERS);
            setTimeFrom('');
            setTimeTo('');
          }}
        >
          Clear filters
        </button>
      </section>

      <section className="panel" aria-label="Recommended views">
        <h3>Recommended views</h3>
        <div className="recommendations">
          {result.ranked.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`rec-card ${active?.id === r.id ? 'active' : ''}`}
              aria-pressed={active?.id === r.id}
              onClick={() => setActiveId(r.id)}
            >
              <span className="rec-top">
                <span>
                  {r.rank}. {r.title}
                </span>
                <strong>Fit {r.score}</strong>
              </span>
              <p>{r.rationale[0]}</p>
              <small>{r.cautions[0]}</small>
            </button>
          ))}
        </div>
        {analyst && active && (
          <p className="help">
            Score breakdown — coverage {active.scoreBreakdown.coverage.toFixed(2)}, interpretability{' '}
            {active.scoreBreakdown.interpretability.toFixed(2)}, audience fit{' '}
            {active.scoreBreakdown.audienceFit.toFixed(2)}. Fields: {active.fieldsUsed.join(', ')}.
          </p>
        )}
        <details open={analyst}>
          <summary>Why not other views? ({result.excluded.length})</summary>
          <ul>
            {result.excluded.map((e) => (
              <li key={e.kind}>
                <strong>{e.title}</strong>: {e.reasons.map((r) => r.detail).join(' ')}
              </li>
            ))}
          </ul>
        </details>
      </section>

      {active && (
        <section className="panel" aria-label="Active view">
          <h3>{active.title}</h3>
          <ul>
            {active.cautions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p className="help">Does not establish: {active.doesNotEstablish}</p>
          {active.kind === 'fact_table' && (
            <FactTable
              metas={metas}
              ctx={ctx}
              analyst={analyst}
              selectedId={selectedFactId}
              onSelect={setSelectedFactId}
              sortBy={sortBy}
            />
          )}
          {active.vegaLiteSpec && (
            <>
              {active.kind === 'numeric_observations' && unitGroups.length > 1 && (
                <label className="field">
                  <span>Compatible unit plotted</span>
                  <select
                    value={result.artifacts.numeric.selectedUnit ?? ''}
                    onChange={(e) => setNumericUnit(e.target.value)}
                  >
                    {unitGroups.map((g) => (
                      <option key={g.unit} value={g.unit}>
                        {g.unit} ({g.count})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <VegaChart
                spec={active.vegaLiteSpec}
                onSelectDatum={onSelectDatum}
                ariaLabel={`${active.title}. Select a mark to open its fact; values are also in the fact table.`}
              />
            </>
          )}
          {active.kind === 'historical_snapshot' && (
            <SnapshotView snapshot={result.artifacts.snapshot} onSelect={setSelectedFactId} />
          )}
          {active.kind === 'supersession_history' && (
            <SupersessionView
              facts={result.artifacts.supersessionFacts}
              ctx={ctx}
              onSelect={setSelectedFactId}
            />
          )}
          {active.kind === 'provenance_evidence' && (
            <DeductionSearch ctx={ctx} onSelectFact={setSelectedFactId} />
          )}
          <details>
            <summary>Rows excluded from this view</summary>
            <p className="help">
              {active.kind === 'numeric_observations'
                ? result.artifacts.numeric.exclusions
                    .map((e) => `${e.fact.factId}: ${e.detail}`)
                    .join(' · ') || 'None'
                : active.kind === 'validity_timeline'
                  ? result.artifacts.timeline.excluded
                      .map((e) => `${e.fact.factId}: ${e.reason}`)
                      .join(' · ') || 'None'
                  : active.kind === 'historical_snapshot'
                    ? `${result.artifacts.snapshot.unresolved.length} unresolved fact(s)`
                    : 'None'}
            </p>
          </details>
        </section>
      )}

      {selectedFact && <FactEvidence fact={selectedFact} ctx={ctx} analyst={analyst} />}
      {!selectedFact && active?.kind !== 'fact_table' && (
        <p className="help">
          Select a fact in a table or a chart mark to see its evidence. The fact table is always
          available.
        </p>
      )}

      {analyst ? (
        <>
          <InterpretationSettings ctx={ctx} onChange={onSettingsChange} />
          <section className="panel" aria-label="Diagnostics">
            <h3>Diagnostics</h3>
            <p className="help">
              Profile:{' '}
              {result.profile.fields
                .map((f) => `${f.name} (${f.inferredType}, ${f.present}/${f.total} present)`)
                .join('; ')}
              .
            </p>
            <ul>
              {ctx.diagnostics.issues.slice(0, 100).map((i, n) => (
                <li key={n}>
                  {i.factId}: {i.severity} — {i.message}
                </li>
              ))}
              {ctx.evidence.dangling.map((d, n) => (
                <li key={`d${n}`}>
                  Unresolved link: {d.assertedBy} {d.ownerId} → {d.referencedKind} {d.referencedId}{' '}
                  ({d.reason})
                </li>
              ))}
              {[...ctx.evidence.links]
                .filter((l) => l.linkConflicts.length || l.metadataConflicts.length)
                .map((l) => (
                  <li key={`${l.factId}-${l.deductionId}`}>
                    Linked conflict {l.factId} ↔ {l.deductionId}:{' '}
                    {[...l.linkConflicts, ...l.metadataConflicts].join('; ')}
                  </li>
                ))}
              {dataset.collisions.map((c) => (
                <li key={`${c.kind}-${c.id}`}>
                  Collision: {c.kind} {c.id} has {c.variants.length} different contents; excluded.
                </li>
              ))}
              {dataset.duplicates.map((c) => (
                <li key={`dup-${c.kind}-${c.id}`}>
                  Identical duplicate: {c.kind} {c.id} at{' '}
                  {c.occurrences.map((o) => `${o.filePath} ${o.location}`).join('; ')}
                </li>
              ))}
              {ctx.diagnostics.overlaps.map((o, n) => (
                <li key={`o${n}`}>
                  Info: overlapping supplied intervals for {o.entityId} · {o.predicate} (
                  {o.factIds.join(', ')}); overlap is not automatically an error.
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <p className="help">
          Switch to the Analyst audience to review interpretation settings, diagnostics and original
          records.
        </p>
      )}

      <section className="panel" aria-label="Imported data export and clear">
        <button type="button" className="button secondary" onClick={() => setExportOpen((v) => !v)}>
          Export normalized JSON…
        </button>{' '}
        <button type="button" className="button ghost" onClick={() => setConfirmClear(true)}>
          Clear imported data
        </button>
        {exportOpen && (
          <div role="group" aria-label="Export warning">
            <p className="warning" style={{ maxWidth: 'none' }}>
              {EXPORT_WARNING}
            </p>
            <button
              type="button"
              className="button primary"
              onClick={() =>
                downloadText(
                  'imported-normalized.json',
                  JSON.stringify(buildNormalizedExport(dataset), null, 2),
                  'application/json',
                )
              }
            >
              Download export
            </button>
          </div>
        )}
        {confirmClear && (
          <div role="group" aria-label="Confirm clear">
            <p>Remove all imported records from memory? The Cedar Watch demo is unaffected.</p>
            <button type="button" className="button primary" onClick={onClear}>
              Confirm clear
            </button>{' '}
            <button type="button" className="button ghost" onClick={() => setConfirmClear(false)}>
              Keep data
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
