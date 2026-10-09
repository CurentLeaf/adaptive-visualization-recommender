# Source representation workshop requirements

## Quick, simple summary

Think of a **source** as the person or team sending a note, and a **report** as the note itself.

The app should help people quickly see:

- **Who sent the note?**
- **What did they say they saw?**
- **Where and when did they see it, and when did the note arrive?**
- **How sure are we that the note was recorded and handled correctly?**
- **Does another separate source say something similar or different?**

These checks help us understand the reports, but they do **not automatically prove that a report is true**. If a number is missing, show “unknown,” not zero. If two reports say “six,” do not add them and claim there were twelve things; both reports might describe the same things.

For the workshop, decide what information each source and report should show, what checks people or the app should do, and how to explain what is still unknown. The detailed requirements and a sample workshop prompt are below.

## Purpose

This document defines what a source representation should show, what information it needs, and how the information should be validated before users rely on it. It is written for a requirements workshop: participants can use the questions and acceptance criteria below to confirm scope and identify missing data.

The current application is a fictional research prototype. Its Cedar Watch sources, reports, scores, locations, and provenance are scripted training data. The prototype does not ingest real source documents, independently verify claims, or establish the truth of a report. Requirements about a production source representation are distinguished below from behavior already demonstrated by the prototype.

## Workshop prompt

> Specify a source representation for a multi-source observation product. For each source and report, define the identity and provenance users need to see; the claim, time, location, quantity, and uncertainty that must be attributed to that source; the validation checks and statuses that are required; and the outputs needed to compare sources without implying that repeated reports are unique objects or verified truth. Separate automated checks from human review, state what each validation can and cannot establish, and define acceptance criteria for missing, conflicting, delayed, translated, derived, and corroborating reports. Use fictional examples only.

## Answer: requirements

### 1. What the representation must output

The representation has two related levels: a **source record** describing the reporting origin and a **report record** describing one claim made by that origin. The UI should let a user move from a claim to its source and processing history, and back, without conflating their quality measures.

#### Source record

At minimum, show or make inspectable:

| Output | Requirement |
| --- | --- |
| Readable source name | Show a plain-language name, not just an internal ID. Preserve a stable source ID for joins and exports. |
| Source category | Describe the reporting origin or method, not its truthfulness (for example, observation team or imagery review). |
| Collection method | State how the report was produced when known. Label scripted, inferred, or unavailable information explicitly. |
| Source-level quality | If a source reliability prior or data-quality score exists, expose its definition, scope, scale, and origin. Do not present it as the truth probability of any report. |
| Source-level language/review | Show translation and review capabilities or limitations only when recorded. Do not infer a human reviewer from a source name. |
| Independence and lineage | Identify shared origins, copied/derived reports, and relationships to other reports when known. Independence is a relationship to the compared report, not a permanent guarantee that a source is unbiased. |
| Provenance access | Link to report-specific receipt, transformation, version, and review history. Distinguish source identity from later processing steps. |

The current dataset has seven fictional source records:

| Fictional source | Current source category | Current collection method | Example use |
| --- | --- | --- | --- |
| Observation Team Cedar | `observation team` | `scripted fictional observation` | Approximate vehicle or personnel observation |
| Imagery Review Desk | `imagery review` | `scripted fictional imagery review` | Separate report for comparison with another report |
| Field Report Liaison | `field report` | `scripted fictional field report` | Delayed report and an unknown-count report |
| Translation Review Desk | `translation review` | `scripted fictional translation review` | Translated, unverified quantity range |
| Road Patrol Log | `patrol log` | `scripted fictional patrol log entry` | Additional independent observation, including an overlapping range |
| Radio Log Monitor | `communications log review` | `scripted fictional radio log review` | Mention without a count, and a relayed (derived) report |
| Community Contact Network | `community contact report` | `scripted fictional contact report` | Delayed, machine-translated report with unresolved quantity |

These are scenario roles, not real collection disciplines, sensor sources, or independently substantiated organizations. The prototype's `reliability_prior` and `data_quality_score` are synthetic values and must not be presented in a workshop as validated source assessments.

#### Report/claim record

Show one source's observation as one attributed claim. The minimum display is:

1. **Claim:** report title and a readable, source-attributed narrative; actor attribution (`identified by source`, `suspected by source`, or `unknown`).
2. **What was reported:** item/activity, source-reported quantity, unit, precision (`exact as reported`, `approximate`, `range`, or `unknown`) and range endpoints where supplied.
3. **Where:** named exercise location and location description; show coordinates only as an explicitly fictional local grid when relevant.
4. **When:** observation time and receipt time as separate values, timezone, and calculated receipt delay. State the fixed reference time used for freshness.
5. **Source:** readable source name, source category/method, and link to its record.
6. **Evidence and comparison:** related reports, their sources and times, whether they are independent or derived, what agrees or conflicts, and the scope used for comparison.
7. **Validation and uncertainty:** separate statuses and scores with their definitions and the checks that produced them.
8. **Processing history:** ingest time, transformation steps, record version, and review status.
9. **Limits:** a concise statement of what this representation does not establish (for example, truth, unique-object identity, total inventory, or cause of disagreement).

Unknown values must be displayed as unknown or not recorded, never converted to zero. A source-reported range is not a statistical confidence interval. Repeated sightings remain separate claims; do not add them into an inventory or imply that each report describes a distinct object.

### 2. Example output from the current fictional exercise

**Source record — Observation Team Cedar**

- Source ID: `SRC-OTC`
- Category: observation team
- Collection method: scripted fictional observation
- Source-level confidence/data-quality fields: synthetic exercise indicators; not independently validated

**Report record — Cedar Junction observation**

- Source-attributed claim: Observation Team Cedar reported approximately six cargo trucks at Cedar Junction and suspected an association with Red Falcon.
- Source-reported quantity: approximately 6 vehicles; reported range 5–7.
- Observed: 2035-04-01 08:20, Cedar Watch exercise time (UTC−04:00).
- Received: 2035-04-01 08:34, Cedar Watch exercise time (UTC−04:00); 14 minutes after observation.
- Attribution: suspected by the source, not established fact.
- Validation: partial in the scripted exercise; the score/status is not independent verification of the claim.
- Comparison: Imagery Review Desk separately reports 6 trucks for the same episode, and Road Patrol Log and Community Contact Network report overlapping approximate counts (7 and 5). They are marked as independent sources, but all reports may describe the same vehicles.
- What can be concluded: two separate source reports have similar reported counts for the same exercise episode.
- What cannot be concluded: six unique trucks, twelve unique trucks, a verified actor identity, or a verified total inventory.

This is the kind of output the current source representation can produce from its structured fields. It is not a trace to source documents: the prototype has no underlying real document, image, citation, or external evidence artifact to open.

### 3. Validation requirements

Validation must be a set of named checks, not a single number called “validated.” Each check must record its result, who or what performed it, when it was performed, what evidence or rule was used, and what it does not establish.

| Validation category | Minimum checks | Output/status | Does not establish |
| --- | --- | --- | --- |
| Record/schema integrity | Required fields, allowed enums, valid identifiers, data types, and referential integrity among report/source/event/location IDs | Pass, fail, or not run; field-level errors | Accuracy of the reported claim |
| Time integrity | Parseable timestamps, explicit timezone, observation not silently replaced with receipt time, nonnegative delay where expected, documented freshness reference | Pass, warning, fail, or unknown, with offending times | That a source observed the event at the stated time |
| Quantity/unit integrity | Nonnegative count if present; unit present; range endpoints ordered and compatible with the stated precision; null count treated as unknown | Pass, warning, fail, or unknown; preserve original value and normalized value separately | Correctness of the quantity or unique-object count |
| Attribution and entity integrity | Preserve the source's actor wording and attribution status; distinguish observed item/activity from inferred actor identity | Explicit attribution state; flag unqualified rendering | Actor identity as fact |
| Source provenance | Stable source identity; source category and method; origin/document reference if available; receipt/ingest trail; version and transformations; missing provenance flagged | Provenance complete, partial, missing, or disputed | Truth or credibility by itself |
| Source independence | Check same source, shared upstream origin, copied/derived relationship, duplicate content, and episode linkage before counting corroboration | Independent, dependent/derived, unknown, or not comparable, with rationale | That two independent sources are accurate or unbiased |
| Claim comparability | Same episode or explicitly related events; compatible item, unit, location, time window, and counting scope; do not compare unlike claims as contradictions | Comparable, partially comparable, not comparable, or unknown | Cause of a difference or which report is correct |
| Translation | Record original language/text where permitted, translation method/version, reviewer identity/time, unresolved terms, and whether quantity/actor wording changed | Machine, reviewed, pending, unresolved, or not applicable | Accuracy merely because a human review is recorded |
| Human review | Record reviewer, timestamp, scope of review, evidence consulted, and review result; separate transcription review from factual verification | Not recorded, pending, partial, reviewed; optionally claim-specific review outcome | Truth unless review explicitly checks appropriate evidence and warrants that conclusion |
| Content/evidence verification | Where the use case requires it, compare the claim against identified, accessible evidence with a documented method and reviewer; preserve disagreement and contrary evidence | Verified for a precisely scoped assertion, contradicted, inconclusive, or not assessed | Broader claims outside the checked scope |
| Analytics and visualization | Check aggregation unit, missing-value handling, range semantics, score inputs, selection links, and chart labels against the displayed claims | Test result and limitations | Validity of source claims or causal interpretation |

#### Required separation of indicators

- **Source confidence/reliability** concerns an explicitly defined source-level assessment. It is not the truth probability of a particular report.
- **Data/record validation** checks structure, completeness, and processing. A well-formed record can still be false.
- **Human review** says a person performed a stated review. It does not say which claims they checked or that they verified truth.
- **Claim verification** is a scoped comparison with evidence. It must identify the assertion and evidence checked.
- **Corroboration** reports similarity across independent, comparable source claims. It is not proof and is not an object count.
- **Conflict** records disagreement across comparable claims. It must not select a winner without additional evidence.
- **Confidence intervals/model bounds** must remain separate from source-reported ranges; label synthetic or uncalibrated values prominently.

### 4. Required statuses and missing-data behavior

For every validation dimension, use a controlled status vocabulary and retain the reason/details:

- `not_recorded`: no result or provenance is available.
- `pending`: an identified check or review has not finished.
- `partial`: only part of the record or claim has been checked; say which part.
- `reviewed`: a review occurred; include reviewer, time, scope, and outcome. Do not treat this alone as “verified.”
- `passed` / `failed` / `inconclusive` / `not_applicable`: use for individual executable or evidence checks when those results are actually known.
- `disputed`: competing source claims or reviewer assessments remain unresolved.

Do not map missing to `passed`, `failed`, false, zero, or “no issue.” Keep unknown quantities `null`; distinguish no report from a report that explicitly states zero. Record source- and report-level uncertainty separately.

### 5. Functional requirements

**FR-1 — Source attribution:** Every displayed claim names its source or clearly says that the source is not recorded. A source claim must not be rewritten as an unqualified fact.

**FR-2 — Two-level drill-down:** Users can open a source summary from a report and inspect report-specific provenance, validation, and comparisons from that source summary.

**FR-3 — Time separation:** Observation, receipt, and ingest/processing times are separately labeled and preserve timezone. Freshness calculations state their reference timestamp.

**FR-4 — Quantity preservation:** Exact-as-reported, approximate, ranges, and unknown quantities render differently; retain units and original endpoints. Do not sum repeated observations.

**FR-5 — Explicit comparison basis:** Any agreement/conflict label shows which reports were compared and the episode, item, unit, location, time, and counting-scope criteria used.

**FR-6 — Independence caution:** Corroboration counts exclude same-source, dependent, derived, or non-comparable claims; unknown independence must not be silently treated as independent.

**FR-7 — Validation explanation:** Each validation status opens or displays check name, scope, outcome, assessor/method, time, evidence reference, and limitation when available.

**FR-8 — Missingness:** Missing values remain visible as unknown/not recorded and are not imputed to zero in tables, charts, summaries, or exports.

**FR-9 — Provenance and versioning:** Transformations and human review are append-only or versioned so users can distinguish the original report from normalized or translated representations.

**FR-10 — Export parity:** Exported records contain the same source IDs, report claims, time semantics, validation states, uncertainty, and provenance links needed to interpret the on-screen output.

**FR-11 — Fictional/real-data boundary:** The prototype labels its data and scores as fictional. Production ingestion must not inherit synthetic confidence, validation, ground-truth, or scenario labels as if they were real assessments.

### 6. Non-functional and governance requirements

- **Traceability:** Every computed field (delay, freshness, corroboration count, score) has a documented formula, inputs, version, and reference time.
- **Auditability:** Record who/what changed a claim, translation, validation, or relationship, and when. Preserve prior versions.
- **Explainability:** Use plain-language labels and make technical details available without making users infer what a score means.
- **Accessibility:** Tables have meaningful headers; status and uncertainty are conveyed by text as well as color; keyboard users can inspect and compare reports.
- **Privacy and access control:** For real source materials, define classification, retention, authorization, redaction, and export rules before connecting document-level provenance. The current prototype has no such real source material.
- **No unsupported inference:** The interface does not infer causality, unique identities, total inventory, or increased activity from report counts alone.
- **Localization/time handling:** Store timestamps with timezone/offset and display the exercise or operational timezone explicitly; do not compare naive local times.

### 7. Acceptance criteria for workshop sign-off

The feature is acceptable when all of the following can be demonstrated:

1. A user can identify the source and its category/method for each report without interpreting an internal ID.
2. A user can distinguish the report's observation time from its receipt and processing times.
3. An exact count, approximate count, source-reported range, unknown count, and explicit zero (if present) have distinct representations.
4. A source-attributed or suspected actor remains visibly attributed; it is not rendered as established fact.
5. Two independent reports with similar counts are shown as separate claims, with a warning that they may refer to the same objects.
6. Two comparable but conflicting reports remain side by side; the display neither averages them nor chooses a winner without evidence.
7. A translated range shows translation and human-review status and does not silently become an exact midpoint.
8. A delayed report shows the delay without changing its observation time.
9. A derived or copied report cannot increase the independent corroboration count.
10. “Reviewed,” “validated,” “corroborated,” and “verified” have distinct definitions and are not used interchangeably.
11. All score/status outputs are traceable to their definitions and source data; synthetic indicators are clearly labeled as synthetic.
12. No screen or export presents report frequency as activity or repeated sightings as total inventory.

### 8. Workshop decisions to record

Use the session to decide:

- Which source identity fields are mandatory for the intended real-data context?
- What evidence artifacts may be linked, and under what access/retention rules?
- Who owns source-level assessment versus record validation versus claim verification?
- Which review outcomes and controlled vocabularies will be authoritative?
- How should the system represent shared upstream sources and uncertain independence?
- What makes two reports comparable (episode, time window, location precision, item definition, and counting boundary)?
- Which claims require human review, and what constitutes sufficient evidence for verification?
- Which status details must be visible immediately versus available on drill-down?
- Which exports, audit logs, and user actions must be retained?
- What should happen when a check fails, conflicts with another check, or cannot be performed?

## Current prototype versus production requirements

The prototype already provides structured fictional source/report records, readable source names, report comparison, observation/receipt timing, separate uncertainty and validation indicators, synthetic provenance steps, and explicit limits on corroboration and quantities. Its statuses and scores are authored exercise values. It does **not** provide actual source documents, citations to external evidence, real source authentication, a validated reliability model, a full review audit system, secure handling of real source material, or factual claim verification. These are production requirements to scope and govern before real ingestion.

## Related project documentation

- [Data dictionary](./data-dictionary.md)
- [Scenario narratives](./scenario-narratives.md)
- [Audience and disclosure](./audience-and-disclosure.md)
- [Usage story](./usage-story.md)
