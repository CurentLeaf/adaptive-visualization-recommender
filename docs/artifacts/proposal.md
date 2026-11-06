# Study proposal: provenance-aware uncertainty

Status: draft based on London Smith's supplied LOE 3b research prospectus and project Markdown documentation. The prospectus describes a proposed study, not verified implementation or authorization.

## Problem statement

When detailed claim-level evidence is re-encoded into a concise downstream view, uncertainty and provenance can become less visible or harder to find. Reviewers may consequently reach different judgments or rely on different evidence even when both views provide access to the same underlying case. Researchers need to distinguish information missing from an overview from information accessible by drill-down but overlooked, and distinguish agreement from a correct judgment.

## Research question and intended outcome

In a simulated target-validation task, which claim-level uncertainty and provenance fields must remain explicit in a commander-oriented view for a downstream reviewer to reach the same accept, reject or defer judgment as an analyst using the detailed analyst view?

The intended contribution is evidence about the tested field representations, cases and interface versions, not a new targeting algorithm or proof that a field is universally necessary. Both judgments are compared against an independently predefined case rubric. Agreement alone does not establish correctness.

## Scope

- Compare analyst-oriented and commander-oriented representations of the same synthetic, unclassified case. Role labels describe interfaces, not participants' professional qualifications.
- Pair two independent reviews of each case. The downstream reviewer does not see the analyst review. Vary selected commander overview fields between explicit, summarized and drill-down representations while maintaining underlying evidence access.
- Study collection and source provenance, currency and state, translation and grounding, and analytic verdict. Include clean cases with legitimate uncertainty as well as defective cases.
- Measure paired judgment agreement and preservation of analyst-identified decision-relevant fields. Use rubric correctness, defect detection, stage localization and review time as additional measures.
- Deliver a reviewed case library and rubric, field-level mapping across views, signal contract, study views and logging, and reproducible descriptive analysis, subject to approval and feasibility.
- Plan reVISit hosting and database-backed collection as requested, but verify their actual integration separately.

Out of scope: operational targeting, new collection or translation systems, new operational targeting models, validation of operational confidence scores, and claims about real commander or analyst populations.

## Evidence and status

- The prospectus supplies the research question, design and proposed minimum pilot of eight synthetic cases and 16 paired case reviews, with each selected variation represented in at least two paired reviews. Participant numbers and assignment remain subject to advisor confirmation.
- The source [README](../../README.md) describes the broader visualization recommender and its browser-local evaluation. The separate [study README at source commit 7f2722e](https://github.com/CurentLeaf/adaptive-visualization-recommender/blob/7f2722e786fa3d6d73e88492161c14c627d9d51a/study/README.md) describes a different draft pilot: the same participant encounters baseline evidence-only and recommended-visualization conditions across trial families. Its within-participant comparisons are not the prospectus's independent paired commander/analyst reviews. Existing audience modes do not establish the proposed study protocol.
- At that source revision the standalone pilot keeps session data in browser localStorage and exports locally, not to a central database. A reVISit adapter and configuration exist, but the study README says the complete host was not run as part of that work. Hosted integration, database configuration and persistence remain unverified, as does approval for participant collection. An adapter is not evidence of an operational hosted deployment.
- The current local [preview notes](../../../visualization-recommender-study-preview/PREVIEW.md) and [preview workflow](../../../visualization-recommender-study-preview/.github/workflows/pages.yml) both pin `4154d203393bd05f2482e2aabe4cc859b904e9a3`. The deployed hash remains unverified. The earlier inspected revision `7f2722e` is not assumed to describe the current preview build.
- The existing [data dictionary](../data-dictionary.md) says its synthetic evaluation ground-truth array is empty. The study needs a separate, advisor-reviewed case rubric; do not assume the prototype's data provides one.

## Constraints and risks

- Obtain required institutional determination or approval before recruitment or participant testing. If unavailable, report methods or feasibility only, without human-performance claims.
- Reviewer differences, case difficulty and multiple simultaneous presentation changes can confound field-level attribution. Results are descriptive and limited to the tested design.
- A shared wrong answer is not success. Case ambiguity, weak rubrics and unrecorded rationale can undermine both correctness and information-preservation measures.
- Synthetic cases and interface role labels do not establish operational validity or professional population performance.
- Hosting, integration, data governance and recovery depend on unconfirmed reVISit and database contracts.

## Open decisions

Advisors must confirm the case library, rubric, tested field variations and summary rules, pairing and assignment, participant numbers, consent, and analysis conventions. LOE 3a and LOE 2 handoffs and ownership remain proposed until confirmed. The prospectus lists November 4, 2026 as the planned handoff date but does not establish that it occurred.
