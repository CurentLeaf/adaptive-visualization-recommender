import type { Provenance, Report } from '../../domain/types';
import {
  QUALITY_DIMENSIONS,
  QUALITY_DIMENSION_LABELS,
  buildEvidenceQualityRows,
} from '../../lib/evidenceQuality';

export function EvidenceQualityMatrix({
  reports,
  provenance,
  exerciseAsOfTime,
  selectedId,
  onSelect,
  detailed = true,
}: {
  reports: Report[];
  provenance: Provenance[];
  exerciseAsOfTime?: string;
  selectedId?: string;
  onSelect: (reportId: string) => void;
  detailed?: boolean;
}) {
  const rows = buildEvidenceQualityRows(reports, provenance, exerciseAsOfTime);
  return (
    <section className="evidence-matrix" aria-labelledby="evidence-matrix-title">
      <h3 id="evidence-matrix-title">Evidence-quality matrix</h3>
      <p className="help">
        One row per report, with each quality dimension kept separate and no combined trust score.
        Unknown, not-recorded and not-applicable values are shown as such, never as zero. Selecting
        a row selects the same report in the charts and opens its recorded provenance trail.
      </p>
      {rows.length === 0 ? (
        <p className="empty">No reports match the filters.</p>
      ) : (
        <div className="tablewrap">
          <table>
            <caption className="visually-hidden">Evidence quality by report</caption>
            <thead>
              <tr>
                <th scope="col">Report</th>
                {QUALITY_DIMENSIONS.map((dimension) => (
                  <th scope="col" key={dimension}>
                    {QUALITY_DIMENSION_LABELS[dimension]}
                  </th>
                ))}
                {detailed && <th scope="col">Recorded provenance</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const selected = row.reportId === selectedId;
                return (
                  <tr key={row.reportId} className={selected ? 'selected-row' : undefined}>
                    <th scope="row">
                      <button
                        type="button"
                        className="link-button"
                        aria-pressed={selected}
                        aria-label={`Select report ${row.reportId}: ${row.title}`}
                        onClick={() => onSelect(row.reportId)}
                      >
                        {row.reportId}
                      </button>
                      <br />
                      <small>{row.title}</small>
                    </th>
                    {QUALITY_DIMENSIONS.map((dimension) => (
                      <td key={dimension} data-state={row.cells[dimension].state}>
                        {row.cells[dimension].text}
                      </td>
                    ))}
                    {detailed && <td>{row.provenanceNote}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
