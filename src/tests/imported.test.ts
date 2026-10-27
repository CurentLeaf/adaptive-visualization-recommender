import { compile } from 'vega-lite';
import type { TopLevelSpec } from 'vega-lite';
import { describe, expect, it } from 'vitest';
import { recommend } from '../lib/recommendationEngine';
import { buildDataset, mergeRecords, nextBatchId, processFiles } from '../imported/ingest';
import { buildNormalizedExport } from '../imported/exporters';
import { EMPTY_FILTERS, applyFilters, facetCounts } from '../imported/grouping';
import { patchTemporal, defaultSettings } from '../imported/settings';
import { parseTimestamp } from '../imported/timestamps';
import {
  snapshotAt,
  snapshotReadiness,
  validityTimeline,
  currentMatches,
} from '../imported/temporal';
import { convertNumeric, numericObservations } from '../imported/typing';
import { DEDUCTION_TEMPLATE, FACT_TEMPLATE, LINKED_TEMPLATE } from '../imported/templates';
import { prepareImported } from '../imported/profile';
import { DEFAULT_LIMITS } from '../imported/types';
import {
  batchOf,
  ctxOf,
  datasetOf,
  fixtureInput,
  folderInputs,
  textFile,
} from './importedTestUtils';

const reviewNumeric = (predicates: string[]) =>
  Object.fromEntries(
    predicates.map((p) => [p, { type: 'numeric' as const, origin: 'user_configured' as const }]),
  );

describe('detection, validation and partial success', () => {
  it('recognizes envelopes, arrays and singletons by structure, not file name', async () => {
    const batch = await batchOf([
      textFile(
        'x/anything.json',
        JSON.stringify({ fact_id: 'F', entity_id: 'E', predicate: 'p', object_value: 1 }),
      ),
      textFile(
        'x/data.txt',
        JSON.stringify([
          { deduction_id: 'D' },
          { fact_id: 'F2', entity_id: 'E', predicate: 'p', object_value: null },
        ]),
      ),
      textFile(
        'x/facts.json',
        JSON.stringify({
          schema_version: 'avr-import/1',
          facts: [{ fact_id: 'F3', entity_id: 'E', predicate: 'p', object_value: 2 }],
        }),
      ),
    ]);
    expect(batch.files.map((f) => f.structure).sort()).toEqual(['array', 'envelope', 'record']);
    expect(batch.records.map((r) => r.record.kind).sort()).toEqual([
      'deduction',
      'fact',
      'fact',
      'fact',
    ]);
  });

  it('keeps valid records when siblings are malformed and reports path and JSON location', async () => {
    const batch = await batchOf(folderInputs('mixed-folder'));
    expect(batch.counts).toMatchObject({
      discovered: 7,
      supported: 4,
      unsupported: 3,
      failed: 2,
      processed: 2,
    });
    const ids = batch.records
      .map((r) => (r.record.kind === 'fact' ? r.record.factId : r.record.deductionId))
      .sort();
    expect(ids).toEqual(['SYN-MIX-D1', 'SYN-MIX-F1', 'SYN-MIX-F2']);
    const rejected = batch.issues.filter(
      (i) => i.location.startsWith('$[') && i.severity === 'error',
    );
    expect(rejected.map((i) => `${i.filePath} ${i.location}`).sort()).toEqual([
      'mixed-folder/nested/records-array.txt $[2]',
      'mixed-folder/nested/records-array.txt $[3]',
    ]);
    const prose = batch.issues.find((i) => i.filePath.endsWith('prose.txt'))!;
    expect(prose.message).toMatch(/TXT files must contain supported JSON/);
    expect(
      batch.files
        .filter((f) => f.status === 'unsupported')
        .map((f) => f.path)
        .sort(),
    ).toEqual([
      'mixed-folder/nested/picture.png',
      'mixed-folder/report.pdf',
      'mixed-folder/tool.exe',
    ]);
  });

  it('rejects unsupported schema versions and requires object_value', async () => {
    const batch = await batchOf([
      textFile('v.json', JSON.stringify({ schema_version: 'other/9', facts: [] })),
      textFile('m.json', JSON.stringify({ fact_id: 'F', entity_id: 'E', predicate: 'p' })),
    ]);
    expect(batch.issues.map((i) => i.code).sort()).toEqual([
      'missing_object_value',
      'unsupported_schema_version',
    ]);
    expect(batch.records).toHaveLength(0);
  });

  it('preserves raw records, unknown fields, exact values and original timestamp strings immutably', async () => {
    const ds = await datasetOf([fixtureInput('facts-only.json')]);
    const f6 = ds.facts.find((f) => f.factId === 'SYN-F-006')!;
    expect(f6.unknownFields).toEqual(['custom_unknown_field']);
    expect(f6.raw.custom_unknown_field).toEqual({ kept: 'as supplied' });
    const f3 = ds.facts.find((f) => f.factId === 'SYN-F-003')!;
    expect(f3.objectValue).toBe('22.5');
    expect(ds.facts.find((f) => f.factId === 'SYN-F-002')!.asOf).toMatchObject({
      state: 'value',
      raw: '2025-01-15T12:00:00+02:00',
    });
    expect(ds.facts.find((f) => f.factId === 'SYN-F-009')!.objectValue).toBeNull();
    expect(() => {
      (f6.raw as Record<string, unknown>).predicate = 'changed';
    }).toThrow();
    expect(Object.isFrozen(f6.raw.custom_unknown_field as object)).toBe(true);
    expect(ds.facts.find((f) => f.factId === 'SYN-F-004')!.validFrom).toEqual({ state: 'missing' });
    expect(f3.validTo).toEqual({ state: 'null' });
  });

  it('never fabricates unknown deduction metadata', async () => {
    const ds = await datasetOf([fixtureInput('deductions-only.json')]);
    const d = ds.deductions.find((x) => x.deductionId === 'SYN-D-003')!;
    expect(d).toMatchObject({
      confidence: null,
      provenance: null,
      metadata: null,
      subjectEntityType: null,
      sourceFilePath: null,
      factId: null,
    });
  });
});

describe('deterministic merge, dedup and collisions', () => {
  const a = fixtureInput('duplicates/a.json', 'duplicates/a.json');
  const b = fixtureInput('duplicates/b.json', 'duplicates/b.json');
  const c = fixtureInput('facts-only.json');
  const orders = [
    [a, b, c],
    [c, b, a],
    [b, a, c],
    [b, c, a],
  ];

  it('is permutation invariant and never picks a conflicting duplicate by file order', async () => {
    const datasets = await Promise.all(orders.map((o) => datasetOf(o)));
    const strip = (d: (typeof datasets)[number]) =>
      JSON.stringify({
        f: d.facts,
        c: d.collisions,
        u: d.duplicates,
        x: d.excluded,
        files: d.files,
      });
    for (const d of datasets) expect(strip(d)).toBe(strip(datasets[0]));
    const ds = datasets[0];
    expect(ds.facts.some((f) => f.factId === 'SYN-DUP-CONFLICT')).toBe(false);
    expect(ds.collisions).toHaveLength(1);
    expect(ds.collisions[0].variants.map((v) => v.occurrences[0].filePath).sort()).toEqual([
      'duplicates/a.json',
      'duplicates/b.json',
    ]);
    const same = ds.facts.find((f) => f.factId === 'SYN-DUP-SAME')!;
    expect(same.occurrences.map((o) => `${o.filePath} ${o.location}`)).toEqual([
      'duplicates/a.json $.facts[0]',
      'duplicates/b.json $.facts[0]',
    ]);
    expect(ds.duplicates).toHaveLength(1);
  });

  it('quarantines append collisions symmetrically and never mutates the base dataset', async () => {
    const base = await datasetOf([
      textFile(
        'base.json',
        JSON.stringify({ fact_id: 'X', entity_id: 'E', predicate: 'p', object_value: 1 }),
      ),
    ]);
    const snapshot = JSON.stringify(base.facts);
    const incoming = await batchOf(
      [
        textFile(
          'inc.json',
          JSON.stringify({ fact_id: 'X', entity_id: 'E', predicate: 'p', object_value: 2 }),
        ),
      ],
      nextBatchId(base),
    );
    const appended = buildDataset({ base, mode: 'append', batch: incoming });
    expect(appended.facts).toHaveLength(0);
    expect(appended.collisions[0].variants).toHaveLength(2);
    expect(JSON.stringify(base.facts)).toBe(snapshot);
    const replaced = buildDataset({ base, mode: 'replace', batch: incoming });
    expect(replaced.facts.map((f) => f.objectValue)).toEqual([2]);
  });

  it('preserves every occurrence when identical records are appended', async () => {
    const base = await datasetOf([
      textFile(
        'one.json',
        JSON.stringify({ fact_id: 'X', entity_id: 'E', predicate: 'p', object_value: 1 }),
      ),
    ]);
    const incoming = await batchOf(
      [
        textFile(
          'two.json',
          JSON.stringify({ object_value: 1, predicate: 'p', entity_id: 'E', fact_id: 'X' }),
        ),
      ],
      nextBatchId(base),
    );
    const merged = buildDataset({ base, mode: 'append', batch: incoming });
    expect(merged.facts).toHaveLength(1);
    expect(merged.facts[0].occurrences.map((o) => `${o.batchId}:${o.filePath}`)).toEqual(
      ['batch-2:two.json', 'batch-1:one.json'].sort(),
    );
    expect(mergeRecords([], []).variants).toEqual([]);
  });
});

describe('explicit evidence links', () => {
  it('links only by explicit IDs and supports multiple deductions per fact', async () => {
    const ctx = ctxOf(await datasetOf([fixtureInput('linked-evidence.json')]));
    expect(ctx.evidence.byFact.get('SYN-F-L1')!.map((l) => l.deductionId)).toEqual([
      'SYN-D-L1',
      'SYN-D-L2',
    ]);
    expect(ctx.evidence.byFact.get('SYN-F-L3')).toBeUndefined();
    expect(ctx.evidence.byDeduction.get('SYN-D-L3')).toBeUndefined();
    expect(ctx.evidence.byFact.get('SYN-F-L2')).toBeUndefined();
    expect(ctx.metas.find((m) => m.fact.factId === 'SYN-F-L3')!.values.entityType).toEqual([
      'Unknown entity type',
    ]);
    expect(ctx.metas.find((m) => m.fact.factId === 'SYN-F-L3')!.values.evidence).toEqual([
      'Supporting extraction not linked',
    ]);
    expect(ctx.metas.find((m) => m.fact.factId === 'SYN-F-L1')!.values.entityType).toEqual([
      'synthetic_sensor',
    ]);
  });

  it('flags dangling and conflicting explicit links and linked metadata conflicts', async () => {
    const ctx = ctxOf(await datasetOf([fixtureInput('link-problems.json')]));
    expect(ctx.evidence.dangling.map((d) => d.referencedId).sort()).toEqual([
      'SYN-D-MISSING',
      'SYN-F-NOT-THERE',
    ]);
    const p2 = ctx.evidence.links.find((l) => l.factId === 'SYN-F-P2')!;
    expect(p2.linkConflicts[0]).toMatch(/names fact SYN-F-P1/);
    const p3 = ctx.evidence.links.find((l) => l.factId === 'SYN-F-P3')!;
    expect(p3.metadataConflicts.length).toBe(3);
    expect([...ctx.evidence.conflictedFactIds].sort()).toEqual([
      'SYN-F-P1',
      'SYN-F-P2',
      'SYN-F-P3',
    ]);
  });

  it('prevents conflicting evidence from entering numeric analytics', async () => {
    const ds = await datasetOf([fixtureInput('link-problems.json')], {
      typeReview: reviewNumeric(['synthetic_temperature']),
    });
    const ctx = ctxOf(ds);
    const numeric = numericObservations(ds.facts, ds.settings, ctx.evidence);
    expect(numeric.rows).toHaveLength(0);
    expect(numeric.exclusions.every((e) => e.reason === 'evidence_conflict')).toBe(true);
  });
});

describe('timestamps and temporal diagnostics', () => {
  it('parses strictly and never assumes a timezone', () => {
    expect(parseTimestamp('2025-01-15T12:00:00+02:00')).toMatchObject({
      status: 'valid',
      epochMs: Date.parse('2025-01-15T10:00:00Z'),
    });
    expect(parseTimestamp('2025-01-01T10:00:00')).toEqual({
      status: 'ambiguous_timezone',
      reason: 'no_offset',
    });
    expect(parseTimestamp('2025-01-01')).toEqual({
      status: 'ambiguous_timezone',
      reason: 'date_only',
    });
    expect(parseTimestamp('2025-02-30T00:00:00Z').status).toBe('invalid');
    expect(parseTimestamp('2025-13-45T99:00:00Z').status).toBe('invalid');
    expect(parseTimestamp('yesterday').status).toBe('invalid');
  });

  it('flags invalid, ambiguous, reversed, current+superseded, self, cycle, dangling and keeps overlap informational', async () => {
    const ctx = ctxOf(await datasetOf([fixtureInput('temporal-edge-cases.json')]));
    const codes = (id: string) => (ctx.diagnostics.byFact.get(id) ?? []).map((i) => i.code);
    expect(codes('SYN-T-BADDATE')).toEqual(expect.arrayContaining(['invalid_timestamp']));
    expect(codes('SYN-T-AMBIGUOUS')).toEqual(['ambiguous_timezone', 'ambiguous_timezone']);
    expect(codes('SYN-T-REVERSED')).toContain('reversed_interval');
    expect(codes('SYN-T-OLD')).toContain('current_with_superseded_by');
    expect(ctx.dataset.facts.some((f) => f.factId === 'SYN-T-OLD')).toBe(true);
    expect(codes('SYN-T-SELF')).toContain('self_supersession');
    expect(codes('SYN-T-CYC-A')).toContain('supersession_cycle');
    expect(ctx.diagnostics.cycles).toEqual([['SYN-T-CYC-A', 'SYN-T-CYC-B']]);
    expect(codes('SYN-T-DANGLING')).toContain('missing_reference');
    expect(ctx.diagnostics.overlaps).toEqual([
      {
        entityId: 'SYN-E2',
        predicate: 'synthetic_status',
        factIds: ['SYN-T-BOUNDED', 'SYN-T-OVERLAP'],
      },
    ]);
    expect(codes('SYN-T-BOUNDED')).toEqual([]);
    expect(codes('SYN-T-NEW')).toEqual(['current_with_superseded_by'].filter(() => false));
  });

  it('draws the supplied timeline with open/missing endpoints labeled and no invented dates', async () => {
    const ds = await datasetOf([fixtureInput('temporal-edge-cases.json')]);
    const { rows, excluded } = validityTimeline(ds.facts);
    const open = rows.find((r) => r.fact_id === 'SYN-T-OPEN')!;
    expect(open).toMatchObject({
      end_ms: null,
      end_state: 'null',
      endpoint_kind: 'start only (valid_to null)',
    });
    expect(rows.find((r) => r.fact_id === 'SYN-T-MISSING')).toMatchObject({
      end_ms: null,
      end_state: 'missing',
    });
    expect(excluded.map((e) => e.fact.factId)).toEqual(
      expect.arrayContaining(['SYN-T-AMBIGUOUS', 'SYN-T-REVERSED', 'SYN-T-BADDATE']),
    );
  });

  it('gates snapshots until validity semantics are explicitly configured', async () => {
    const ds = await datasetOf([fixtureInput('temporal-edge-cases.json')]);
    expect(snapshotReadiness(ds.settings.temporal).ready).toBe(false);
    expect(snapshotAt(ds.facts, ds.settings.temporal).valid).toEqual([]);
    expect(snapshotReadiness(ds.settings.temporal).missing.length).toBe(5);
  });

  const configure = (
    convention:
      | 'inclusive_start_exclusive_end'
      | 'inclusive_both'
      | 'exclusive_start_inclusive_end'
      | 'exclusive_both',
    at: string,
    extra = {},
  ) =>
    patchTemporal(defaultSettings(), {
      intervalsConfirmed: true,
      endpointConvention: convention,
      nullValidTo: 'open_ended',
      nullValidFrom: 'open_ended',
      missingEndpointPolicy: 'unresolved',
      referenceTime: at,
      ...extra,
    }).temporal;

  it('applies endpoint conventions at boundaries and null/missing policies', async () => {
    const ds = await datasetOf([fixtureInput('temporal-edge-cases.json')]);
    const ids = (r: { valid: { factId: string }[] }) => r.valid.map((f) => f.factId).sort();
    const at = (cfg: ReturnType<typeof configure>) => snapshotAt(ds.facts, cfg);
    // BOUNDED ends 2025-02-01T00:00:00Z exactly.
    expect(
      ids(at(configure('inclusive_start_exclusive_end', '2025-02-01T00:00:00Z'))),
    ).not.toContain('SYN-T-BOUNDED');
    expect(ids(at(configure('inclusive_both', '2025-02-01T00:00:00Z')))).toContain('SYN-T-BOUNDED');
    // BOUNDED starts 2025-01-01T00:00:00Z exactly.
    expect(
      ids(at(configure('exclusive_start_inclusive_end', '2025-01-01T00:00:00Z'))),
    ).not.toContain('SYN-T-BOUNDED');
    expect(ids(at(configure('inclusive_start_exclusive_end', '2025-01-01T00:00:00Z')))).toContain(
      'SYN-T-BOUNDED',
    );
    expect(ids(at(configure('exclusive_both', '2025-01-20T00:00:00Z')))).toEqual(
      ['SYN-T-BOUNDED', 'SYN-T-OPEN', 'SYN-T-OVERLAP'].sort(),
    );
    const unresolved = at(configure('inclusive_both', '2025-01-20T00:00:00Z'));
    expect(unresolved.unresolved.map((u) => u.fact.factId)).toContain('SYN-T-MISSING');
    expect(unresolved.unresolved.map((u) => u.fact.factId)).toContain('SYN-T-REVERSED');
    const open = snapshotAt(
      ds.facts,
      configure('inclusive_both', '2025-01-20T00:00:00Z', {
        missingEndpointPolicy: 'treat_as_open',
      }),
    );
    expect(ids(open)).toContain('SYN-T-MISSING');
    const unknownNull = snapshotAt(
      ds.facts,
      configure('inclusive_both', '2025-01-20T00:00:00Z', { nullValidTo: 'unknown' }),
    );
    expect(unknownNull.unresolved.map((u) => u.fact.factId)).toContain('SYN-T-OPEN');
  });

  it('keeps literal current filtering separate from validity', async () => {
    const ds = await datasetOf([fixtureInput('temporal-edge-cases.json')]);
    expect(
      ds.facts
        .filter((f) => currentMatches(f, 'true'))
        .map((f) => f.factId)
        .sort(),
    ).toEqual(['SYN-T-NEW', 'SYN-T-OLD']);
    expect(ds.facts.filter((f) => currentMatches(f, 'unknown')).length).toBe(ds.facts.length - 2);
  });
});

describe('grouping, numeric and unit handling', () => {
  it('builds facets with multi-filter counts, topic mapping and unknown labels', async () => {
    const ds = await datasetOf([fixtureInput('facts-only.json')]);
    const mapped = {
      ...ds,
      settings: { ...ds.settings, topicMap: { synthetic_price: 'Pricing' } },
    };
    const ctx = ctxOf(mapped);
    const counts = facetCounts(ctx.metas, EMPTY_FILTERS);
    expect(counts.topic.find((t) => t.value === 'Pricing')!.count).toBe(1);
    expect(counts.entityType.find((t) => t.value === 'Unknown entity type')!.count).toBe(6);
    expect(counts.unit.find((t) => t.value === 'Unknown unit')!.count).toBe(4);
    const filters = {
      facets: { predicate: ['synthetic_temperature'], unit: ['synthetic degrees'] },
      text: '',
    };
    expect(applyFilters(ctx.metas, filters)).toHaveLength(3);
    expect(facetCounts(ctx.metas, filters).entityId).toEqual([
      { value: 'SYN-ENTITY-ALPHA', count: 3 },
    ]);
    expect(ctx.metas.reduce((n, m) => n + (m.values.predicate.length ? 1 : 0), 0)).toBe(
      ds.facts.length,
    );
  });

  it('converts conservatively and never turns null/empty into zero', () => {
    expect(convertNumeric(12.5, 'p')).toMatchObject({ ok: true, value: 12.5 });
    expect(convertNumeric('22.5', 'p')).toMatchObject({ ok: true, via: 'strict_decimal_string' });
    for (const bad of [null, '', '  ', '1,234', '007', '1e3', '$5', true, [1], { a: 1 }])
      expect(convertNumeric(bad, 'p').ok).toBe(false);
    expect(convertNumeric(5, 'item_id').ok).toBe(false);
  });

  it('plots numeric points only for reviewed types, explicit compatible units and valid times', async () => {
    const ds = await datasetOf([fixtureInput('facts-only.json')]);
    const ctx = ctxOf(ds);
    expect(numericObservations(ds.facts, ds.settings, ctx.evidence).rows).toHaveLength(0);
    const reviewed = {
      ...ds.settings,
      typeReview: reviewNumeric(['synthetic_temperature', 'synthetic_count', 'synthetic_price']),
    };
    const out = numericObservations(ds.facts, reviewed, ctx.evidence);
    expect(out.unitGroups).toEqual([
      { unit: 'synthetic degrees', count: 3 },
      { unit: 'currency SYN', count: 1 },
      { unit: 'synthetic kelvin', count: 1 },
    ]);
    expect(out.rows.map((r) => r.fact_id)).toEqual(['SYN-F-001', 'SYN-F-002', 'SYN-F-003']);
    expect(out.rows[1].original_value).toBe('21');
    const reasons = (r: string) =>
      out.exclusions
        .filter((e) => e.reason === r)
        .map((e) => e.fact.factId)
        .sort();
    expect(reasons('different_unit')).toEqual(['SYN-F-004', 'SYN-F-007']);
    expect(reasons('unknown_unit')).toEqual(['SYN-F-006']);
    expect(reasons('non_numeric_value')).toEqual(['SYN-F-009']);
    expect(reasons('not_reviewed_numeric')).toContain('SYN-F-005');
    expect(reasons('missing_or_invalid_time')).toEqual([]);
    expect(
      numericObservations(ds.facts, reviewed, ctx.evidence, 'synthetic kelvin').rows.map(
        (r) => r.fact_id,
      ),
    ).toEqual(['SYN-F-004']);
    const byValid = numericObservations(
      ds.facts,
      { ...reviewed, temporal: { ...reviewed.temporal, timestampField: 'valid_from' } },
      ctx.evidence,
    );
    expect(
      byValid.exclusions.filter((e) => e.reason === 'missing_or_invalid_time').length,
    ).toBeGreaterThan(0);
    const withUnit = numericObservations(
      ds.facts,
      { ...reviewed, unitOverrides: { synthetic_count: 'synthetic items' } },
      ctx.evidence,
    );
    expect(withUnit.unitGroups.map((g) => g.unit)).toContain('synthetic items');
  });
});

describe('recommendation integration', () => {
  it('runs the typed imported path with ranking, eligibility and explained exclusions', async () => {
    const ds = await datasetOf([
      fixtureInput('facts-only.json'),
      fixtureInput('linked-evidence.json'),
    ]);
    const ctx = prepareImported(ds);
    const req = { dataset: 'imported' as const, context: ctx, facts: ds.facts };
    const analyst = recommend({ ...req, audience: 'Analyst' });
    expect(analyst.dataset).toBe('imported');
    expect(analyst.profile.fields.find((f) => f.name === 'object_value')!.analyticsReady).toBe(
      false,
    );
    expect(analyst.profile.spatialFields).toEqual([]);
    const excluded = Object.fromEntries(
      analyst.excluded.map((e) => [e.kind, e.reasons.map((r) => r.kind)]),
    );
    expect(excluded.numeric_observations).toContain('no_numeric_type');
    expect(excluded.historical_snapshot).toEqual(['unconfigured_validity']);
    expect(excluded.spatial_map).toEqual(['no_spatial_fields']);
    expect(excluded.supersession_history).toEqual(['no_supersession_links']);
    expect(analyst.ranked.map((r) => r.kind)).toEqual(
      expect.arrayContaining(['fact_table', 'validity_timeline', 'provenance_evidence']),
    );
    expect(recommend({ ...req, audience: 'Analyst' }).ranked.map((r) => r.id)).toEqual(
      analyst.ranked.map((r) => r.id),
    );
    expect(analyst.ranked.map((r) => r.rank)).toEqual(analyst.ranked.map((_, i) => i + 1));
    expect(analyst.ranked.every((r) => r.cautions.length > 0)).toBe(true);
    const commander = recommend({ ...req, audience: 'Commander' });
    expect(commander.ranked.length).toBeLessThanOrEqual(3);
    expect(commander.ranked[0].kind).toBe('fact_table');
    expect(commander.excluded.map((e) => e.kind)).toEqual(analyst.excluded.map((e) => e.kind));
  });

  it('explains missing-time and unknown-unit exclusions for numeric views', async () => {
    const ds = await datasetOf(
      [
        textFile(
          'n.json',
          JSON.stringify([
            {
              fact_id: 'N1',
              entity_id: 'E',
              predicate: 'm',
              object_value: 1,
              unit: 'u',
              as_of: '2025-01-01T00:00:00',
            },
            {
              fact_id: 'N2',
              entity_id: 'E',
              predicate: 'm',
              object_value: 2,
              as_of: '2025-01-01T00:00:00Z',
            },
          ]),
        ),
      ],
      { typeReview: reviewNumeric(['m']) },
    );
    const result = recommend({
      dataset: 'imported',
      context: prepareImported(ds),
      facts: ds.facts,
      audience: 'Analyst',
    });
    const numeric = result.excluded.find((e) => e.kind === 'numeric_observations')!;
    expect(numeric.reasons.map((r) => r.kind)).toEqual(['missing_or_invalid_time', 'unknown_unit']);
  });

  it('produces compilable Vega-Lite specs without expressions or data-derived fields', async () => {
    const ds = await datasetOf([
      fixtureInput('facts-only.json'),
      fixtureInput('temporal-edge-cases.json'),
    ]);
    const configured = {
      ...ds,
      settings: { ...ds.settings, typeReview: reviewNumeric(['synthetic_temperature']) },
    };
    const result = recommend({
      dataset: 'imported',
      context: prepareImported(configured),
      facts: configured.facts,
      audience: 'Analyst',
    });
    const specs = result.ranked.filter((r) => r.vegaLiteSpec);
    expect(specs.map((r) => r.kind).sort()).toEqual(['numeric_observations', 'validity_timeline']);
    for (const r of specs) {
      expect(() => compile(r.vegaLiteSpec as unknown as TopLevelSpec)).not.toThrow();
      const text = JSON.stringify({ ...r.vegaLiteSpec, data: undefined });
      expect(text).not.toMatch(/"(expr|signal)"|datum\./);
      const values = (r.vegaLiteSpec!.data as { values: Record<string, unknown>[] }).values;
      expect(values.every((v) => typeof v.fact_id === 'string')).toBe(true);
    }
    const numeric = specs.find((s) => s.kind === 'numeric_observations')!.vegaLiteSpec!;
    expect(numeric.mark).toMatchObject({ type: 'point' });
  });

  it('offers a gated snapshot once validity is configured', async () => {
    const ds = await datasetOf([fixtureInput('temporal-edge-cases.json')]);
    const configured = {
      ...ds,
      settings: patchTemporal(ds.settings, {
        intervalsConfirmed: true,
        endpointConvention: 'inclusive_both',
        nullValidTo: 'open_ended',
        missingEndpointPolicy: 'unresolved',
        referenceTime: '2025-01-20T00:00:00Z',
      }),
    };
    const result = recommend({
      dataset: 'imported',
      context: prepareImported(configured),
      facts: configured.facts,
      audience: 'Analyst',
    });
    expect(result.ranked.map((r) => r.kind)).toContain('historical_snapshot');
    expect(result.artifacts.snapshot.unresolved.length).toBeGreaterThan(0);
  });

  it('keeps the legacy Cedar Watch request shape working', async () => {
    const { dataset } = await import('../data/seedData');
    const { profileReports } = await import('../lib/profiler');
    const { recommendModels } = await import('../lib/modelSelection');
    const { analyzeReports } = await import('../lib/analysis');
    const { DEFAULT_WEIGHTS } = await import('../domain/constants');
    const { DEFAULT_MISSION_CONTEXT } = await import('../domain/mdmp');
    const reports = dataset.reports.filter((r) => r.scenario_id === 'corroboration');
    const profile = profileReports(reports);
    const analysis = analyzeReports(reports);
    const data = reports.map((r) => ({
      ...r,
      day: r.report_time.slice(0, 10),
      source_type: 'x',
      uncertainty_lower: null,
      uncertainty_upper: null,
      salience: 0.5,
      analysis: analysis.get(r.report_id),
    }));
    const result = recommend({
      task: 'compare_categories',
      profile,
      modeling: recommendModels(profile, 'compare_categories')[0],
      weights: DEFAULT_WEIGHTS,
      data: data as never,
      audience: 'Analyst',
      context: DEFAULT_MISSION_CONTEXT,
    });
    expect(result.ranked.length).toBeGreaterThan(0);
    expect(result).not.toHaveProperty('dataset');
  });
});

describe('limits, progress and cancellation', () => {
  const many = Array.from({ length: 5 }, (_, i) =>
    textFile(
      `f${i}.json`,
      JSON.stringify({ fact_id: `F${i}`, entity_id: 'E', predicate: 'p', object_value: i }),
    ),
  );

  it('enforces file, byte and record limits deterministically regardless of input order', async () => {
    const run = (inputs: typeof many, limits: Partial<typeof DEFAULT_LIMITS>) =>
      processFiles(inputs, { batchId: 'b', label: 'l', limits });
    const forward = await run(many, { maxFiles: 2 });
    const reversed = await run([...many].reverse(), { maxFiles: 2 });
    expect(forward!.records.map((r) => r.occurrence.filePath)).toEqual(['f0.json', 'f1.json']);
    expect(reversed!.records.map((r) => r.occurrence.filePath)).toEqual(['f0.json', 'f1.json']);
    expect(forward!.counts.skippedLimit).toBe(3);
    const bytes = await run(many, { maxFileBytes: 10 });
    expect(bytes!.records).toHaveLength(0);
    expect(bytes!.issues.every((i) => i.code === 'file_size_limit')).toBe(true);
    const total = await run(many, { maxTotalBytes: 150 });
    expect(total!.issues.some((i) => i.code === 'total_size_limit')).toBe(true);
    const records = await processFiles(
      [
        textFile(
          'arr.json',
          JSON.stringify(
            Array.from({ length: 10 }, (_, i) => ({
              fact_id: `A${i}`,
              entity_id: 'E',
              predicate: 'p',
              object_value: i,
            })),
          ),
        ),
      ],
      { batchId: 'b', label: 'l', limits: { maxRecords: 4 } },
    );
    expect(records!.records).toHaveLength(4);
    expect(records!.excluded.filter((e) => e.code === 'record_limit')).toHaveLength(6);
  });

  it('reports progress and returns nothing when cancelled', async () => {
    const seen: number[] = [];
    const token = { cancelled: false };
    const result = await processFiles(many, {
      batchId: 'b',
      label: 'l',
      token,
      onProgress: (p) => {
        seen.push(p.done);
        if (p.done === 2) token.cancelled = true;
      },
    });
    expect(result).toBeNull();
    expect(seen).toEqual([0, 1, 2]);
  });

  it('reports unreadable files without losing others', async () => {
    const result = await processFiles(
      [{ path: 'bad.json', size: 3, read: () => Promise.reject(new Error('boom')) }, many[0]],
      { batchId: 'b', label: 'l' },
    );
    expect(result!.counts.failed).toBe(1);
    expect(result!.records).toHaveLength(1);
  });
});

describe('templates and exports', () => {
  it('provides valid, clearly synthetic templates', async () => {
    for (const t of [FACT_TEMPLATE, DEDUCTION_TEMPLATE, LINKED_TEMPLATE]) {
      const batch = await batchOf([textFile('t.json', t)]);
      expect(batch.issues.filter((i) => i.severity === 'error')).toEqual([]);
      expect(batch.files[0].envelopeExtras.synthetic).toBe(true);
      expect(t).toMatch(/SYNTHETIC/);
    }
  });

  it('exports raw and normalized records with temporal and grouping context and re-imports', async () => {
    const ds = await datasetOf([fixtureInput('linked-evidence.json')]);
    const configured = {
      ...ds,
      settings: {
        ...patchTemporal(ds.settings, { asOfMeaning: 'documented by me' }),
        topicMap: { synthetic_label: 'Labels' },
      },
    };
    const out = buildNormalizedExport(configured);
    expect(out.sensitive_content_warning).toMatch(/source text/);
    expect(out.temporal_settings.asOfMeaning).toBe('documented by me');
    expect(out.temporal_settings.origins.asOfMeaning).toBe('user_configured');
    expect(out.grouping_settings.topic_map).toEqual({ synthetic_label: 'Labels' });
    expect(out.facts).toEqual(ds.facts.map((f) => f.raw));
    expect(out.normalized_facts[0]).not.toHaveProperty('raw');
    const again = await datasetOf([textFile('export.json', JSON.stringify(out))]);
    expect(again.facts).toHaveLength(3);
    expect(again.deductions).toHaveLength(3);
  });
});
