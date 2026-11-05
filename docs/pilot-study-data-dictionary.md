# Cedar Watch pilot data dictionary

The standalone pilot writes one schema-version-1 JSON session to browser-local
`localStorage` (`avr-cedar-watch-pilot-v1`) after consent. Exports are validated against the
TypeScript Zod schema in `study/src/protocol.ts`. JSON has a top-level `schemaVersion` and
`sessions` array. CSV is a flat trial table with session-level values repeated per row; an
incomplete session with no trial responses has one metadata-only row. Neither format contains
answer-key or correctness fields.

## Session fields

| Field | Meaning |
|---|---|
| `schemaVersion` | Response schema integer, currently `1`. |
| `protocolVersion` | Draft protocol label (`draft-1`); change when the approved response protocol changes. |
| `uiVersion` | Optional rehearsal interface revision (`rehearsal-2026.11.03.1`); absent on older saved sessions. |
| `participantId` | Cryptographically generated anonymous ID; no account or external identity is used. |
| `sessionId` | Cryptographically generated anonymous local-session ID. |
| `consentAccepted` | Always `true` for a saved record; declining creates no record. |
| `sourceCommit` | Git commit at build time (`VITE_SOURCE_COMMIT` override or `git rev-parse HEAD`). |
| `stimulusSeed` | Fixed synthetic generator seed (`271828`). |
| `stimulusVersion` | Generator/stimulus label (`cedar-watch-generator-1`). |
| `counterbalanceGroup` | Deterministic assignment group in range 0–3. |
| `assignedOrder` | Ten assigned trial IDs in presentation order. |
| `status` | `in_progress` or `complete`. |
| `responses` | Zero to ten validated trial response objects. |
| `usability` | Required end-of-study clarity and condition preference responses on completed sessions; null while incomplete. |

No names, email addresses, free-text notes, imported data, absolute trial timestamps, browser
fingerprints, or device metadata are added by the standalone app.

Unsubmitted trial drafts are stored in separate, validated localStorage keys scoped to the current
anonymous session and assigned trial. They support reload and pause/resume but are never included in
session responses or exports. Clearing the local session also clears study trial drafts. Older
schema-version-1 sessions remain readable because the UI revision is optional and response fields are
unchanged.

## Trial fields

| Field | Meaning |
|---|---|
| `trialId` | Deterministic scenario/variant/condition identifier. |
| `trialIndex` | Zero-based participant trial order, from 0 to 9. |
| `scenarioFamily` | `corroboration`, `conflict`, `uncertain`, `quality`, or `anomaly`. |
| `taskVariant` | Matched-intent variant `A` or `B`; equivalence is unvalidated. |
| `condition` | `baseline` or `recommended`. |
| `recommendedVisualization` | Top recommender ID in the recommended condition; `null` in baseline. |
| `selectedVisualization` | Selected recommender chart ID or fixed `report-comparison-table` baseline identifier. |
| `selectedReports` | Distinct report IDs selected during the trial. |
| `evidenceInteractions` | Ordered `report_select` / `visualization_select` events, value, and elapsed offset. |
| `answerKind` | `choice` or explicit `unknown`. |
| `answerId` | Choice option ID, or `null` when the participant explicitly chose unknown. |
| `confidence` | Required self-rating 1–5. |
| `perceivedDifficulty` | Required self-rating 1–5. |
| `activeTrialTimeMs` | Visible active time in milliseconds; hidden-tab intervals are excluded. |
| `visibilityInterruptions` | Count of transitions from visible to hidden during the trial. |

The response schema intentionally has no `correct`, `expectedAnswer`, or ground-truth value. The
offline analysis joins `answerId` to `study/analysis/answer-key.json` only for the report-
interpretation questions that are supported by the scripted evidence. Explicit unknowns are
preserved and excluded from choice-accuracy denominators.

## Storage and export boundary

The local app stores the current participant session in that browser only. JSON/CSV downloads are
explicit participant actions and are checked before serialization. Browser storage and static
hosting (including GitHub Pages) are not a central research database.

When run inside reVISit, the adapter submits the completed session through the documented
`ReactComponent` `setAnswer` callback under the configured `pilotSession` reactive response. The
upstream platform has its own participant metadata and storage behavior; it is not represented by
this app's data dictionary and must be reviewed separately before host configuration or production
collection.
