# Cedar Watch pilot protocol — draft

**Status:** Draft for investigator review only. This protocol is not approved for recruitment,
participant collection, or confirmatory research. Investigator, consent, institutional human-subjects,
storage, and browser-acceptance gates remain open.

The rehearsal UI is versioned as `rehearsal-2026.11.03.1`. It records this optional UI revision in
new session exports without changing response schema version 1 or invalidating earlier saved
`draft-1` sessions. Rehearsal changes include question-first trial layout, readable detail-table
recommendations, and local validated per-trial drafts; unsubmitted drafts are not part of response
exports.

## Aim and design

This exploratory pilot compares two evidence displays within each participant. It is intended to
assess usability and the feasibility of recording evidence-interpretation responses; it does not
test operational effectiveness, establish truth, or support a statistical-power claim.

Every participant is assigned ten trials: one evidence-only baseline and one task-aware recommended
view for each of five Cedar Watch families. The same deterministic synthetic reports for a family
are shown in both conditions. Two task variants (A and B) are assigned across the paired conditions.
Variant pairs are intended to be matched but have **not** been validated for equivalent difficulty,
reading burden, or learning effects.

### Conditions

Both conditions provide the same accessible source-report comparison table, observation-to-receipt
timeline, fictional local-grid plot, and report-level evidence inspector. Both show the same
report-level source, provenance, uncertainty, missingness, translation, and timing facts.

- **Evidence-only baseline:** the fixed table, timeline, fictional grid, and evidence inspector;
  no recommender output or recommended chart.
- **Task-aware recommended view:** those same evidence components plus the actual recommender's
  highest-ranked task-aware visualization, its rationale/caution, and a selector for its available
  alternatives. A selected report is inspectable in the same evidence panel.

Thus the manipulated difference is the added recommended chart/rationale and choice among the
recommender's alternatives—not different reports, answer-key information, or ground truth.
The fixed baseline visualization is a descriptive evidence view, not a second recommendation.
The recommender is a rule-based fit heuristic; its score is not confidence or truth.

## Families, task variants, and supported answer scope

Each A/B question concerns report interpretation supported by scripted evidence only. No question
asks for an underlying event's true value. Such ground truth remains unknown.

| Family | Variant A | Variant B | Relevant interpretation boundary |
|---|---|---|---|
| Consistent sightings (`corroboration`) | Do similar reports establish a distinct-vehicle total? | Which named sources independently reported similar counts? | Duplicate/derived reports are not independent; similar counts do not establish unique inventory. |
| Conflicting equipment counts (`conflict`) | How should the Radio Log Monitor's missing count be read? | What do the differing East Depot reports establish? | Missing is not zero; reports do not establish a total inventory. |
| Delayed report (`uncertain`) | How long after observation did the liaison report arrive? | What does receipt time say about observation time? | Observation and receipt are separate; late receipt does not establish continuing activity. |
| Translation uncertainty (`quality`) | Was the translated range human verified? | How should an ambiguous translated range be represented? | An unresolved source range is not a precise count or calibrated interval. |
| Apparent activity increase (`anomaly`) | Does increased report volume establish increased activity? | What change is supported by the scripted reports? | Report frequency/coverage changes do not establish underlying activity. |

The explicit “I cannot determine an answer from the available reports” response is retained as an
unknown (`answerKind: unknown`, `answerId: null`), not silently converted to a blank or zero. The
analysis excludes such responses from choice-accuracy denominators and reports their count.

## Counterbalancing and reproducibility

After explicit consent, the client generates a random anonymous participant ID using the browser's
cryptographic random-number API. A stable FNV-1a hash maps that ID to one of four assignment groups.
Group and family index deterministically set family order, which condition comes first within each
family pair, and whether A or B is assigned to baseline. The complete ten-item assignment is saved
in the session record and reused on reload.

This gives four reproducible assignment patterns, not a central randomization service. Offline
hashing cannot ensure group counts are balanced across recruited participants. The protocol does
not claim guaranteed allocation balance. The stimulus seed/version and source commit are recorded
so exported records can be tied to the exact code and data generator.

## Participant flow

1. Study introduction and draft consent information.
2. Explicit checkbox agreement, or **Decline and exit**. Declining writes no local session record;
   the participant sees an exit message and can close the page.
3. Separate fictional practice vignette with immediate practice-only feedback. It is not one of the
   five experimental scenarios and is not included in analysis.
4. Ten assigned trials. Participants inspect the evidence, submit a required choice or explicit
   unknown response, and provide required confidence and perceived-difficulty ratings.
5. Required evidence-clarity, condition-preference, and easier-condition responses.
6. Debrief with the condition comparison, limitations, and local validated JSON/CSV export.

The application does not reveal correctness during experimental trials. Advancement from a trial
requires an answer/unknown selection, confidence, and difficulty. A session can be intentionally
paused and exported while incomplete; the analysis flags it. A participant may clear local session
data in the app.

## Consent text status

The participant-facing consent screen is deliberately labeled a **draft**. It describes the purpose,
activities, voluntary participation, exit, local browser storage, the absence of requested names or
email, and the lack of promised benefit. It has no investigator contact because none was supplied.
It is not a substitute for institution-approved consent. The researcher must replace/review this
text and supply an approved investigator contact before any rehearsal with recruited participants.

### Investigator review: possible answer leakage

The current participant-visible scenario descriptions and recommender rationale/cautions contain
interpretations that may cue an answer, and that cue can differ by condition. Examples include the
translation scenario description saying human verification is incomplete, the apparent-activity
description saying increased activity is not established, and chart cautions saying reports do not
establish a total inventory. These statements have been retained rather than silently rewritten in
this rehearsal revision. Before any pilot, investigators must review the exact text rendered for all
five families, both conditions, and every selectable chart; decide whether it is part of the intended
evidence or an answer hint; and document any approved wording or protocol adjustment.

## Stimulus and answer-key controls

The study calls `generateSyntheticDataset(271828)` from the repository's real deterministic Cedar
Watch generator. It filters to the selected family; all evidence reports remain fictional.
`synthetic_ground_truth` is deliberately empty in the study view. The study does not import arbitrary
participant data, use operational recommendations, expose the legacy application's evaluation
answer module, or infer event ground truth.

Interpretation keys live in `study/analysis/answer-key.json` and are read only by the offline
analysis script/tests. They are not imported into participant-facing source or the Vite public
bundle, and no correctness field is included in participant responses. The software is publicly
reviewable, however: a person who inspects the source repository can read that analysis file, and
any client-delivered assets can be inspected. This is not a security boundary; investigators must
consider that limitation when selecting a study host and recruitment process.

## Limitations

- Variant A/B difficulty matching, condition equivalence, measurement validity, and learning/carryover
  effects have not been established.
- There is no sample-size or statistical-power claim. Summaries are exploratory and descriptive;
  the analysis script performs no confirmatory inference.
- No event ground truth is available. The only keyed answers are narrow interpretations of scripted
  report fields.
- The standalone app stores records in the current browser. It is not a central research database.
- The reVISit platform may add its own participant metadata (including browser/device metadata and
  possibly nullable network metadata) outside this app schema. Institutional review must determine
  whether that collection is needed and acceptable before enabling any hosted collection.
- No real-world entity, place, unit, location, operation, or intelligence report is represented.

## Launch gates requiring investigator action

- [ ] Name an investigator, provide a working contact, and replace/review the draft consent and
  debrief through the institution-approved process.
- [ ] Obtain and document the institution's human-subjects determination before recruitment.
- [ ] Decide recruitment eligibility and sample-size planning; document that this is a pilot and
  does not support a power claim.
- [ ] Approve storage, access controls, retention/deletion, export handling, and any reVISit-host
  metadata collection. Keep local-only storage as the default until this gate is approved.
- [ ] Validate browser/device compatibility and accessibility with investigator-led acceptance
  testing, including interruption, resume, export, and decline/exit.
- [ ] Rehearse the full protocol using synthetic test sessions, verify the host's local/export
  behavior, and ensure the production backend remains disabled.
- [ ] Review condition-specific scenario descriptions, recommendation rationales, and cautions for
  answer leakage across every family/chart before approving participant-facing stimuli.
- [ ] Only after all prior gates, explicitly approve any production participant collection and
  configure an institution-approved backend without committing credentials.
