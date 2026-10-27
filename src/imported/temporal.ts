import { compareCodepoint } from './json';
import { epochOf, parseTimestamp } from './timestamps';
import type { ImportedFact, TemporalConfig, TimestampField, TimestampSelection } from './types';

export type TemporalIssue = {
  factId: string;
  code:
    | 'invalid_timestamp'
    | 'ambiguous_timezone'
    | 'reversed_interval'
    | 'current_with_superseded_by'
    | 'self_supersession'
    | 'missing_reference'
    | 'contradictory_replacement'
    | 'one_sided_replacement'
    | 'supersession_cycle';
  severity: 'warning' | 'info';
  message: string;
};

export type TemporalDiagnostics = {
  issues: TemporalIssue[];
  byFact: Map<string, TemporalIssue[]>;
  cycles: string[][];
  /** Informational only: overlapping supplied intervals are not automatically errors. */
  overlaps: { entityId: string; predicate: string; factIds: string[] }[];
};

const FIELDS = [
  ['as_of', (f: ImportedFact) => f.asOf],
  ['valid_from', (f: ImportedFact) => f.validFrom],
  ['valid_to', (f: ImportedFact) => f.validTo],
] as const;

export function fieldOf(fact: ImportedFact, name: TimestampSelection): TimestampField {
  return name === 'as_of' ? fact.asOf : name === 'valid_from' ? fact.validFrom : fact.validTo;
}

export function temporalDiagnostics(facts: ImportedFact[]): TemporalDiagnostics {
  const issues: TemporalIssue[] = [];
  const byId = new Map(facts.map((f) => [f.factId, f]));
  const add = (
    factId: string,
    code: TemporalIssue['code'],
    message: string,
    severity: TemporalIssue['severity'] = 'warning',
  ) => issues.push({ factId, code, severity, message });
  const edges = new Map<string, Set<string>>();
  const edge = (newer: string, older: string) => {
    edges.set(newer, (edges.get(newer) ?? new Set()).add(older));
  };
  for (const fact of facts) {
    for (const [name, get] of FIELDS) {
      const field = get(fact);
      if (field.state === 'invalid_type')
        add(fact.factId, 'invalid_timestamp', `${name} is not a string.`);
      else if (field.state === 'value' && field.parsed.status === 'invalid')
        add(
          fact.factId,
          'invalid_timestamp',
          `${name} ${JSON.stringify(field.raw)} is invalid: ${field.parsed.reason}.`,
        );
      else if (field.state === 'value' && field.parsed.status === 'ambiguous_timezone')
        add(
          fact.factId,
          'ambiguous_timezone',
          `${name} ${JSON.stringify(field.raw)} has no explicit UTC offset (${field.parsed.reason === 'date_only' ? 'date only' : 'timezone-ambiguous'}); not used for ordering.`,
        );
    }
    const from = epochOf(fact.validFrom);
    const to = epochOf(fact.validTo);
    if (from !== null && to !== null && from > to)
      add(fact.factId, 'reversed_interval', 'valid_from is later than valid_to.');
    if (fact.current === true && fact.supersededBy.length)
      add(
        fact.factId,
        'current_with_superseded_by',
        'Upstream current flag is true but superseded_by is present (kept, not rejected).',
      );
    if (fact.supersedes.includes(fact.factId) || fact.supersededBy.includes(fact.factId))
      add(fact.factId, 'self_supersession', 'Fact references itself as a replacement.');
    for (const ref of fact.supersedes) {
      if (ref === fact.factId) continue;
      const other = byId.get(ref);
      if (!other) {
        add(fact.factId, 'missing_reference', `supersedes references unknown fact ${ref}.`);
        continue;
      }
      edge(fact.factId, ref);
      if (!other.supersededBy.includes(fact.factId)) {
        if (other.supersededBy.length)
          add(
            fact.factId,
            'contradictory_replacement',
            `Supersedes ${ref}, but ${ref} names a different replacement.`,
          );
        else
          add(
            fact.factId,
            'one_sided_replacement',
            `Supersedes ${ref}, which does not record superseded_by.`,
            'info',
          );
      }
    }
    for (const ref of fact.supersededBy) {
      if (ref === fact.factId) continue;
      const other = byId.get(ref);
      if (!other) {
        add(fact.factId, 'missing_reference', `superseded_by references unknown fact ${ref}.`);
        continue;
      }
      edge(ref, fact.factId);
      if (!other.supersedes.includes(fact.factId)) {
        if (other.supersedes.length)
          add(
            fact.factId,
            'contradictory_replacement',
            `Superseded by ${ref}, but ${ref} names different replaced facts.`,
          );
        else
          add(
            fact.factId,
            'one_sided_replacement',
            `Superseded by ${ref}, which does not record supersedes.`,
            'info',
          );
      }
    }
  }
  const cycles = findCycles(edges);
  for (const cycle of cycles)
    for (const id of cycle)
      add(id, 'supersession_cycle', `Fact is part of a supersession cycle: ${cycle.join(' → ')}.`);

  const groups = new Map<string, ImportedFact[]>();
  for (const f of facts) {
    const from = epochOf(f.validFrom);
    const to = epochOf(f.validTo);
    if (from !== null && to !== null && from <= to)
      groups.set(`${f.entityId}\u0000${f.predicate}`, [
        ...(groups.get(`${f.entityId}\u0000${f.predicate}`) ?? []),
        f,
      ]);
  }
  const overlaps: TemporalDiagnostics['overlaps'] = [];
  for (const group of groups.values()) {
    const hit = new Set<string>();
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++)
        if (
          epochOf(group[i].validFrom)! < epochOf(group[j].validTo)! &&
          epochOf(group[j].validFrom)! < epochOf(group[i].validTo)!
        ) {
          hit.add(group[i].factId);
          hit.add(group[j].factId);
        }
    if (hit.size)
      overlaps.push({
        entityId: group[0].entityId,
        predicate: group[0].predicate,
        factIds: [...hit].sort(compareCodepoint),
      });
  }
  const byFact = new Map<string, TemporalIssue[]>();
  for (const issue of issues)
    byFact.set(issue.factId, [...(byFact.get(issue.factId) ?? []), issue]);
  return { issues, byFact, cycles, overlaps };
}

/** Tarjan strongly connected components; components with >1 node are cycles. */
function findCycles(edges: Map<string, Set<string>>): string[][] {
  const nodes = [...new Set([...edges.keys(), ...[...edges.values()].flatMap((s) => [...s])])].sort(
    compareCodepoint,
  );
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  let counter = 0;
  const visit = (node: string) => {
    index.set(node, counter);
    low.set(node, counter++);
    stack.push(node);
    onStack.add(node);
    for (const next of [...(edges.get(node) ?? [])].sort(compareCodepoint)) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node)!, low.get(next)!));
      } else if (onStack.has(next)) low.set(node, Math.min(low.get(node)!, index.get(next)!));
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1) cycles.push(component.sort(compareCodepoint));
    }
  };
  for (const node of nodes) if (!index.has(node)) visit(node);
  return cycles.sort((a, b) => compareCodepoint(a[0], b[0]));
}

// ---------- snapshots ----------

export function snapshotReadiness(config: TemporalConfig): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!config.intervalsConfirmed)
    missing.push('Confirm that valid_from/valid_to describe applicability intervals');
  if (config.endpointConvention === 'unspecified')
    missing.push('Choose an explicit endpoint convention');
  if (config.nullValidTo === 'unconfirmed') missing.push('Confirm what a null valid_to means');
  if (config.origins.missingEndpointPolicy !== 'user_configured')
    missing.push('Choose a missing-endpoint policy');
  if (parseTimestamp(config.referenceTime).status !== 'valid')
    missing.push('Enter a reference time with an explicit UTC offset');
  return { ready: missing.length === 0, missing };
}

type Endpoint =
  { kind: 'instant'; ms: number } | { kind: 'open' } | { kind: 'unresolved'; reason: string };

function resolveEndpoint(
  field: TimestampField,
  which: 'valid_from' | 'valid_to',
  config: TemporalConfig,
): Endpoint {
  if (field.state === 'value')
    return field.parsed.status === 'valid'
      ? { kind: 'instant', ms: field.parsed.epochMs }
      : {
          kind: 'unresolved',
          reason: `${which} is ${field.parsed.status === 'invalid' ? 'invalid' : 'timezone-ambiguous'}`,
        };
  if (field.state === 'invalid_type')
    return { kind: 'unresolved', reason: `${which} is not a string` };
  if (field.state === 'null') {
    const meaning = which === 'valid_to' ? config.nullValidTo : config.nullValidFrom;
    return meaning === 'open_ended'
      ? { kind: 'open' }
      : { kind: 'unresolved', reason: `null ${which} meaning is ${meaning}` };
  }
  return config.missingEndpointPolicy === 'treat_as_open'
    ? { kind: 'open' }
    : { kind: 'unresolved', reason: `${which} is missing and policy is "unresolved"` };
}

export type SnapshotResult = {
  ready: boolean;
  missing: string[];
  valid: ImportedFact[];
  notValid: ImportedFact[];
  unresolved: { fact: ImportedFact; reasons: string[] }[];
};

export function snapshotAt(facts: ImportedFact[], config: TemporalConfig): SnapshotResult {
  const { ready, missing } = snapshotReadiness(config);
  const result: SnapshotResult = { ready, missing, valid: [], notValid: [], unresolved: [] };
  if (!ready) return result;
  const at = epochOf({
    state: 'value',
    raw: config.referenceTime,
    parsed: parseTimestamp(config.referenceTime),
  })!;
  const startInclusive =
    config.endpointConvention.startsWith('inclusive_start') ||
    config.endpointConvention === 'inclusive_both';
  const endInclusive =
    config.endpointConvention.endsWith('inclusive_end') ||
    config.endpointConvention === 'inclusive_both';
  for (const fact of facts) {
    const from = resolveEndpoint(fact.validFrom, 'valid_from', config);
    const to = resolveEndpoint(fact.validTo, 'valid_to', config);
    const reasons = [from, to].flatMap((e) => (e.kind === 'unresolved' ? [e.reason] : []));
    if (from.kind === 'instant' && to.kind === 'instant' && from.ms > to.ms)
      reasons.push('interval is reversed');
    if (reasons.length) {
      result.unresolved.push({ fact, reasons });
      continue;
    }
    const afterStart =
      from.kind === 'open' ||
      (from.kind === 'instant' && (startInclusive ? at >= from.ms : at > from.ms));
    const beforeEnd =
      to.kind === 'open' || (to.kind === 'instant' && (endInclusive ? at <= to.ms : at < to.ms));
    (afterStart && beforeEnd ? result.valid : result.notValid).push(fact);
  }
  return result;
}

// ---------- literal current flag ----------

export type CurrentFilter = 'any' | 'true' | 'false' | 'unknown';
export const currentMatches = (fact: ImportedFact, filter: CurrentFilter) =>
  filter === 'any' ||
  (filter === 'true'
    ? fact.current === true
    : filter === 'false'
      ? fact.current === false
      : fact.current === null);

// ---------- timeline rows ----------

export type EndpointState = 'value' | 'null' | 'missing' | 'unresolved';
export type TimelineRow = {
  fact_id: string;
  label: string;
  start_ms: number | null;
  end_ms: number | null;
  start_state: EndpointState;
  end_state: EndpointState;
  start_raw: string;
  end_raw: string;
  endpoint_kind: string;
};

const stateOf = (field: TimestampField): EndpointState =>
  field.state === 'value'
    ? field.parsed.status === 'valid'
      ? 'value'
      : 'unresolved'
    : field.state === 'invalid_type'
      ? 'unresolved'
      : field.state;

const rawOf = (field: TimestampField) =>
  field.state === 'value'
    ? field.raw
    : field.state === 'null'
      ? 'null'
      : field.state === 'missing'
        ? '(missing)'
        : '(invalid type)';

/** Supplied validity only: open/missing endpoints are labeled, never given invented dates. */
export function validityTimeline(facts: ImportedFact[]): {
  rows: TimelineRow[];
  excluded: { fact: ImportedFact; reason: string }[];
} {
  const rows: TimelineRow[] = [];
  const excluded: { fact: ImportedFact; reason: string }[] = [];
  for (const fact of facts) {
    const start = epochOf(fact.validFrom);
    const end = epochOf(fact.validTo);
    if (start === null && end === null) {
      excluded.push({ fact, reason: 'No valid_from or valid_to with an explicit UTC offset' });
      continue;
    }
    if (start !== null && end !== null && start > end) {
      excluded.push({ fact, reason: 'Reversed interval (valid_from after valid_to)' });
      continue;
    }
    const s = stateOf(fact.validFrom);
    const e = stateOf(fact.validTo);
    rows.push({
      fact_id: fact.factId,
      label: `${fact.entityId} · ${fact.predicate}`,
      start_ms: start,
      end_ms: end,
      start_state: s,
      end_state: e,
      start_raw: rawOf(fact.validFrom),
      end_raw: rawOf(fact.validTo),
      endpoint_kind:
        start !== null && end !== null
          ? 'closed interval'
          : start !== null
            ? `start only (valid_to ${e})`
            : `end only (valid_from ${s})`,
    });
  }
  return { rows, excluded };
}
