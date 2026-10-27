import { useMemo, useState } from 'react';
import type { ImportedContext } from '../../imported/profile';
import type { FactMeta } from '../../imported/grouping';
import { convertNumeric } from '../../imported/typing';
import { epochOf, timestampLabel } from '../../imported/timestamps';
import { fieldOf, type SnapshotResult } from '../../imported/temporal';
import type { ImportedDeduction, ImportedFact, SourceOccurrence } from '../../imported/types';

const MAX_ROWS = 200;
const show = (value: unknown) => JSON.stringify(value);
const occ = (list: SourceOccurrence[]) => list.map((o) => `${o.filePath} ${o.location}`).join('; ');

export function FactTable({
  metas,
  ctx,
  analyst,
  selectedId,
  onSelect,
  sortBy,
}: {
  metas: FactMeta[];
  ctx: ImportedContext;
  analyst: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  sortBy: 'fact_id' | 'timestamp';
}) {
  const field = ctx.dataset.settings.temporal.timestampField;
  const rows = useMemo(() => {
    if (sortBy === 'fact_id') return metas;
    return [...metas].sort((a, b) => {
      const ta = epochOf(fieldOf(a.fact, field));
      const tb = epochOf(fieldOf(b.fact, field));
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return ta - tb;
    });
  }, [metas, sortBy, field]);
  return (
    <div className="tablewrap">
      <table>
        <caption>
          Fact table · showing {Math.min(rows.length, MAX_ROWS)} of {rows.length}
        </caption>
        <thead>
          <tr>
            <th>Fact ID</th>
            <th>Entity</th>
            <th>Predicate</th>
            <th>Original object_value</th>
            {analyst && <th>Normalized numeric</th>}
            <th>As-of timestamp</th>
            <th>valid_from</th>
            <th>valid_to</th>
            <th>Upstream current flag</th>
            <th>Status</th>
            <th>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, MAX_ROWS).map(({ fact, values, evidenceConflict }) => {
            const converted = convertNumeric(fact.objectValue, fact.predicate);
            const warnings =
              ctx.diagnostics.byFact.get(fact.factId)?.filter((i) => i.severity === 'warning')
                .length ?? 0;
            const linked = ctx.evidence.byFact.get(fact.factId)?.length ?? 0;
            return (
              <tr key={fact.factId} aria-selected={selectedId === fact.factId}>
                <td>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => onSelect(fact.factId)}
                  >
                    {fact.factId}
                  </button>
                </td>
                <td>{fact.entityId}</td>
                <td>{fact.predicate}</td>
                <td>{show(fact.objectValue)}</td>
                {analyst && (
                  <td>
                    {converted.ok &&
                    ctx.dataset.settings.typeReview[fact.predicate]?.type === 'numeric'
                      ? converted.value
                      : '—'}
                  </td>
                )}
                <td>{timestampLabel(fact.asOf)}</td>
                <td>{timestampLabel(fact.validFrom)}</td>
                <td>{timestampLabel(fact.validTo)}</td>
                <td>{fact.current === null ? 'not supplied' : String(fact.current)}</td>
                <td>
                  {values.temporal[0]}
                  {fact.supersededBy.length ? '; superseded_by present' : ''}
                  {warnings ? ` (${warnings})` : ''}
                </td>
                <td>
                  {linked
                    ? `${linked} linked deduction(s)${evidenceConflict ? ' — conflict' : ''}`
                    : 'Supporting extraction not linked'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DeductionDetail({ d, factIds }: { d: ImportedDeduction; factIds: string[] }) {
  return (
    <li className="deduction-detail">
      <strong>{d.deductionId}</strong>
      {factIds.length
        ? ` · explicitly linked to ${factIds.join(', ')}`
        : ' · not linked to any fact'}
      <dl className="detail-grid">
        <dt>Source file path (inert text)</dt>
        <dd>{d.sourceFilePath ?? 'unknown'}</dd>
        <dt>Chunk ID</dt>
        <dd>{d.chunkId ?? 'unknown'}</dd>
        <dt>Extraction method</dt>
        <dd>{d.extractionMethod ?? 'unknown'}</dd>
        <dt>Extraction confidence</dt>
        <dd>
          {d.confidence === null ? 'unknown' : d.confidence} (extraction confidence only; not
          reliability, truth or corroboration)
        </dd>
        <dt>Subject entity</dt>
        <dd>
          {d.subjectEntity ?? 'unknown'} ({d.subjectEntityType ?? 'Unknown entity type'})
        </dd>
        <dt>Predicate / object</dt>
        <dd>
          {d.predicate ?? 'unknown'} → {d.hasObjectValue ? show(d.objectValue) : 'unknown'} (
          {d.objectType ?? 'type unknown'})
        </dd>
        <dt>Extraction path</dt>
        <dd>{d.provenance?.extractionPath ?? 'unknown'}</dd>
        <dt>Model used</dt>
        <dd>{d.provenance?.modelUsed ?? 'unknown'}</dd>
        <dt>Raw text</dt>
        <dd>{d.provenance?.rawText ?? 'unknown'}</dd>
        <dt>Original metadata</dt>
        <dd>{d.metadata ? show(d.metadata) : 'unknown'}</dd>
        <dt>Record location</dt>
        <dd>{occ(d.occurrences)}</dd>
      </dl>
    </li>
  );
}

export function FactEvidence({
  fact,
  ctx,
  analyst,
}: {
  fact: ImportedFact;
  ctx: ImportedContext;
  analyst: boolean;
}) {
  const links = ctx.evidence.byFact.get(fact.factId) ?? [];
  const byId = new Map(ctx.dataset.deductions.map((d) => [d.deductionId, d]));
  const issues = ctx.diagnostics.byFact.get(fact.factId) ?? [];
  const dangling = ctx.evidence.dangling.filter(
    (d) => d.ownerId === fact.factId || d.referencedId === fact.factId,
  );
  return (
    <section aria-label={`Evidence for ${fact.factId}`} className="panel">
      <h3>Evidence for fact {fact.factId}</h3>
      <p className="help">
        Entity {fact.entityId} · predicate {fact.predicate} · original object_value{' '}
        {show(fact.objectValue)}
      </p>
      <p className="help">Source occurrences: {occ(fact.occurrences)}</p>
      {issues.length > 0 && (
        <ul>
          {issues.map((i, n) => (
            <li key={n}>
              {i.severity}: {i.message}
            </li>
          ))}
        </ul>
      )}
      {!links.length ? (
        <p>
          <strong>Supporting extraction not linked.</strong> Only explicit IDs create links; nothing
          is inferred from matching values.
        </p>
      ) : (
        <ul>
          {links.map((l) => {
            const d = byId.get(l.deductionId)!;
            return (
              <li key={l.deductionId}>
                {[...l.linkConflicts, ...l.metadataConflicts].length > 0 && (
                  <p role="alert">
                    Conflict: {[...l.linkConflicts, ...l.metadataConflicts].join('; ')}
                  </p>
                )}
                <ul>
                  <DeductionDetail
                    d={d}
                    factIds={(ctx.evidence.byDeduction.get(d.deductionId) ?? []).map(
                      (x) => x.factId,
                    )}
                  />
                </ul>
              </li>
            );
          })}
        </ul>
      )}
      {dangling.length > 0 && (
        <ul>
          {dangling.map((d, n) => (
            <li key={n}>
              Unresolved link: {d.assertedBy} {d.ownerId} references {d.referencedKind}{' '}
              {d.referencedId} (
              {d.reason === 'missing' ? 'not found' : 'excluded by conflicting duplicates'}).
            </li>
          ))}
        </ul>
      )}
      {analyst && (
        <details>
          <summary>Immutable original record</summary>
          <pre>{JSON.stringify(fact.raw, null, 2)}</pre>
          <p className="help">
            Fields not in the documented contract:{' '}
            {fact.unknownFields.length ? fact.unknownFields.join(', ') : 'none'}
          </p>
        </details>
      )}
    </section>
  );
}

export function DeductionSearch({
  ctx,
  onSelectFact,
}: {
  ctx: ImportedContext;
  onSelectFact: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const hits = ctx.dataset.deductions.filter((d) => {
    if (!needle) return true;
    return [
      d.deductionId,
      d.chunkId,
      d.subjectEntity,
      d.subjectEntityType,
      d.predicate,
      d.extractionMethod,
      d.sourceFilePath,
      d.provenance?.rawText,
      d.hasObjectValue ? show(d.objectValue) : null,
    ].some((v) => typeof v === 'string' && v.toLowerCase().includes(needle));
  });
  return (
    <section aria-label="Deduction search">
      <label className="field">
        <span>Search deductions</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <p className="help">
        {hits.length} of {ctx.dataset.deductions.length} deductions. Deductions are searchable
        whether or not they are linked to a fact.
      </p>
      <ul>
        {hits.slice(0, 50).map((d) => {
          const facts = (ctx.evidence.byDeduction.get(d.deductionId) ?? []).map((l) => l.factId);
          return (
            <li key={d.deductionId}>
              <DeductionDetail d={d} factIds={facts} />
              {facts.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="button ghost"
                  onClick={() => onSelectFact(id)}
                >
                  Show linked fact {id}
                </button>
              ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function SnapshotView({
  snapshot,
  onSelect,
}: {
  snapshot: SnapshotResult;
  onSelect: (id: string) => void;
}) {
  if (!snapshot.ready)
    return (
      <div>
        <p>Historical snapshot is disabled until validity semantics are configured:</p>
        <ul>
          {snapshot.missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <div>
      <p>
        {snapshot.valid.length} fact(s) valid under the configured interpretation;{' '}
        {snapshot.notValid.length} not valid; {snapshot.unresolved.length} temporally unresolved
        (excluded here, still in the fact table).
      </p>
      <ul>
        {snapshot.valid.map((f) => (
          <li key={f.factId}>
            <button type="button" className="button ghost" onClick={() => onSelect(f.factId)}>
              {f.factId}
            </button>{' '}
            {f.entityId} · {f.predicate} = {show(f.objectValue)}
          </li>
        ))}
      </ul>
      {snapshot.unresolved.length > 0 && (
        <details>
          <summary>Unresolved facts ({snapshot.unresolved.length})</summary>
          <ul>
            {snapshot.unresolved.map((u) => (
              <li key={u.fact.factId}>
                {u.fact.factId}: {u.reasons.join('; ')}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function SupersessionView({
  facts,
  ctx,
  onSelect,
}: {
  facts: ImportedFact[];
  ctx: ImportedContext;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="tablewrap">
      <table>
        <caption>Supplied supersession links (not measured change, not truth)</caption>
        <thead>
          <tr>
            <th>Fact ID</th>
            <th>supersedes</th>
            <th>superseded_by</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {facts.map((f) => (
            <tr key={f.factId}>
              <td>
                <button type="button" className="button ghost" onClick={() => onSelect(f.factId)}>
                  {f.factId}
                </button>
              </td>
              <td>{f.supersedes.join(', ') || '—'}</td>
              <td>{f.supersededBy.join(', ') || '—'}</td>
              <td>
                {(ctx.diagnostics.byFact.get(f.factId) ?? [])
                  .filter((i) =>
                    [
                      'self_supersession',
                      'supersession_cycle',
                      'missing_reference',
                      'contradictory_replacement',
                      'current_with_superseded_by',
                    ].includes(i.code),
                  )
                  .map((i) => i.code)
                  .join(', ') || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
