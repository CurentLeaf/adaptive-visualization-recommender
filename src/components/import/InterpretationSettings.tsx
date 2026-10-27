import { patchTemporal } from '../../imported/settings';
import type { ImportedContext } from '../../imported/profile';
import type {
  EndpointConvention,
  ImportedSettings,
  MissingEndpointPolicy,
  NullEndpointMeaning,
  TimestampSelection,
} from '../../imported/types';

export function InterpretationSettings({
  ctx,
  onChange,
}: {
  ctx: ImportedContext;
  onChange: (s: ImportedSettings) => void;
}) {
  const s = ctx.dataset.settings;
  const t = s.temporal;
  const patch = (p: Parameters<typeof patchTemporal>[1]) => onChange(patchTemporal(s, p));
  const predicates = ctx.proposals.map((p) => p.predicate);
  return (
    <section aria-label="Interpretation settings" className="panel">
      <h3>Interpretation settings (this dataset only)</h3>
      <p className="help">
        Upstream meanings are unconfirmed. These settings are your documented assumptions; they are
        included in exports and never inferred from the data.
      </p>
      <label className="field">
        <span>as_of meaning (upstream meaning unconfirmed)</span>
        <input value={t.asOfMeaning} onChange={(e) => patch({ asOfMeaning: e.target.value })} />
      </label>
      <label className="field">
        <span>Upstream current flag meaning</span>
        <input
          value={t.currentFlagMeaning}
          onChange={(e) => patch({ currentFlagMeaning: e.target.value })}
        />
      </label>
      <label className="field">
        <span>
          <input
            type="checkbox"
            checked={t.intervalsConfirmed}
            onChange={(e) => patch({ intervalsConfirmed: e.target.checked })}
          />{' '}
          valid_from/valid_to are confirmed applicability intervals
        </span>
      </label>
      <label className="field">
        <span>Endpoint convention</span>
        <select
          value={t.endpointConvention}
          onChange={(e) => patch({ endpointConvention: e.target.value as EndpointConvention })}
        >
          <option value="unspecified">Unspecified</option>
          <option value="inclusive_start_exclusive_end">Start inclusive, end exclusive</option>
          <option value="inclusive_both">Both inclusive</option>
          <option value="exclusive_start_inclusive_end">Start exclusive, end inclusive</option>
          <option value="exclusive_both">Both exclusive</option>
        </select>
      </label>
      <label className="field">
        <span>Meaning of null valid_to</span>
        <select
          value={t.nullValidTo}
          onChange={(e) => patch({ nullValidTo: e.target.value as NullEndpointMeaning })}
        >
          <option value="unconfirmed">Unconfirmed</option>
          <option value="open_ended">Open-ended (no known end)</option>
          <option value="unknown">Unknown (unresolved)</option>
        </select>
      </label>
      <label className="field">
        <span>Meaning of null valid_from</span>
        <select
          value={t.nullValidFrom}
          onChange={(e) => patch({ nullValidFrom: e.target.value as NullEndpointMeaning })}
        >
          <option value="unconfirmed">Unconfirmed</option>
          <option value="open_ended">Open-ended (no known start)</option>
          <option value="unknown">Unknown (unresolved)</option>
        </select>
      </label>
      <label className="field">
        <span>Missing endpoint policy</span>
        <select
          value={t.missingEndpointPolicy}
          onChange={(e) =>
            patch({ missingEndpointPolicy: e.target.value as MissingEndpointPolicy })
          }
        >
          <option value="unresolved">Treat as unresolved (excluded from snapshots)</option>
          <option value="treat_as_open">Treat as open</option>
        </select>
      </label>
      <label className="field">
        <span>Snapshot reference time (ISO 8601 with UTC offset)</span>
        <input
          value={t.referenceTime}
          placeholder="2025-06-01T00:00:00Z"
          onChange={(e) => patch({ referenceTime: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Timestamp field for sorting, filtering and numeric charts</span>
        <select
          value={t.timestampField}
          onChange={(e) => patch({ timestampField: e.target.value as TimestampSelection })}
        >
          <option value="as_of">As-of timestamp (as_of)</option>
          <option value="valid_from">valid_from</option>
          <option value="valid_to">valid_to</option>
        </select>
      </label>
      <h4>Value type review</h4>
      <p className="help">
        Inferred types are proposals; numeric analytics use a predicate only after you confirm it.
      </p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Predicate</th>
              <th>Convertible / total</th>
              <th>Proposal (inferred)</th>
              <th>Reviewed type</th>
            </tr>
          </thead>
          <tbody>
            {ctx.proposals.map((p) => (
              <tr key={p.predicate}>
                <td>{p.predicate}</td>
                <td>
                  {p.convertible}/{p.total}
                </td>
                <td>
                  {p.proposed}
                  {p.linkedObjectTypes.length
                    ? ` (linked deductions say ${p.linkedObjectTypes.join(', ')})`
                    : ''}
                </td>
                <td>
                  <select
                    aria-label={`Reviewed type for ${p.predicate}`}
                    value={p.review}
                    onChange={(e) => {
                      const next = { ...s.typeReview };
                      if (e.target.value === 'unreviewed') delete next[p.predicate];
                      else
                        next[p.predicate] = {
                          type: e.target.value as 'numeric' | 'nonnumeric',
                          origin: 'user_configured',
                        };
                      onChange({ ...s, typeReview: next });
                    }}
                  >
                    <option value="unreviewed">Unreviewed</option>
                    <option value="numeric">Numeric</option>
                    <option value="nonnumeric">Non-numeric</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h4>Predicate topics and units</h4>
      <p className="help">
        Optional mapping, for example has_price → Pricing. The original predicate is always
        retained. Units are never inferred from predicates.
      </p>
      {predicates.map((p) => (
        <div key={p} className="two-fields">
          <label className="field">
            <span>Topic for {p}</span>
            <input
              value={s.topicMap[p] ?? ''}
              onChange={(e) => {
                const next = { ...s.topicMap };
                if (e.target.value) next[p] = e.target.value;
                else delete next[p];
                onChange({ ...s, topicMap: next });
              }}
            />
          </label>
          <label className="field">
            <span>Unit for {p} (used only when facts supply none)</span>
            <input
              value={s.unitOverrides[p] ?? ''}
              onChange={(e) => {
                const next = { ...s.unitOverrides };
                if (e.target.value) next[p] = e.target.value;
                else delete next[p];
                onChange({ ...s, unitOverrides: next });
              }}
            />
          </label>
        </div>
      ))}
    </section>
  );
}
