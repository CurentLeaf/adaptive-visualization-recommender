import type { DataProfile, FieldProfile, Report } from '../domain/types';
const uncertainty = ['source_confidence', 'validation_score', 'corroboration_count', 'conflict_score', 'report_age_hours', 'missingness_score', 'anomaly_score', 'translation_status', 'human_verified'];
const provenance = [
  'report_id',
  'source_id',
  'observed_at',
  'received_at',
  'received_time',
  'translation_status',
  'human_verified',
];
export function profileReports(rows: Report[]): DataProfile {
  const names = rows.length ? Object.keys(rows[0]) : [];
  const fields: FieldProfile[] = names.map((name) => {
    const values = rows.map((r) => r[name as keyof Report]);
    const present = values.filter((v) => v !== null && v !== undefined && v !== '');
    const first = present[0];
    const inferredType: FieldProfile['inferredType'] = name.endsWith('_id')
      ? 'id'
      : name.endsWith('_time') || name.endsWith('_at')
        ? 'temporal'
        : typeof first === 'boolean'
          ? 'boolean'
          : typeof first === 'number'
            ? 'quantitative'
            : name.includes('summary') || name.includes('description')
              ? 'text'
              : 'nominal';
    const sortable = present.filter((v): v is number | string => typeof v === 'number' || typeof v === 'string').sort((a, b) => typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)));
    return { name, inferredType, nullableCount: rows.length - present.length, missingRate: rows.length ? (rows.length - present.length) / rows.length : 0, uniqueCount: new Set(present.map((v) => JSON.stringify(v))).size, min: sortable[0], max: sortable.at(-1), exampleValues: [...new Set(present.map((v) => JSON.stringify(v)))].slice(0, 3).map((v) => JSON.parse(v)) };
  });
  const ofType = (type: FieldProfile['inferredType']) => fields.filter((f) => f.inferredType === type).map((f) => f.name);
  return {
    rowCount: rows.length,
    fields,
    temporalFields: ofType('temporal'),
    geographicFields: ofType('geographic'),
    numericFields: ofType('quantitative'),
    categoricalFields: [...ofType('nominal'), ...ofType('boolean')],
    idFields: ofType('id'),
    uncertaintyFields: uncertainty.filter((field) => names.includes(field)),
    provenanceFields: provenance.filter((field) => names.includes(field)),
    recommendedPrimaryTimeField: names.includes('observed_at')
      ? 'observed_at'
      : names.includes('report_time')
        ? 'report_time'
        : undefined,
    recommendedPrimaryGeoFields: undefined,
  };
}
