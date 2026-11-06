# Study specification: provenance-aware uncertainty

Status: proposed requirements derived from the supplied research prospectus, not a description of an implemented protocol. Source at commit `7f2722e` was inspected separately as described below. Hosted integration and deployment remain unverified. Unresolved protocol decisions require advisor and institutional review before live collection.

## Objective

Compare paired analyst-view and commander-view judgments of the same synthetic case, and document how tested overview representations relate to judgment agreement, preservation of decision-relevant information and rubric correctness. The study evaluates presentation and reviewer behavior, not a new targeting algorithm.

## Functional and technical requirements

- **FR-01 Case library**: Maintain versioned synthetic, unclassified cases with reports, timestamps, source relationships, transformations, automated recommendations, claim-level uncertainty and evidence references. Include clean cases with legitimate uncertainty and defective cases covering collection/provenance, currency/state, translation/grounding and analytic verdict.
- **FR-02 Rubric**: Maintain a versioned, advisor-reviewed rubric separate from participant-visible case data. For each case define acceptable accept/reject/defer judgments, relevant defects, their pipeline stages, decision-relevant fields and the applicable currency and decision rules. Do not treat participant agreement or source claims as ground truth.
- **FR-03 Shared case**: For a paired review, serve the same version of underlying reports, relationships, timestamps, transformations, recommendations and evidence references to both views. Each view must permit access to the same supporting evidence, even when its initial presentation differs.
- **FR-04 Analyst view**: Present detailed claim-level evidence, uncertainty and provenance for the four signal categories, with evidence references directly accessible.
- **FR-05 Commander variations**: Present a concise recommendation and uncertainty overview. For each version, record whether each selected field is explicit, summarized or available only via drill-down. A field omitted from the overview must remain accessible through drill-down. Document summary rules and verify them against the shared case.
- **FR-06 Field mapping**: Maintain a versioned mapping from each claim-level field to its analyst-view presentation and to its commander-view representation and access path for each variation. Record whether a field is truly absent, summarized, explicit or accessible via drill-down. Flag any discrepancy with the shared-evidence requirement.
- **FR-07 Paired reviews**: Assign different reviewers to the analyst and commander reviews of a case. Capture each reviewer's accept, reject or defer judgment and the evidence or fields supporting it. Do not reveal the analyst response to the commander reviewer. Define pairing, assignment, order and independence before testing.
- **FR-08 Detection and localization**: Collect the protocol-defined defect identification and pipeline-stage localization responses separately from the judgment and rationale, including an explicit no-defect or unsure response if approved.
- **FR-09 Data capture**: Associate each response with pseudonymous reviewer and pair identifiers, case and case version, view and variation, mapping and rubric versions, study version, timestamps and protocol-defined interactions. Capture review time with a specified start, stop and interruption rule. Record rationale in a form that can be mapped to defined fields without changing the participant's original response.
- **FR-10 Information visibility**: Record evidence and drill-down interactions sufficient to distinguish a field omitted from the overview from one opened by the participant. Do not infer that an unopened field was unnoticed or that an opened field was understood. Use rationale or other approved evidence to assess whether it was identified or used.
- **FR-11 Host and persistence**: Define and test the reVISit entry, session, task progression and completion contract and the designated database's data schema, identifiers and ownership. Persist approved records with acknowledgment, recoverable errors and retry handling that avoids duplicate logical submissions. Actual integration remains unverified.
- **FR-12 Consent and withdrawal**: Before live tasks, provide the approved study information and consent process. A person who does not consent must not proceed to research tasks or submit research responses. Provide the approved withdrawal process and explain deletion limits.
- **FR-13 Isolation and access**: Label and separate technical pilot data from authorized participant data. Only authorized research staff may retrieve data. Record completion and withdrawal status according to the approved protocol.
- **FR-14 Analysis outputs**: Produce versioned, reproducible descriptive outputs for judgment agreement, information preservation and rubric correctness, with defect detection, stage localization and review time as supporting outcomes. Report denominators, missingness, excluded records, cases and variations used.

## Measures and pilot

- **Judgment agreement**: Number of eligible pairs with identical accept/reject/defer responses divided by the number of eligible paired reviews, reported overall and for each tested variation when feasible.
- **Information preservation**: For each eligible pair, divide the count of decision-relevant provenance fields identified in both rationales by the count identified by the analyst-view reviewer. Freeze the field coding and aggregation method before analysis. Predefine how to handle a zero-field analyst rationale rather than silently treating it as full preservation.
- **Correctness**: Compare each response separately with the case's versioned rubric. Report shared incorrect judgments separately from shared correct judgments. Define treatment of multiple acceptable responses and ambiguous cases before scoring.
- The prospectus proposes at least eight cases and 16 paired case reviews, with each selected variation represented in at least two paired reviews. A paired case review means one analyst-view and one commander-view review of the same case. This is a proposed minimum, not a finalized sample size or evidence of completed collection.
- Record and report which field representation, case and rubric version apply to each pair. Do not infer a causal or universal field requirement from descriptive pilot results alone.

## Inspected pilot and deployment boundary

- The separate [study README at source commit 7f2722e](https://github.com/CurentLeaf/adaptive-visualization-recommender/blob/7f2722e786fa3d6d73e88492161c14c627d9d51a/study/README.md) describes a draft within-participant pilot comparing baseline evidence-only and recommended-visualization conditions within trial families. It is not the proposed independent paired commander/analyst design, and its trial counts, responses and analysis must not be substituted for the requirements or measures above.
- At the earlier inspected revision, the standalone pilot uses browser localStorage and explicit local export, not a central database. That revision includes a reVISit adapter and configuration, but the complete host was not run as part of the work described there. Hosted integration, database persistence and participant-collection approval remain unverified. FR-11 remains a proposed requirement, not an acceptance claim.
- The current local [preview notes](../../../visualization-recommender-study-preview/PREVIEW.md) and [preview workflow](../../../visualization-recommender-study-preview/.github/workflows/pages.yml) both pin `4154d203393bd05f2482e2aabe4cc859b904e9a3`. The actual deployed hash remains unverified. Do not assume the earlier inspected `7f2722e` is the current preview build.

## Non-functional requirements

- **Research governance**: Obtain the required institutional determination or approval before recruitment or participant testing. If authorization is unavailable, report methods or feasibility without claims of demonstrated participant performance.
- **Privacy and security**: Specify approved data fields, pseudonymization, access controls, encryption, retention, deletion, incident response and database responsibilities before live collection. Avoid unnecessary identifiers and do not expose credentials to participants.
- **Reliability**: Test database unavailability, retries, duplicate submissions and interrupted sessions. Define acceptable data-loss and availability targets and session recovery behavior before launch.
- **Accessibility**: Set an accessibility standard, supported browsers and assistive technologies before testing. Essential information and controls must be keyboard accessible and not rely solely on color or hover.
- **Reproducibility**: Retain versioned case data, overview mappings, rubric, assignment rules, event definitions, coding rules and analysis scripts. Record changes between pilot and live deployment.
- **Integrity**: Keep original participant responses, case evidence and rubric distinct. Attribute source claims and avoid presenting synthetic confidence or agreement as proof of truth.

## Acceptance checks

1. Reviewers can trace each case and commander variation to its shared evidence, field mapping and reviewed rubric. A field omitted from the overview remains inspectable in both views.
2. A paired synthetic test assigns two distinct reviewers the same case version, conceals the analyst response from the commander reviewer and records both judgments and rationales.
3. Test records support calculation of the defined measures, distinguish shared incorrect judgments, and explicitly handle missing responses and a zero-field analyst rationale according to the frozen plan.
4. A drill-down test records the access event without treating it as proof of attention or comprehension.
5. A failed submission is visible and retry produces one logical record. Pilot records remain distinguishable from approved live records.
6. Recruitment and live testing are blocked until required institutional and deployment approvals are documented.

## Constraints, risks and open questions

- The root README describes the broader app, not necessarily the separate pilot or the proposed study. The actual deployed revision remains unverified despite matching local preview pins. Hosted reVISit connectivity and database behavior have not been verified.
- Which exact field variations and summary rules will be tested, and how will multiple changes be controlled or reported?
- How are reviewers paired, assigned and ordered? May one reviewer review multiple cases or both views on different cases? How is repeated exposure handled?
- How are rationale fields elicited and coded, who adjudicates disagreements, and how are zero denominators, missingness and exclusions handled?
- Which case decisions and defects are acceptable, who reviews the rubric, and what is the frozen review-time definition?
- Which reVISit and database deployments are intended, what is already implemented, and who owns identifiers, access, retention, retries and operational support?
- What are the participant population, final sample size, institutional status, consent language, withdrawal rules and launch criteria?
- LOE 3a and LOE 2 responsibilities and handoff dates are proposals until their leads confirm them. Reviewer variability and synthetic-case realism limit generalization.
