import type { Report, Source } from '../domain/types';

const localTime = (value: string) => value.slice(11, 16);
const quantityRange = (report: Report): [number, number] | undefined => {
  if (report.reported_count === null) return undefined;
  return [
    report.reported_count_lower ?? report.reported_count,
    report.reported_count_upper ?? report.reported_count,
  ];
};

export function countIndependentSimilarReports(report: Report, reports: Report[]): number {
  if (!report.source_independent || report.derived_from_report_id) return 0;
  const independentSources = new Set<string>();
  const range = quantityRange(report);
  if (!range) return 0;
  for (const candidate of reports) {
    const candidateRange = quantityRange(candidate);
    if (
      candidate.report_id === report.report_id ||
      candidate.event_id !== report.event_id ||
      candidate.location_id !== report.location_id ||
      candidate.item_type !== report.item_type ||
      candidate.count_unit !== report.count_unit ||
      !candidate.source_independent ||
      candidate.derived_from_report_id ||
      candidate.source_id === report.source_id ||
      !candidateRange ||
      range[0] > candidateRange[1] ||
      candidateRange[0] > range[1]
    ) {
      continue;
    }
    independentSources.add(candidate.source_id);
  }
  return independentSources.size;
}

const reportedQuantity = (report: Report) => {
  if (report.count_precision === 'unknown' || report.reported_count === null) return 'unknown count';
  if (report.count_precision === 'approximate') return `approximately ${report.reported_count}`;
  if (report.count_precision === 'range')
    return `${report.reported_count_lower}–${report.reported_count_upper}`;
  return `${report.reported_count}`;
};

export function buildSituationSummary(
  reports: Report[],
  sources: Source[],
  compact = false,
): string {
  if (!reports.length) {
    return 'No reports match the current scenario and filters. The situation is unknown from this view.';
  }

  const sorted = [...reports].sort((left, right) =>
    left.observed_at.localeCompare(right.observed_at),
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const locations = [...new Set(sorted.map((report) => report.location_name))];
  const locationsText = locations.length === 1 ? locations[0] : locations.join(', ');
  const hoursText =
    first.observed_at.slice(0, 10) === last.observed_at.slice(0, 10)
      ? `${localTime(first.observed_at)}–${localTime(last.observed_at)}`
      : `${first.observed_at.slice(0, 10)} ${localTime(first.observed_at)} through ${last.observed_at.slice(0, 10)} ${localTime(last.observed_at)}`;
  const episodeGroups = sorted.reduce((groups, report) => {
    groups.set(report.event_id, [...(groups.get(report.event_id) ?? []), report]);
    return groups;
  }, new Map<string, Report[]>());
  const similarGroup = [...episodeGroups.values()].find((group) =>
    group.some((report) => countIndependentSimilarReports(report, group) > 0),
  );
  const similarIndependentReports = similarGroup?.filter(
    (report) => countIndependentSimilarReports(report, similarGroup) > 0,
  );
  const disputedEpisode = [...episodeGroups.values()].find((group) => {
    const comparable = group.filter(
      (report) =>
        report.source_independent && !report.derived_from_report_id && quantityRange(report),
    );
    return comparable.some((report) =>
      comparable.some((other) => {
        const left = quantityRange(report)!;
        const right = quantityRange(other)!;
        return (
          other.source_id !== report.source_id &&
          other.count_unit === report.count_unit &&
          other.item_type === report.item_type &&
          (left[0] > right[1] || right[0] > left[1])
        );
      }),
    );
  });
  const hasDerived = sorted.some((report) => report.derived_from_report_id);
  const delayed = sorted.find((report) => report.receipt_delay_hours >= 2);
  const translated = sorted.find(
    (report) => report.translation_status === 'machine' && !report.human_verified,
  );
  const unknown = sorted.some(
    (report) => report.count_precision === 'unknown' || report.reported_count === null,
  );
  const sourcesById = new Map(sources.map((source) => [source.source_id, source.display_name]));
  const actorDescriptions = [
    ...new Set(
      sorted
        .filter((report) => report.actor_attribution_status !== 'unknown')
        .map((report) =>
          `${report.actor_attribution_status === 'identified_by_source' ? 'identified' : 'suspected'} by source as ${report.reported_actor_name}`,
        ),
    ),
  ];
  const activityDescriptions = [...new Set(sorted.map((report) => report.activity_description))];
  const shownActivities = activityDescriptions.slice(0, 2);
  const hiddenActivities = activityDescriptions.length - shownActivities.length;
  const clauses = [
    `${sorted.length} source report${sorted.length === 1 ? '' : 's'} place reported observations near ${locationsText} between ${hoursText}. Reported activity: ${shownActivities.join('; ')}${hiddenActivities > 0 ? `; and ${hiddenActivities} other description${hiddenActivities === 1 ? '' : 's'}` : ''}.`,
  ];
  clauses[0] += actorDescriptions.length
    ? ` Source attribution: ${actorDescriptions.join('; ')}.`
    : ' No actor attribution is recorded.';
  if (similarIndependentReports?.length) {
    const quantities = similarIndependentReports
      .map(
        (report) =>
          `${sourcesById.get(report.source_id) ?? 'Unnamed source'}: ${reportedQuantity(report)} ${report.count_unit}`,
      )
      .join('; ');
    clauses.push(`Independent reports give similar counts (${quantities}).`);
  }
  if (disputedEpisode) {
    const quantities = disputedEpisode
      .filter((report) => report.reported_count !== null)
      .map(
        (report) =>
          `${sourcesById.get(report.source_id) ?? 'Unnamed source'}: ${reportedQuantity(report)} ${report.count_unit}`,
      )
      .join('; ');
    clauses.push(`Reports about one episode give different counts (${quantities}); the reason is not established.`);
  }
  if (hasDerived) {
    clauses.push('One report relays another, so it is not counted as independent corroboration.');
  }
  if (delayed) {
    clauses.push(
      `A report observed at ${localTime(delayed.observed_at)} was received ${delayed.receipt_delay_hours.toFixed(1)} exercise hours later.`,
    );
  }
  if (translated) {
    clauses.push('A translated quantity remains unverified by a human reviewer.');
  }
  if (sorted[0].scenario_id === 'anomaly') {
    const earlier = sorted.filter((report) => Number(report.observed_at.slice(11, 13)) < 9);
    const later = sorted.filter((report) => Number(report.observed_at.slice(11, 13)) >= 9);
    const earlySources = new Set(earlier.map((report) => report.source_id)).size;
    const laterSources = new Set(later.map((report) => report.source_id)).size;
    if (earlier.length && later.length && laterSources > earlySources) {
      clauses.push(
        `Report frequency and reporting coverage both increased (${earlier.length} earlier reports from ${earlySources} source, ${later.length} later reports from ${laterSources} sources); increased activity is not established.`,
      );
    }
  }
  if (unknown) clauses.push('At least one report has no count; missing is not zero.');
  if (sorted.some((report) => report.actor_attribution_status === 'unknown'))
    clauses[0] += ' At least one report leaves actor attribution unknown.';
  clauses.push(
    'Reports may describe the same items. Counts are not a verified total inventory.',
  );
  if (!compact) return clauses.join(' ');
  const lead = clauses[0];
  const keyFinding = clauses.find((clause) =>
    /similar counts|different counts|received .*exercise hours|translated quantity|report frequency and reporting coverage/.test(
      clause,
    ),
  );
  const unknowns = clauses[clauses.length - 1];
  return [lead, keyFinding, unknowns].filter((clause, index, values) => clause && values.indexOf(clause) === index).join(' ');
}
