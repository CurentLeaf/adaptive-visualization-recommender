# Visualization techniques, inputs, and scales

All records and values belong to the fictional Cedar Watch training exercise. Charts show source-reported claims and processing metadata; they do not verify the reports or establish unique personnel/equipment totals.

## Situation and comparison views

| Question | Technique and unit | Main encodings | Limitation |
| --- | --- | --- | --- |
| What cargo-truck or personnel counts did sources report? | Grouped range-and-dot plot; one report per row | Reported count → x; source-reported lower/upper bounds → horizontal range; readable report title → y; readable source name → color | Unknown counts have no dot/range. Source estimates are not statistical intervals. Repeated sightings are not summed or deduplicated inventory. |
| Which reports disagree about one episode? | Report comparison table or range-and-dot plot | Event/report title, source, count/unit, precision, observation/receipt times, source independence, and comparison scope | Different time, location, unit, episode, or counting scope is not automatically contradiction. |
| When did observation and receipt occur? | Observation-to-receipt timeline; one report per row | Observation and receipt time → separate markers on x; report title → y; connector → elapsed receipt delay | Delay is not activity duration and does not explain why a report arrived later. |
| Which fictional locations have reports? | Fictional-grid point plot | Fictional `grid_x`/`grid_y` → local grid positions; readable location labels and exercise descriptions | This is not latitude/longitude, geographic mapping, or tactical analysis. |
| How many reports occur over exercise time? | Report-frequency line or table | `observed_at` → time; count of report IDs → y | Report counts are not amount of activity or unique items. In the coverage-change scenario, source coverage also expands. |
| How do evidence-quality measures vary? | Scatterplot or parallel coordinates | Confidence, validation, corroboration, conflict, missingness, age, and anomaly remain separate dimensions | These describe evidence records; they do not replace the primary quantity chart or establish truth. |

Every recommendation names its question, technique, inputs, unit of analysis, rationale, and what it does not establish. Suitability components are additive and separate: task fit, field compatibility, modeling-output fit, uncertainty visibility, provenance inspectability, readability, quantity/unit compatibility, episode grouping, time comparability, interaction burden, and audience complexity. The score is a deterministic research heuristic, not report confidence, validation, salience, or probability of correctness.

## Parallel coordinates

The retained multivariate view uses one line per report and initially shows:

| Dimension | Fixed bounds | Direction |
| --- | --- | --- |
| Source confidence | 0–1 | Higher = greater source-level confidence, not truth |
| Validation score | 0–1 | Higher = higher synthetic validation score |
| Corroboration count | 0–5 | Higher = more similar independent reports, not more items |
| Conflict score | 0–1 | Higher = more recorded disagreement |
| Report age | 0–72 exercise hours | Higher = older at the fixed exercise reference time |
| Missingness score | 0–1 | Higher = more incomplete report fields |
| Optional anomaly score | 0–1 | Higher = more unusual under a descriptive synthetic rule |

Bounds do not change when filters change. Native units and normalized position are labeled. Missing values create gaps and are not replaced by zero. Commander mode displays at most 12 deterministic records and reports omissions; Analyst mode displays all matching records. Axis order can change visual emphasis but does not establish a relationship or cause.

## Field origins and compatibility

- Source claims are the raw narrative/structured fields: `reported_actor_name`, `actor_attribution_status`, `activity_description`, `location_name`, `observed_at`, `received_at`, `item_type`, `reported_count`, `count_unit`, `count_precision`, and optional reported lower/upper bounds.
- `receipt_delay_hours` and `report_age_hours` are derived from the two timestamps and fixed exercise reference time.
- `source_display_name` is a readable join from `source_id`.
- Report-frequency totals count report records; they do not sum quantities.
- `latitude`, `longitude`, `region`, `event_category`, `report_time`, `received_time`, and `reported_value` remain compatibility aliases in the data shape. New views use semantic names and explicitly label exercise-grid coordinates.
- Model-output bounds are synthetic illustrations and separate from source-reported quantity ranges.
- Evaluation-only truth fields are not read by normal reports, summaries, charts, or recommendations.

See [data-dictionary.md](./data-dictionary.md) for missing-data and field definitions, and [scenario-narratives.md](./scenario-narratives.md) for episode grouping and source-independence rules.
