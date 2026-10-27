import { temporalDiagnostics } from './temporal';
import { IMPORT_SCHEMA_VERSION, type ImportedDataset } from './types';

export const EXPORT_WARNING =
  'Normalized exports can contain source text, extraction raw text, file paths and provenance from the imported data. Share them only where that is appropriate.';

const withoutRaw = <T extends { raw: unknown }>(record: T) => {
  const copy: Partial<T> = { ...record };
  delete copy.raw;
  return copy;
};

/**
 * Re-importable envelope: `facts`/`deductions` are the immutable original records; normalized
 * values, temporal configuration and grouping context travel alongside them.
 */
export function buildNormalizedExport(dataset: ImportedDataset) {
  const { settings } = dataset;
  const diagnostics = temporalDiagnostics(dataset.facts);
  return {
    schema_version: IMPORT_SCHEMA_VERSION,
    synthetic: dataset.synthetic,
    export_kind: 'normalized',
    sensitive_content_warning: EXPORT_WARNING,
    label: dataset.label,
    facts: dataset.facts.map((f) => f.raw),
    deductions: dataset.deductions.map((d) => d.raw),
    normalized_facts: dataset.facts.map((f) => withoutRaw(f)),
    normalized_deductions: dataset.deductions.map((d) => withoutRaw(d)),
    temporal_settings: settings.temporal,
    grouping_settings: {
      topic_map: settings.topicMap,
      type_review: settings.typeReview,
      unit_overrides: settings.unitOverrides,
    },
    temporal_diagnostics: diagnostics.issues,
    batches: dataset.batches,
    files: dataset.files,
    collisions: dataset.collisions,
    duplicates: dataset.duplicates,
    excluded_records: dataset.excluded,
    issues: dataset.issues,
  };
}

export function downloadText(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
