# Add Data import contract

Add Data is an additive, browser-local workflow beside the Cedar Watch demo. It lets you load **temporal facts** and **extraction deductions** from local JSON, check them, and explore them through the same typed recommend → rank → chart → evidence path. The field list below is **illustrative upstream vocabulary, not a confirmed complete schema**; unknown fields are preserved, and missing metadata stays unknown.

## Accepted structures (detected by structure, never by file name)

| Structure | Example |
| --- | --- |
| Singleton record | `{ "fact_id": "F1", "entity_id": "E1", "predicate": "p", "object_value": 1 }` |
| Array of records (facts and deductions may be mixed) | `[ {fact…}, {deduction…} ]` |
| Versioned envelope | `{ "schema_version": "avr-import/1", "synthetic": true, "facts": [...], "deductions": [...] }` |

The exact supported schema version is **`avr-import/1`**. An envelope with any other `schema_version` is rejected with an issue; envelope fields other than `facts`/`deductions` (e.g. `synthetic`) are kept as file metadata. A record is a **fact** if it has `fact_id` (and no `deduction_id`), a **deduction** if it has `deduction_id`. `.json` and `.txt` files are accepted; **a TXT file must already contain supported JSON** – prose is never converted into records. PDFs, images, executables and other files are skipped unread and reported as unsupported.

### Fact fields
`fact_id`, `entity_id`, `predicate`, `object_value` (required; may be `null`), `as_of`, `current`, `valid_from`, `valid_to`, `supersedes`, `superseded_by`.

### Deduction fields
`deduction_id`, `source_file_path`, `chunk_id`, `as_of`, `subject_entity`, `subject_entity_type`, `predicate`, `object_value`, `object_type`, `extraction_method`, `confidence`, `provenance` (`extraction_path`, `model_used`, `raw_text`), `metadata` (`file_hash`, `chunk_index`, `total_chunks`, `start_offset`, `end_offset`). `source_file_path` is inert provenance text; it is never fetched, opened or read.

### Optional local evidence/typing extensions
- `supporting_deduction_ids` (on facts) and `fact_id` (on deductions): the **only** way evidence links are created.
- `entity_type`, `unit`, `currency` (on facts): the only sources of an entity type or unit.

Original IDs, exact values, timestamp strings (with offsets), unknown fields, file paths and JSON locations are kept in immutable raw records, separate from normalized values.

## Validation, duplicates and collisions
- Malformed records or files never hide valid ones; each issue carries the relative file path and JSON location (e.g. `$.facts[2]`).
- Same ID with identical content (key order ignored) is de-duplicated and reported; every source occurrence is kept.
- Same ID with different content is a **collision**: all variants are excluded and reported. No variant is chosen by file order or append order, so results are independent of input ordering, including on append.

## Evidence links
Only explicit IDs link. Dangling references, links that disagree with each other, and linked metadata conflicts (entity, predicate, value) are flagged; conflicted facts are excluded from numeric analytics. With no link a fact stays usable and shows **Supporting extraction not linked**; deductions are independently searchable. Nothing is borrowed from unlinked (or linked) deductions. Extraction confidence is shown as extraction confidence, never as reliability, truth or corroboration. Known gap: unit/type information is not borrowed from linked deductions either.

## Temporal configuration (dataset-scoped, included in exports)
Defaults (all unconfirmed): `as_of` meaning *unspecified*; upstream `current` flag meaning *unspecified*; applicability intervals *not confirmed*; endpoint convention *unspecified* (`inclusive_start_exclusive_end`, `inclusive_both`, `exclusive_start_inclusive_end`, `exclusive_both`); `valid_to: null` *unconfirmed* (`open_ended` or `unknown`); missing endpoints *unresolved* (or `treat_as_open`); optional reference time.

- Timestamps need an explicit offset (`Z` or `±hh:mm`). Date-only and offset-less values are flagged timezone-ambiguous and are not used for ordering, charts or snapshots. Import time is never substituted.
- The **Upstream current flag** filter is literal and independent of validity.
- The supplied-validity timeline is labeled *upstream validity metadata* and shows open/missing endpoints without inventing dates.
- **Historical snapshot** stays disabled until intervals are confirmed, endpoint convention, null meaning and missing-endpoint policy are set and a reference time with an offset is given. Unresolved facts are excluded with counts; the fact table keeps them.
- Flags: invalid/ambiguous timestamps, reversed intervals, `current=true` plus `superseded_by` (warning), self supersession, cycles, missing references, one-sided/contradictory replacement links. Overlaps are informational. Newest is not assumed true; supersession may be a correction rather than a real-world change.

## Grouping, numeric and unit rules
Facets: entity type, predicate, topic, value type, unit/currency, entity ID, upstream temporal status/warnings. **Unknown entity type** and **Unknown unit** are explicit labels. Topics come from a configurable predicate→topic map (e.g. `has_price` → `Pricing`); the original predicate stays visible; unmapped predicates are *Unmapped*. `object_value` is never altered. Numeric conversion is strict (JSON numbers, plain decimal strings); `null`, empty, `1,234`, `1e3`, leading zeros, currency-prefixed strings, booleans and ID-like predicates are rejected. Inferred types are proposals; analytics need the predicate type to be confirmed in Interpretation settings. Units come only from a supplied `unit`/`currency` or an explicit user override; unknown units are never treated as compatible, and only one unit group is plotted at a time.

## Views and explained exclusions
Fact table (always), supplied-validity timeline, numeric observations (points only, no interpolation), gated historical snapshot, supersession history, provenance/evidence with independent deduction search. Every excluded view lists why (no confirmed numeric type, missing/invalid time, unconfigured validity, unknown/incompatible units, no spatial fields …). Maps are never offered. Commander shows at most three views and one active chart; Analyst shows raw/normalized values, settings, diagnostics and exclusions. Uncertainty is visible in both.

## Limits, progress, cancellation, browser support
Defaults (editable under Import limits): 200 files, 5 MiB per file, 50 MiB total, 100,000 records. Items over a limit are reported and skipped deterministically (sorted by path). Progress is shown and **Cancel import** discards the run; cancelled or superseded reads never activate or complete late. Folder selection uses `webkitdirectory` where supported (relative paths kept); otherwise use multi-file selection.

## Privacy
Processing is in memory in the browser: no backend, upload, fetching, raw-record `localStorage`, or automatic persistence. Imported text/values/paths are not written to the evaluation, feedback or interaction logs. Strings render as text, and chart specs use fixed fields with no expressions. **Export normalized JSON** can contain source text and provenance (raw_text, paths) plus temporal and grouping settings; treat it as sensitive. **Clear imported data** removes everything from memory (with confirmation).

## Fixture walkthrough (`fixtures/import/`, all synthetic)
1. Add Data → Import Files / Folder → select `mixed-folder/`: see 7 discovered, unsupported files skipped, malformed JSON reported with path and location, valid records kept.
2. Select `duplicates/a.json` + `b.json`: identical duplicate merged, conflict quarantined.
3. Load `linked-evidence.json`; open fact `SYN-F-L1` (two deductions) and `SYN-F-L3` (*not linked*).
4. Load `temporal-edge-cases.json`; review the flags, then configure Interpretation settings to enable the snapshot.
5. Load `facts-only.json`, confirm `synthetic_temperature` as numeric in settings, and view numeric observations by unit.

## Acceptance checklist
- [ ] Preview shows counts, issues with path/location; nothing active until **Add valid records**.
- [ ] Append and replace work; collisions are never silently resolved.
- [ ] Snapshot disabled until temporal settings are explicit.
- [ ] Chart click opens the exact fact; linked deductions match explicit IDs only.
- [ ] Switching to Cedar Watch or clearing import leaves no imported state.
- [ ] No imported text in `localStorage` or network requests.
