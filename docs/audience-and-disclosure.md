# Audience modes and progressive disclosure

The Adaptive Visualization Recommender is an academic visualization research prototype using fictional synthetic data. Commander and Analyst are **presentation modes**, not permissions or authorization roles. Both modes retain access to the same evidence.

## Audience modes

The Audience selector is at the top of the app. Its selected value is stored locally as `avr-audience-v1`.

| Mode | Initial presentation |
| --- | --- |
| Commander | Compact situation story, one active recommendation and primary chart, and a visible no-inventory caveat. Report comparison, timeline, controls, technical details, export, and evaluation tools are behind explicit disclosures or buttons. |
| Analyst | Situation story plus chronological report comparison, observation-to-receipt timeline, fictional-grid plot, expanded controls, recommendations, evidence/provenance inspector, and parallel coordinates. Dense sections remain collapsible. |

Switching the mode only changes presentation and the recommendation's audience-complexity score. It does not reset the scenario, task, active chart, filters/time range, selected report, salience weights, evaluation records, or computed evidence. A recommendation re-rank does not silently replace the active chart; alternatives require **Use this visualization**.

## Progressive disclosure

1. **Situation overview** — what sources report, where and when, comparable claims, disagreement, and remaining unknowns.
2. **Compare reports** — readable source names, distinct observation/receipt times, claimed quantities, and source independence.
3. **Evidence details** — who/what/where/when/quantity, support/challenges, uncertainty, then source and processing history.
4. **Technical details** — internal IDs, raw field mappings, score components, dataset profile, parallel coordinates, and local evaluation/export.

Each deeper level has an explicit button or disclosure. Commander mode starts compact; Analyst mode exposes Levels 2–3. Hover is supplementary: report identity, field values, cautions, and provenance are also reachable through controls, the inspector, or selectable table.

## Pipeline-stage attribution

The evidence inspector presents an ordered trail:

1. Synthetic source/observation
2. Ingestion
3. Validation and quality checks
4. Transformation or aggregation
5. Analysis/model calculation
6. Visualization mapping

Each stage separates inputs, operation, outputs, timestamp/version, review status, and assumptions/warnings. A value absent from the data is shown as **Not recorded**; it is not inferred. Generated data already has deterministic provenance chains, ingest times, transformation labels, review statuses, and a version. Times or review states are not invented for analysis or visualization stages.

Data provenance records how a synthetic record was generated and processed. Analysis provenance describes deterministic descriptive calculations. Visualization rationale explains the display choice. None is evidence that a report is true.

## Uncertainty terminology

Source confidence, validation score/status, corroboration, conflict, missingness, observation freshness, receipt delay, translation status, actor attribution, human review, and model output are separate indicators. No combined trust score is computed. Unknown or missing values remain unknown; they are not treated as zero or as high/low confidence.

Source-reported approximate/range counts are distinct from synthetic model bounds. Neither represents a calibrated statistical interval. The quantity chart uses source-reported bounds; it does not average or sum competing counts.

The persistent caution is: **“High salience means attention priority, not verified truth.”**

## Suitability scoring

The displayed suitability score is a rule-based heuristic, not report confidence or a validated probability. For each eligible technique, its displayed score is the sum of the shown components:

- Task fit: up to 22 for a technique directly answering the selected question.
- Field compatibility: 18 after required fields pass compatibility checks.
- Modeling-output fit: 10 when a selected output is encoded, otherwise 6.
- Uncertainty visibility: 10 when uncertainty is directly visible, otherwise 4.
- Provenance inspectability: 8 when report/event/source identity is available, otherwise 0.
- Readability: 8, reduced for very dense views.
- Quantity/unit compatibility: 10 when a report-level quantity view has one compatible item/unit, otherwise 0.
- Episode grouping: 7 when linked comparable reports share an episode, otherwise 3.
- Time comparability: 7 for a timing view or comparable observations, otherwise 3.
- Interaction burden: 0, or a separate negative penalty for interaction-heavy controls.
- Audience complexity: 0, or a separate negative penalty for dense Commander-mode views.

The components are additive and their actual values are shown per recommendation. The score is not evidence quality. It does not use the report's confidence, validation, or salience as a truth measure. A model output that is not encoded is named separately rather than silently credited.

## Implemented and deferred

Implemented: locally persisted audience presentation, state-preserving mode changes, progressive disclosures, explicit recommendation selection, linked report selection, shared conventional and parallel-axis filters, fixed parallel-axis bounds, accessible narrative report table, stage attribution, uncertainty cautions, and local evaluation schema migration.

Deferred: empirical validation/calibration of the suitability heuristic; participant studies; statistical calibration of synthetic bounds; backend or multi-user persistence; and a Vega-native parallel-coordinates brushing interaction. Parallel-axis reorder and range controls are implemented in the accessible SVG view and update the shared report set.
