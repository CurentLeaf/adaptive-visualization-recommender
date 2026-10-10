# Adaptive Visualization Recommender

This is a visualization research prototype for interpreting fictional, uncertain, multi-source observations. It uses no real people, military units, facilities, coordinates, or intelligence reporting. It does not verify reports, estimate a total inventory, prioritize targets, or recommend operational action.

## Run locally

Requirements: Node.js 20.19+ and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). No account, database, or backend is needed. Build with `npm run build`, run tests with `npm test`, lint with `npm run lint`, and format with `npm run format`. On Windows PowerShell with script execution disabled, use `npm.cmd` in place of `npm`.

## Use from anywhere

The project is a static web app and can be hosted without a server or database. To publish it on GitHub Pages:

1. In the GitHub repository, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
2. Push to the `main` branch. The deployment workflow builds and publishes the app automatically.
3. Open <https://curentleaf.github.io/adaptive-visualization-recommender/>.

For another static host, run `npm run build` and publish the contents of `dist/` at the host's site root. Local browser evaluation records remain in that browser's `localStorage`; the app does not send them to a server. GitHub Pages access and visibility depend on the repository's plan and organization settings.

## Cedar Watch exercise

The deterministic synthetic generator creates narrative observation reports for five scenario templates:

- Consistent sightings: four independent reports describe similar cargo-truck counts near Cedar Junction.
- Conflicting equipment counts: sources report about six, four, and (from one source) no count for the same East Depot episode.
- Delayed report: North Ridge personnel observations are received four or more exercise hours after observation, and one relayed report is marked as derived rather than independent.
- Translation uncertainty: a Pine Crossing report contains an ambiguous, unverified range for personnel, alongside an unresolved translation and an original-language patrol range.
- Apparent activity increase: report frequency and reporting coverage both rise; increased activity is not established.

Sources have readable names: Observation Team Cedar, Imagery Review Desk, Field Report Liaison, Translation Review Desk, Road Patrol Log, Radio Log Monitor, and Community Contact Network. Fictional locations have explanatory labels and a local 0–100 exercise grid. That grid is not geographic and is never placed on a real-world map.

Observation time and receipt time are separate. Cedar Watch uses a declared fictional UTC−04:00 exercise timezone and a fixed freshness reference time, so reports do not become stale as the real calendar advances. Unknown counts are `null`, never zero. Approximate counts and source-reported ranges remain labeled; a range is not a statistical confidence interval. Repeated sightings may describe the same items. Reports are not added to estimate equipment/personnel inventory.

Events, reports, entities, sources, fictional locations, provenance, and evaluation-only ground-truth fields are separate in the data model. Current evaluation ground truth is unknown; it is not used to generate corroboration or exposed in normal evidence views.

Regenerate the inspectable JSON copy with:

```bash
npm run generate:data
```

The command writes `synthetic-dataset.json`. The application uses seed `271828`; other deterministic variations can be created with `generateSyntheticDataset(seed)`.

## Workflow and architecture

The app follows a typed pipeline: scripted observation episodes → source reports → question and audience mode → modeling and visualization rules → linked chart and report inspection → versioned local evaluation. The main code lives in:

- `src/data/syntheticGenerator.ts`: Cedar Watch templates, readable sources, episode links, and fixed exercise-time reference.
- `src/domain/types.ts` and `src/domain/constants.ts`: data contracts, scenario/task descriptions, and cautions.
- `src/lib/profiler.ts`: field roles, ranges, missingness, and data profiles.
- `src/lib/salience.ts`: configurable attention-priority score; not a measure of truth.
- `src/lib/modelSelection.ts` and `src/lib/analysis.ts`: explicit analysis rules and derived values.
- `src/lib/situationNarrative.ts`: deterministic situation summaries derived from report fields.
- `src/lib/visualizationRecommendations.ts`: question, field, unit, episode, timing, uncertainty, and audience-aware scoring.
- `src/lib/vegaSpecFactory.ts`: quantity, report-frequency, timeline, evidence, and fictional-grid chart specifications.
- `src/components/charts/SituationEvidenceViews.tsx`: readable report comparisons and timelines.
- `src/components/details/EvidencePanel.tsx`: ordered observation, comparison, uncertainty, provenance, and technical details.
- `src/lib/evaluation.ts`: readable scenario questions, local records, migration, and export.

## Situation-first workflow

Choose Commander or Analyst and select a scenario. The situation overview summarizes the source claims, where and when reports were observed, what agrees or differs, and what remains unknown. Commander mode starts compactly, with one primary chart and a visible caveat; **Compare reports** and **Inspect evidence** reveal supporting details. Analyst mode exposes the chronological reports, observation-to-receipt timeline, fictional-grid plot, controls, technical inputs, and parallel-coordinates view.

Recommendations state the question answered, technique, unit, inputs, rationale, and what the display does not establish. The additive rule-based suitability score keeps quantity/unit compatibility, episode grouping, time comparability, uncertainty visibility, provenance, and audience complexity distinct. It is not a report-confidence or truth score.

The quantity dot/range plot displays each source-reported count without aggregating repeated sightings. Unknown values stay unknown. Report-frequency charts count reports, not activity or distinct equipment. Observation and receipt times have separate marks; their connector denotes elapsed reporting delay. The fictional grid chart uses only the exercise's local coordinate system.

The evidence inspector is ordered as: reported observation; supporting or challenging reports; uncertainty; source and processing history; and technical details. Source confidence, validation, attribution, translation, corroboration, missingness, recency, and human review remain separate.

The existing parallel-coordinates plot is retained. It compares fixed-bound evidence dimensions with one selectable path per report, offers axis visibility/order and shared range controls, and shows gaps for missing values rather than substituting zero. Commander mode limits that detailed plot to 12 deterministic records.

## Local evaluation and persisted research data

Evaluation questions and answer choices use readable claims rather than synthetic IDs. Logs record schema version, question ID, audience, chart selection, selected reports, filters, interactions, answer, response time, and confidence. Records remain in browser `localStorage`; nothing is sent to a server. Compatible version-1 logs are migrated in memory and the legacy key remains until the user explicitly clears the evaluation log. Export downloads JSON; clear is an explicit action. Previously exported files are not overwritten.

## Documentation

- [Data dictionary](./docs/data-dictionary.md) — field meaning, units, origin, and missing-value behavior.
- [Scenario narratives](./docs/scenario-narratives.md) — coherent report episodes and source-independence rules.
- [Source representation workshop requirements](./docs/source-representation-workshop-requirements.md) — source outputs, validation categories, acceptance criteria, and workshop prompt.
- [Visualization techniques](./docs/visualization-techniques.md) — mappings, scales, and limitations.
- [Audience and disclosure](./docs/audience-and-disclosure.md) — Commander/Analyst presentation and scoring.
- [Usage story](./docs/usage-story.md) — a demonstration from situation to evidence trail.

## Limitations

All reports and names are scripted and fictional. No unique-object deduplication is modeled, so the interface does not estimate total inventory. Source-reported ranges are not calibrated. The rule-based recommender and salience score are research heuristics. Report frequency does not establish increased activity. The local grid is not geographic. The application is for evidence-interpretation research and must not be treated as an operational decision system.

## Checks

```bash
npm test
npm run lint
npm run build
```

`npm run build` includes the TypeScript project check and Vite production build.
