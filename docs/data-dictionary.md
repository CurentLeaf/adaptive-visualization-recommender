# Data dictionary

## Scope and time reference

This dataset contains only scripted, fictional Cedar Watch training observations. Cedar Watch exercise time is UTC−04:00. `exerciseAsOfTime` is fixed to 2035-04-02 12:00 UTC−04:00; freshness does not drift as the real calendar advances. `grid_x` and `grid_y` use a fictional local 0–100 grid and are never geographic coordinates.

## Entities and relationships

| Record | Meaning |
| --- | --- |
| Event | A synthetic observation episode used to group comparable reports. It is not a verified real-world event. |
| Report | One source's claim about an episode, including its observation/receipt times and source-stated quantity. |
| Entity | A reported actor or item type. The displayed name Red Falcon is fictional and source attribution is explicitly qualified per report. |
| Source | A fictional reporting origin with a readable display name and stable join ID. |
| Provenance | Recorded synthetic processing steps for a report; records processing, not truth. |
| Synthetic ground truth | Reserved evaluation-only fields, separated from reports. No verified truth outcomes are authored for this exercise, so the array is empty; normal report views do not read or expose it. |

## Report fields

| Field | Meaning, unit, and origin |
| --- | --- |
| `report_id`, `event_id`, `entity_id`, `source_id`, `scenario_id` | Stable synthetic identifiers used for joins and exports. User-facing labels prefer names/titles. |
| `report_title` | Deterministically formatted human-readable title derived from the reported quantity, item, and location. |
| `reported_actor_name` | Actor name as present in the fictional report. It is not established fact. |
| `actor_attribution_status` | `identified_by_source`, `suspected_by_source`, or `unknown`; source attribution must not be rendered as fact. |
| `observation_type`, `activity_description` | Scripted account of what was reportedly observed or done. Claims remain attributed to their source. |
| `location_id`, `location_name` | Fictional location join and display label. Descriptions are narrative context only. |
| `observed_at` | Source-reported observation time, ISO timestamp with UTC−04:00 offset. |
| `received_at` | Time the exercise record was received, distinct from `observed_at`. |
| `receipt_delay_hours` | Derived elapsed hours from observation to receipt. |
| `item_type`, `reported_count`, `count_unit` | Source-reported item category, nonnegative integer quantity, or `null` when unknown; units keep personnel and equipment separate. A sighting is not total inventory. |
| `count_precision` | `exact_as_reported`, `approximate`, `range`, or `unknown`. Approximate values and ranges are source estimates, not confidence intervals. Unknown counts are null, never zero. |
| `reported_count_lower`, `reported_count_upper` | Optional source-reported range endpoints; null when unrecorded. They do not imply statistical confidence. |
| `source_confidence` | Synthetic 0–1 source-level confidence indicator; not report truth. |
| `validation_score`, `validation_status` | Separate synthetic 0–1 quality score and readable review state. Validation does not verify the claim. |
| `corroboration_count` | Number of linked, independent, non-derived reports with similar reported quantities for the same item, location, and episode. It is not a count of items. |
| `conflict_score` | Synthetic 0–1 disagreement indicator; does not identify a correct claim. |
| `missingness_score` | Synthetic 0–1 indicator of incomplete fields. Missing quantities remain null. |
| `translation_status`, `original_language`, `human_verified` | Translation and review metadata. Human verification is not truth verification. |
| `source_independent`, `derived_from_report_id`, `related_report_ids` | Explicit synthetic dependence/episode links; derived reports cannot count as independent corroboration. |
| `comparison_notes` | Scripted explanation of episode, timing, and comparison scope; no missing-data explanation is invented. |
| `grid_x`, `grid_y` | Fictional local grid values (0–100), never latitude/longitude or mapped to real geography. |
| `report_age_hours` | Derived elapsed time from observation to fixed exercise reference time; used for freshness. |
| `reason_codes`, `anomaly_score`, `importance_score` | Synthetic rule labels and indicators, not validated truth probabilities. |

## Compatibility aliases

The earlier prototype's `report_time`, `received_time`, `region`, `latitude`, `longitude`, `event_category`, and `reported_value` fields remain as compatibility aliases. Their new meanings are respectively `observed_at`, `received_at`, fictional `location_name`, `grid_y`, `grid_x`, `observation_type`, and `reported_count`. New UI and documentation use the semantic fields. Coordinates are explicitly relabeled as fictional grid values and are not rendered as a real-world map.

## Derived and model fields

`day`, report frequency, grouped conflict, z-scores, rolling values, salience, and parallel-coordinate normalized positions are derived for visualization/research. Model-output bounds are illustrative and separate from source-reported count ranges. Missing values are not replaced with zero. Aggregates count reports and never sum repeated observations into inventory.

## Evaluation and persistence

Evaluation questions use readable answer choices. Records include question/scenario ID, audience, selected chart, filters, selected reports, interactions, response, time, and confidence. The current log schema is version 2. Compatible version-1 local records are read and migrated in memory; the old key is retained until the user explicitly clears the evaluation log. Exported research logs are not silently overwritten.
