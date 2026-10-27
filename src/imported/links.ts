import { jsonEqual } from './json';
import type { ImportedDataset, ImportedDeduction, ImportedFact } from './types';

export type EvidenceLink = {
  factId: string;
  deductionId: string;
  assertedBy: ('fact' | 'deduction')[];
  /** Conflicting explicit ID claims about the same deduction. */
  linkConflicts: string[];
  /** Differences between linked records' own metadata; never used to create links. */
  metadataConflicts: string[];
};

export type DanglingLink = {
  assertedBy: 'fact' | 'deduction';
  ownerId: string;
  referencedKind: 'fact' | 'deduction';
  referencedId: string;
  reason: 'missing' | 'quarantined_collision';
};

export type EvidenceIndex = {
  links: EvidenceLink[];
  byFact: Map<string, EvidenceLink[]>;
  byDeduction: Map<string, EvidenceLink[]>;
  dangling: DanglingLink[];
  /** Facts whose explicit evidence links or linked metadata conflict. */
  conflictedFactIds: Set<string>;
};

/**
 * Links come exclusively from explicit IDs: fact.supporting_deduction_ids and deduction.fact_id.
 * Entity, predicate, value, time, ID similarity and hashes are never used to create a link.
 */
export function buildEvidenceIndex(
  dataset: Pick<ImportedDataset, 'facts' | 'deductions' | 'collisions'>,
): EvidenceIndex {
  const facts = new Map(dataset.facts.map((f) => [f.factId, f]));
  const deductions = new Map(dataset.deductions.map((d) => [d.deductionId, d]));
  const quarantined = new Set(dataset.collisions.map((c) => `${c.kind}:${c.id}`));
  const pairs = new Map<string, EvidenceLink>();
  const dangling: DanglingLink[] = [];
  const assertion = (factId: string, deductionId: string, by: 'fact' | 'deduction') => {
    const factExists = facts.has(factId);
    const deductionExists = deductions.has(deductionId);
    if (!factExists || !deductionExists) {
      const missingKind = factExists ? 'deduction' : 'fact';
      const referencedId = factExists ? deductionId : factId;
      const reason = quarantined.has(`${missingKind}:${referencedId}`)
        ? 'quarantined_collision'
        : 'missing';
      const duplicate = dangling.some(
        (d) =>
          d.assertedBy === by &&
          d.ownerId === (by === 'fact' ? factId : deductionId) &&
          d.referencedId === referencedId,
      );
      if (!duplicate)
        dangling.push({
          assertedBy: by,
          ownerId: by === 'fact' ? factId : deductionId,
          referencedKind: missingKind,
          referencedId,
          reason,
        });
      return;
    }
    const key = `${factId}\u0000${deductionId}`;
    const link = pairs.get(key) ?? {
      factId,
      deductionId,
      assertedBy: [],
      linkConflicts: [],
      metadataConflicts: [],
    };
    if (!link.assertedBy.includes(by)) link.assertedBy.push(by);
    pairs.set(key, link);
  };
  for (const fact of dataset.facts)
    for (const id of new Set(fact.supportingDeductionIds)) assertion(fact.factId, id, 'fact');
  for (const deduction of dataset.deductions)
    if (deduction.factId) assertion(deduction.factId, deduction.deductionId, 'deduction');

  const claimsByDeduction = new Map<string, EvidenceLink[]>();
  for (const link of pairs.values())
    claimsByDeduction.set(link.deductionId, [
      ...(claimsByDeduction.get(link.deductionId) ?? []),
      link,
    ]);
  for (const [deductionId, claims] of claimsByDeduction) {
    const named = deductions.get(deductionId)?.factId;
    for (const link of claims) {
      if (named && link.factId !== named)
        link.linkConflicts.push(
          `Deduction ${deductionId} names fact ${named} but fact ${link.factId} lists it.`,
        );
      else if (named && claims.some((other) => other.factId !== named))
        link.linkConflicts.push(`Deduction ${deductionId} is also listed by another fact.`);
    }
  }
  for (const link of pairs.values()) {
    link.metadataConflicts = metadataConflicts(
      facts.get(link.factId)!,
      deductions.get(link.deductionId)!,
    );
  }
  const links = [...pairs.values()].sort((a, b) =>
    a.factId < b.factId ? -1 : a.factId > b.factId ? 1 : a.deductionId < b.deductionId ? -1 : 1,
  );
  const byFact = new Map<string, EvidenceLink[]>();
  const byDeduction = new Map<string, EvidenceLink[]>();
  for (const link of links) {
    byFact.set(link.factId, [...(byFact.get(link.factId) ?? []), link]);
    byDeduction.set(link.deductionId, [...(byDeduction.get(link.deductionId) ?? []), link]);
  }
  const conflictedFactIds = new Set<string>();
  for (const link of links)
    if (link.linkConflicts.length || link.metadataConflicts.length)
      conflictedFactIds.add(link.factId);
  // Linked deductions that disagree with each other about the entity type also conflict.
  for (const [factId, factLinks] of byFact) {
    const types = new Set(
      factLinks
        .map((l) => deductions.get(l.deductionId)?.subjectEntityType)
        .filter((t): t is string => !!t),
    );
    if (types.size > 1) conflictedFactIds.add(factId);
  }
  return { links, byFact, byDeduction, dangling, conflictedFactIds };
}

function metadataConflicts(fact: ImportedFact, deduction: ImportedDeduction): string[] {
  const out: string[] = [];
  if (deduction.subjectEntity !== null && deduction.subjectEntity !== fact.entityId)
    out.push(
      `subject_entity ${JSON.stringify(deduction.subjectEntity)} differs from entity_id ${JSON.stringify(fact.entityId)}`,
    );
  if (deduction.predicate !== null && deduction.predicate !== fact.predicate)
    out.push(
      `predicate ${JSON.stringify(deduction.predicate)} differs from fact predicate ${JSON.stringify(fact.predicate)}`,
    );
  if (deduction.hasObjectValue && !jsonEqual(deduction.objectValue, fact.objectValue))
    out.push(
      `object_value ${JSON.stringify(deduction.objectValue)} differs from fact object_value ${JSON.stringify(fact.objectValue)}`,
    );
  if (
    fact.entityType &&
    deduction.subjectEntityType &&
    fact.entityType !== deduction.subjectEntityType
  )
    out.push(
      `subject_entity_type ${JSON.stringify(deduction.subjectEntityType)} differs from entity_type ${JSON.stringify(fact.entityType)}`,
    );
  return out;
}

export const linkedDeductions = (
  index: EvidenceIndex,
  deductions: ImportedDeduction[],
  factId: string,
): ImportedDeduction[] => {
  const byId = new Map(deductions.map((d) => [d.deductionId, d]));
  return (index.byFact.get(factId) ?? [])
    .map((l) => byId.get(l.deductionId))
    .filter((d): d is ImportedDeduction => !!d);
};
