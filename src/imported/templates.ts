import { IMPORT_SCHEMA_VERSION } from './types';

const envelope = (extra: Record<string, unknown>) =>
  JSON.stringify({ schema_version: IMPORT_SCHEMA_VERSION, synthetic: true, ...extra }, null, 2);

/** Editable, clearly synthetic templates. source_file_path is inert text and is never opened. */
export const FACT_TEMPLATE = envelope({
  facts: [
    {
      fact_id: 'SYNTHETIC-FACT-001',
      entity_id: 'SYNTHETIC-ENTITY-A',
      predicate: 'synthetic_measure',
      object_value: 12.5,
      unit: 'synthetic units',
      as_of: '2025-01-01T00:00:00Z',
      current: true,
      valid_from: '2025-01-01T00:00:00Z',
      valid_to: null,
      supersedes: [],
      superseded_by: [],
    },
  ],
});

export const DEDUCTION_TEMPLATE = envelope({
  deductions: [
    {
      deduction_id: 'SYNTHETIC-DEDUCTION-001',
      source_file_path: 'synthetic/not-a-real-file.txt',
      chunk_id: 'SYNTHETIC-CHUNK-001',
      as_of: '2025-01-01T00:00:00Z',
      subject_entity: 'SYNTHETIC-ENTITY-A',
      subject_entity_type: 'synthetic_type',
      predicate: 'synthetic_measure',
      object_value: 12.5,
      object_type: 'number',
      extraction_method: 'synthetic_example',
      confidence: 0.5,
      provenance: {
        extraction_path: 'synthetic/example',
        model_used: 'none (synthetic)',
        raw_text: 'Synthetic text: the measure is 12.5 synthetic units.',
      },
      metadata: {
        file_hash: null,
        chunk_index: 0,
        total_chunks: 1,
        start_offset: 0,
        end_offset: 52,
      },
    },
  ],
});

export const LINKED_TEMPLATE = envelope({
  facts: [
    {
      fact_id: 'SYNTHETIC-FACT-001',
      entity_id: 'SYNTHETIC-ENTITY-A',
      predicate: 'synthetic_measure',
      object_value: 12.5,
      unit: 'synthetic units',
      as_of: '2025-01-01T00:00:00Z',
      supporting_deduction_ids: ['SYNTHETIC-DEDUCTION-001'],
    },
  ],
  deductions: [
    {
      deduction_id: 'SYNTHETIC-DEDUCTION-001',
      fact_id: 'SYNTHETIC-FACT-001',
      subject_entity: 'SYNTHETIC-ENTITY-A',
      predicate: 'synthetic_measure',
      object_value: 12.5,
      confidence: 0.5,
      provenance: { raw_text: 'Synthetic text: the measure is 12.5 synthetic units.' },
    },
  ],
});
