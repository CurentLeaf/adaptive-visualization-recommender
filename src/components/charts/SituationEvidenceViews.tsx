import type { Location, Report, Source } from '../../domain/types';

const timeOf = (value: string) => value.slice(11, 16);
const quantityOf = (report: Report) => {
  if (report.count_precision === 'unknown' || report.reported_count === null) return 'Unknown count';
  const unit = report.count_unit;
  if (report.count_precision === 'approximate') return `Approximately ${report.reported_count} ${unit}`;
  if (report.count_precision === 'range')
    return `Reported range ${report.reported_count_lower}–${report.reported_count_upper} ${unit}`;
  return `${report.reported_count} ${unit} (exact as reported)`;
};
const titleFor = (report: Report) =>
  `${report.report_title}. ${quantityOf(report)}. ${report.location_name}. Observed ${timeOf(report.observed_at)} and received ${timeOf(report.received_at)}.`;

export function ReportComparisonTable({
  reports,
  sources,
  selectedId,
  onSelect,
}: {
  reports: Report[];
  sources: Source[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const sourceNames = new Map(sources.map((source) => [source.source_id, source.display_name]));
  const chronological = [...reports].sort((left, right) =>
    left.observed_at.localeCompare(right.observed_at),
  );
  return (
    <div className="tablewrap">
      <table className="situation-table">
        <caption>
          Source-reported observations in time order. Reports may refer to the same items; counts
          are not added.
        </caption>
        <thead>
          <tr>
            <th scope="col">Reported observation</th>
            <th scope="col">Source</th>
            <th scope="col">Location and activity</th>
            <th scope="col">Reported quantity</th>
            <th scope="col">Observed</th>
            <th scope="col">Received</th>
            <th scope="col">Evidence status</th>
          </tr>
        </thead>
        <tbody>
          {chronological.map((report) => (
            <tr key={report.report_id} className={selectedId === report.report_id ? 'selected' : ''}>
              <th scope="row">
                <button
                  className="text-button"
                  type="button"
                  aria-pressed={selectedId === report.report_id}
                  aria-label={`Inspect ${titleFor(report)}`}
                  onClick={() => onSelect(report.report_id)}
                >
                  {report.report_title}
                </button>
                <small className="secondary-id">{report.report_id}</small>
              </th>
              <td>{sourceNames.get(report.source_id) ?? 'Source name not recorded'}</td>
              <td>
                {report.location_name}; {report.activity_description}
              </td>
              <td>{quantityOf(report)}</td>
              <td>{timeOf(report.observed_at)}</td>
              <td>
                {timeOf(report.received_at)}
                {report.receipt_delay_hours > 0
                  ? ` (+${report.receipt_delay_hours.toFixed(2)} exercise h)`
                  : ''}
              </td>
              <td>
                {report.actor_attribution_status.replaceAll('_', ' ')} ·{' '}
                {report.validation_status.replaceAll('_', ' ')} ·{' '}
                {report.human_verified ? 'human review recorded' : 'not human verified'} ·{' '}
                {report.source_independent && !report.derived_from_report_id
                  ? 'independent source'
                  : 'not independent corroboration'}
              </td>
            </tr>
          ))}
          {!chronological.length && (
            <tr>
              <td colSpan={7}>No reports match the current filters.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ObservationTimeline({
  reports,
  sources,
  selectedId,
  onSelect,
}: {
  reports: Report[];
  sources: Source[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const sorted = [...reports].sort((left, right) =>
    left.observed_at.localeCompare(right.observed_at),
  );
  const left = 190;
  const right = 870;
  const minTime = Math.min(...sorted.map((report) => Date.parse(report.observed_at)));
  const maxTime = Math.max(...sorted.map((report) => Date.parse(report.received_at)));
  const span = Math.max(60_000, maxTime - minTime);
  const xFor = (time: string) => left + ((Date.parse(time) - minTime) / span) * (right - left);
  const sourceNames = new Map(sources.map((source) => [source.source_id, source.display_name]));
  const height = Math.max(170, sorted.length * 48 + 75);
  return (
    <section className="panel situation-chart" aria-labelledby="timeline-title">
      <h3 id="timeline-title">Observation-to-receipt timeline</h3>
      <p className="help">
        Circle = observation time; square = report receipt time. The connector shows reporting
        delay, not activity duration. Times use Cedar Watch exercise time (UTC−04:00).
      </p>
      <svg
        viewBox={`0 0 900 ${height}`}
        role="img"
        aria-label="Timeline showing separate observation and receipt times for each report"
        className="situation-svg"
      >
        <line x1={left} x2={right} y1={36} y2={36} stroke="#64748b" />
        {sorted.map((report, index) => {
          const y = 72 + index * 48;
          const observedX = xFor(report.observed_at);
          const receivedX = xFor(report.received_at);
          return (
            <g
              key={report.report_id}
              role="button"
              tabIndex={0}
              aria-label={`${report.report_title}; observed ${timeOf(report.observed_at)}, received ${timeOf(report.received_at)}`}
              aria-pressed={selectedId === report.report_id}
              onClick={() => onSelect(report.report_id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(report.report_id);
                }
              }}
              className="timeline-row"
            >
              <text x={left - 12} y={y + 4} textAnchor="end" className="situation-axis-label">
                {sourceNames.get(report.source_id) ?? report.report_id}
              </text>
              <line x1={observedX} x2={receivedX} y1={y} y2={y} stroke="#64748b" strokeWidth="2" />
              <circle cx={observedX} cy={y} r="6" fill="#2563eb">
                <title>{`Observed ${timeOf(report.observed_at)}: ${report.report_title}`}</title>
              </circle>
              <rect x={receivedX - 5} y={y - 5} width="10" height="10" fill="#b45309">
                <title>{`Received ${timeOf(report.received_at)}: ${report.report_title}`}</title>
              </rect>
            </g>
          );
        })}
        {sorted.length > 0 && (
          <>
            <text x={left} y={height - 22} className="situation-axis-label">
              {timeOf(sorted[0].observed_at)} observed
            </text>
            <text x={right} y={height - 22} textAnchor="end" className="situation-axis-label">
              {timeOf(sorted.reduce((latest, report) =>
                report.received_at > latest.received_at ? report : latest,
              ).received_at)} received
            </text>
          </>
        )}
      </svg>
      <p className="help">Legend: observation time ● · receipt time ■</p>
    </section>
  );
}

export function FictionalGridPlot({
  reports,
  locations,
  onSelect,
}: {
  reports: Report[];
  locations: Location[];
  onSelect: (id: string) => void;
}) {
  const observedIds = new Set(reports.map((report) => report.location_id));
  return (
    <section className="panel situation-chart" aria-labelledby="grid-title">
      <h3 id="grid-title">Reported locations — fictional exercise grid</h3>
      <p className="help">
        Local grid only; these invented coordinates are not geographic and are not displayed on a
        real-world map.
      </p>
      <svg
        viewBox="0 0 560 360"
        role="img"
        aria-label="Fictional local coordinate plot of locations with reports"
        className="situation-svg grid-plot"
      >
        <rect x="48" y="18" width="480" height="300" fill="#f8fafc" stroke="#94a3b8" />
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line x1={48 + tick * 4.8} x2={48 + tick * 4.8} y1="18" y2="318" stroke="#e2e8f0" />
            <line x1="48" x2="528" y1={318 - tick * 3} y2={318 - tick * 3} stroke="#e2e8f0" />
          </g>
        ))}
        {locations.map((location) => {
          const x = 48 + location.grid_x * 4.8;
          const y = 318 - location.grid_y * 3;
          const reported = observedIds.has(location.location_id);
          const firstReport = reports.find((report) => report.location_id === location.location_id);
          return (
            <g
              key={location.location_id}
              role={firstReport ? 'button' : undefined}
              tabIndex={firstReport ? 0 : undefined}
              aria-label={firstReport ? `${location.name}, inspect related reports` : undefined}
              onClick={() => firstReport && onSelect(firstReport.report_id)}
              onKeyDown={(event) => {
                if (firstReport && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  onSelect(firstReport.report_id);
                }
              }}
              className={firstReport ? 'grid-location-selectable' : undefined}
            >
              <circle
                cx={x}
                cy={y}
                r={reported ? 8 : 5}
                fill={reported ? '#2563eb' : '#94a3b8'}
              >
                <title>
                  {`${location.name}: ${location.description}; ${reported ? 'reports present in this view' : 'no matching reports in this view'}`}
                </title>
              </circle>
              <text x={x + 10} y={y - 9} className="situation-axis-label">
                {location.name}
              </text>
            </g>
          );
        })}
        <text x="288" y="350" textAnchor="middle" className="situation-axis-label">
          Fictional grid X (0–100)
        </text>
        <text x="16" y="168" transform="rotate(-90 16 168)" className="situation-axis-label">
          Fictional grid Y (0–100)
        </text>
      </svg>
      <ul className="location-key">
        {locations.map((location) => (
          <li key={location.location_id}>
            <strong>{location.name}</strong> — {location.description}
            {observedIds.has(location.location_id) ? ' · reports in current view' : ''}
          </li>
        ))}
      </ul>
    </section>
  );
}
