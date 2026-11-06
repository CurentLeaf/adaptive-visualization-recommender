# Cedar Watch reVISit pilot (draft)

This is an opt-in pilot app in its own package. It does not change the default recommender app,
accept arbitrary imports, or enable production participant collection. The protocol is a draft that
requires investigator and institutional approval before recruitment. All participant-facing
stimuli are fictional synthetic Cedar Watch reports.

The current rehearsal interface is `rehearsal-2026.11.06.1`. New session exports record this
optional UI revision while retaining response schema `1` and accepting older saved sessions. Trial
answers, confidence, difficulty, evidence selections, and active-time metadata are saved as separate
validated per-session/per-trial local drafts until submission; drafts are not included in exports.

## Clean install and local launch

Requirements: Node.js 20.19+ and npm.

```bash
npm ci --prefix study
npm --prefix study run dev
```

Open the localhost URL printed by Vite. Study dependencies are pinned exactly in
`study/package.json` and `study/package-lock.json`. The app imports the real generator, recommender,
charts, report comparison table, timeline, fictional-grid plot, and evidence inspector from
`../src/`; the adapter is not a mock and does not embed the public homepage.

Checks:

```bash
npm --prefix study test
npm --prefix study run typecheck
npm --prefix study run build
npm --prefix study run test:e2e
python3 -m unittest discover -s study/analysis
```

`test:e2e` launches the locally installed Chromium executable and the study Vite server, then runs
the full synthetic participant flow over the Chrome DevTools Protocol without adding browser-test
dependencies. Set `CHROMIUM_BIN` to an executable path if it is not named `chromium`,
`chromium-browser`, or `google-chrome`. The test skips with a diagnostic if Chromium or the Node
global `WebSocket` API is unavailable. It captures temporary desktop/mobile and chart screenshots
under the system temporary directory and removes its browser profile/server afterwards.

The existing application remains separately installable and run with the root instructions in
[`../README.md`](../README.md). No study environment variable is needed for local use. The study
Vite config records the current Git commit at build time, or uses `VITE_SOURCE_COMMIT` if explicitly
provided.

## Rehearse locally

1. Use only the default synthetic data and a test browser profile. Do not recruit participants or
   enter personal or operational information.
2. Read the [draft protocol](../docs/pilot-study-protocol.md), participant consent, and
   [data dictionary](../docs/pilot-study-data-dictionary.md).
3. Check that decline stores no session. Accept the draft consent and complete the separate practice
   exercise; practice responses are not part of the experimental export.
4. Complete all ten trials, including an explicit unknown answer in at least one test run. Confirm
   that confidence/difficulty are required, the two conditions render correctly, and the same
   family evidence is available in both.
5. Test a hidden-tab interruption, trial response persistence, reload/resume, participant exit,
   clearing a session, and both export formats.
6. Validate the downloaded files and run the offline analysis command below. Rehearsal data remain
   in the browser unless explicitly exported or cleared.

The trial header identifies `Trial N of 10` and the condition. The question is first, appears again
above the response controls, and each new trial returns focus/scroll to its heading. Response fields
and report/chart interactions are saved as validated drafts under a key scoped to session and trial;
they are kept separate from submitted responses and exports. A refresh or pause/resume restores the
current draft. Submitting a trial records its response and clears only that trial's draft.

Text-mark recommendations are rendered as the same readable semantic report table used by the
evidence-only condition rather than as dense, overlapping Vega text. Other recommendations use the
actual Vega-Lite spec. Technical mapping/provenance details begin collapsed in study mode. The shared
app's default inspector behavior is unchanged.

Before any pilot use, review the [possible answer leakage note](../docs/pilot-study-protocol.md#investigator-review-possible-answer-leakage):
scenario descriptions and recommendation cautions can disclose interpretations, with some text
visible only in the recommended condition. Rehearsal preserves that text for explicit investigator
review instead of silently changing the protocol.

Consent is an unapproved draft. Declining exits without writing a session. A saved local session is
shown behind a resume/clear gate before another session can start, to reduce accidental sharing on
lab devices.

## reVISit integration and upstream pin

The platform reference is the official reVISit stable release **v2.4.4**, study commit
`fb7b64f6ea729ee3d5a0457224326b40ce119176`, dated 2026-08-20. The official template is
[`revisit-studies/template`](https://github.com/revisit-studies/template); the versioned schema and
supported component contract are from
[`revisit-studies/study` v2.4.4](https://github.com/revisit-studies/study/tree/v2.4.4).
The `study/revisit/StudyConfig.json` and `global.json` use the upstream StudyConfig and GlobalConfig
schemas. The React adapter uses the documented `ReactComponent` `setAnswer({status, answers})`
callback with a configured `reactive` response; it does not use an iframe or an invented messaging
API. It passes the JSON-serialized session under response ID `pilotSession`; `status` remains false
until all ten responses and the end-of-study questionnaire are complete, so reVISit cannot advance
early. The ReVISit BSD 3-Clause license is retained in `LICENSE-reVISit`.

The full reVISit application is a platform template, not a published standalone study package
(`@revisit-studies/study` is not available from npm). For a local host integration, create a
temporary checkout at the path assumed by the adapter, pin it to the verified release commit, and
overlay the checked-in study files:

```bash
git clone https://github.com/revisit-studies/template.git study/revisit-host
git -C study/revisit-host checkout fb7b64f6ea729ee3d5a0457224326b40ce119176
mkdir -p study/revisit-host/public/cedar-watch-pilot/assets
mkdir -p study/revisit-host/src/public/cedar-watch-pilot
cp study/revisit/StudyConfig.json study/revisit-host/public/cedar-watch-pilot/
cp study/revisit/global.json study/revisit-host/public/global.json
cp study/revisit/public/cedar-watch-pilot/assets/logo.svg study/revisit-host/public/cedar-watch-pilot/assets/
cp study/revisit/src/public/cedar-watch-pilot/StudyComponent.tsx study/revisit-host/src/public/cedar-watch-pilot/
```

If the checkout already has `public/global.json`, merge the pilot's `configs` entry and append
`cedar-watch-pilot` to `configsList`; do not discard other studies. The custom component imports
shared repository code by relative path, so keep the host at `study/revisit-host` (or update those
relative paths deliberately). Install the host's dependencies following the upstream template
instructions, then merge these aliases into its existing Vite `resolve.alias` so the framework and
shared component use the same React instance:

```ts
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { studyDependencyAliases } from '../src/viteAliases';

const sourceCommit =
  process.env.VITE_SOURCE_COMMIT ??
  execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: path.resolve(process.cwd(), '../..'),
    encoding: 'utf8',
  }).trim();
```

Add this top-level property to the existing Vite config:

```ts
define: {
  __SOURCE_COMMIT__: JSON.stringify(sourceCommit),
},
```

Merge these aliases into its existing `resolve.alias` block:

```ts
alias: {
  ...existingAliases,
  ...studyDependencyAliases(path.resolve(process.cwd(), '../node_modules')),
}
```

The host build-time `__SOURCE_COMMIT__` definition is required so exported sessions record the
repository revision; `VITE_SOURCE_COMMIT` can supply the exact revision in a reproducible build.

Run the local host with the template's supported development command (`yarn serve` in the upstream
template). The complete upstream host has not been vendored or run as part of this repository task;
the runnable, tested subset is the independent local Vite app plus the schema-versioned config and
documented adapter. The institutional host should validate the study config and acceptance-test
storage and response export before it is considered ready. No cross-origin iframe bridge is used;
if a future implementation introduces one, it must validate exact origin, `event.source`, message
shape/schema, and response IDs before accepting messages.

## Storage, privacy, and deployment

By default, the standalone app stores only the current consented response session in that browser's
`localStorage` under `avr-cedar-watch-pilot-v1`; export and deletion are explicit participant
actions. The data are not uploaded. Browser storage is device-local and is **not** a central
research database. GitHub Pages and other static hosting are also not research databases.

The reVISit platform has its own supported local development storage and export flow, plus optional
institution-configured storage backends. Its participant metadata may include browser/device
information and nullable network metadata outside this app schema. Review and minimize that
collection, access, retention, and deletion with the institution before enabling any hosted
collection. No production collection is enabled, no backend credentials are included, and this work
does not deploy the site.

For an institution-approved reVISit backend only, follow the version-pinned upstream setup and
configure the chosen supported engine in the host's local ignored environment file or deployment
secret manager. The platform documents `VITE_STORAGE_ENGINE` and provider-specific variables (for
example Supabase URL and anon key). Never commit credentials, never put privileged service-role
keys in client-exposed `VITE_*` variables, and verify database/storage policies and retention before
launch. Do not set these variables for ordinary local rehearsals. A production backend is an
explicit investigator-operated opt-in, not this repository's default.

## Data validation and exploratory analysis

The Zod schema in `src/protocol.ts` validates storage and JSON/CSV serialization. Exports include
session/schema/protocol versions, source commit, seed/version, assignment, scenario/variant/
condition, recommended and selected visualizations, evidence selections/interactions, answer or
explicit unknown, confidence, perceived difficulty, active trial time, visibility interruption
count, and usability responses.

Answer keys are kept in `analysis/answer-key.json`, outside the participant app's import graph and
build output. The analysis script and tests are the only code that use them. The source repository
is public/reviewable; a determined participant who inspects repository files can read the keys, and
client assets are inspectable. Do not treat this separation as security.

```bash
python3 study/analysis/analyze.py path/to/pilot-export.json
python3 study/analysis/analyze.py path/to/pilot-export.csv --output exploratory-summary.json
```

The script validates input fields and versions, flags incomplete sessions, summarizes choice
accuracy (excluding explicit unknowns), active time, confidence and difficulty by condition, and
reports within-participant, within-family recommended-minus-baseline differences. It performs no
significance tests or confirmatory inference. Variant equivalence, representativeness, and statistical
power are not established.

## Launch checklist — all items are gates

- [ ] Investigator name/contact supplied and consent/debrief text approved.
- [ ] Institutional human-subjects determination documented.
- [ ] Recruitment plan, eligibility, and sample-size planning reviewed (no power claim).
- [ ] Storage access, metadata collection, export, retention, deletion, and access controls approved.
- [ ] Browser/device and accessibility acceptance tests completed, including reVISit host behavior.
- [ ] Full synthetic rehearsal and analysis reviewed; production collection remains disabled until
      explicit approval.
- [ ] No secrets are committed; the institution's backend setup follows its approved security policy.

See the [draft protocol](../docs/pilot-study-protocol.md) and
[data dictionary](../docs/pilot-study-data-dictionary.md) for study details.

## Interface refresh (November 6, 2026)

The `study` branch refreshes the standalone study interface with a branded header, preparation /
evidence / reflection milestones, recorded-trial progress, direct evidence/response links,
keyboard skip navigation, selected-answer cards, and a horizontally scrollable practice table.
The introduction pairs the existing protocol information with a compact “what to expect” panel.
No external assets, tracking, new backend, or participant collection service were added.
Questions, counterbalancing, chart encodings, scoring, and export schema remain unchanged.
Exports identify this interface with `rehearsal-2026.11.06.1`.

Design references inspected on November 6, 2026:

- [Qualtrics](https://www.qualtrics.com/platform/): strong heading hierarchy and clear primary actions.
- [Tableau](https://www.tableau.com/products/tableau): spacious analytics presentation and contextual explanation.
- [Prolific](https://www.prolific.com/): compact navigation and distinct research journey panels.
- [Loom](https://www.loom.com/): simple onboarding, generous spacing, rounded controls.
- [Observable](https://observablehq.com/): readable evidence-centered content and restrained borders.

These references informed original styling; their branding, images, and source code were not copied.
The milestones are informational rather than links so participants cannot skip consent or trials.
The trial bar counts submitted responses only, not a partially completed draft.
