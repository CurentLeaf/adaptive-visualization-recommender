# Explanation, evidence-quality, and what-if views

All data are fictional. These views explain the existing rule-based recommender; they add no model, backend, or external data transmission.

## What was added

1. **Factor comparison** (Recommendations panel → “Why this ranking?”). Aligned bars for the top three charts, using the engine’s actual `scoreBreakdown`. Positive contributions are green, negative penalties are red, and every value is printed with a sign (`+8`, `−10`, `0`). “Why #1 ranks above #2” lists only the factors that differ, largest difference first; shared factors are summarized separately. The score is labeled _rule-based suitability_, never a probability, truth, or report confidence.
2. **Decision path.** Task & audience → fields & reports → compatibility checks → eligible/excluded charts → scoring & penalties → ranking. It is built from `recommend().candidates`, a typed list of per-chart eligibility results with reason kinds: curated candidate-set restriction, missing required fields, too few quantitative fields, task-specific field requirement, and mixed units. Ranking preferences (audience-complexity and interaction-burden penalties, tie order) are described separately from exclusions. Mission context only appears in the explanation text and does not change scores; the path says so.
3. **Evidence-quality matrix.** One row per report in the current filtered view, with separate columns for count availability/precision, translation status, human review, source independence, observation age (exercise as-of time minus `observed_at`), and reporting delay. Unknown, not-recorded, and not-applicable values are written out and never replaced with zero. Selecting a row selects the same report in the charts, opens the existing evidence inspector, and the matrix shows how many provenance stages are recorded (no stages are invented). Commander: collapsed by default and without the provenance column; Analyst: open.
4. **What-if comparison.** Runs the real `recommend()` for a hypothetical task/audience and/or report subset (recorded `source_independent`, recorded `human_verified`, or excluding the selected report). It is separate state: the active task, audience, filters, selected chart, and evidence are not modified. The result shows current vs hypothetical rankings, rank moves, per-chart factor differences, and says explicitly when rankings are unchanged. It labels the change as **context sensitivity**, **evidence-subset sensitivity**, or both; when both differ, isolated context-only and subset-only runs separate the effects. Subsets use recorded metadata only; independence is never inferred.

## Data requirements

Uses existing `Report`, `Provenance`, and `Dataset.exerciseAsOfTime` fields: `reported_count`, `count_precision`, `reported_count_lower/upper`, `translation_status`, `human_verified`, `source_independent`, `observed_at`, `received_at`/`receipt_delay_hours`, and `provenance_chain`. No new data fields.

## Logging and storage

Interactions use the existing in-session `InteractionEvent` list and are written into the existing evaluation record (schema version 2, unchanged): `evidence_matrix_select`, `what_if_change`, `what_if_reset`. Nothing new is persisted; storage remains browser `localStorage`.

## Limitations and deferred work

- Scores are heuristic rule outputs; a larger score is a better rule-based fit, not higher likelihood.
- Report frequency is not activity; source ranges are estimates, not calibrated intervals; repeated sightings are not inventory; salience is attention priority.
- No combined trust gauge, probabilities, quantile dotplots, or operational recommendations.
- The what-if subset operates within the current filters. Subset options are limited to recorded metadata; arbitrary multi-report selection and saving of scenarios are deferred.
- The decision path names the first-order cause of each exclusion; it does not simulate removing a field.

## Mentor demo walkthrough (about 3 minutes)

1. Open the app as Commander. In Recommendations, expand “Why this ranking?” and read the factor table: note the red audience-complexity penalty and the list of differing factors.
2. Open the decision path steps; point out curated-set exclusions vs a mixed-unit exclusion (switch to the “Conflicting equipment counts” scenario).
3. Expand the evidence-quality matrix. Find a report with an unknown count (shown as unknown, not zero). Click its row: the same report is highlighted in the chart and its provenance trail opens.
4. Expand the what-if panel. Switch the hypothetical audience to Analyst and see “context sensitivity”; then tick “only reports recorded as source-independent” to see “evidence-subset sensitivity”. Confirm the active task and audience are unchanged and use “Reset hypothetical”.
5. Switch to Analyst to show the fully expanded views.
