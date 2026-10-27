# Synthetic import fixtures

Every file here is **synthetic**: IDs, entities, values and text are invented for testing. Nothing refers to real people, organizations or events, and `source_file_path` values are inert text that the app never opens.

| File | Purpose |
| --- | --- |
| `facts-only.json` | Facts without deductions: numeric/non-numeric values, explicit/missing/incompatible units, a currency, missing entity types, an unknown field, a `null` value, an ambiguous numeric-looking string. |
| `deductions-only.json` | Deductions without facts; one has no provenance or confidence (stays unknown). |
| `linked-evidence.json` | Explicit links in both directions, two deductions for one fact, and an unlinked deduction that matches a fact by value only (it must stay unlinked). |
| `link-problems.json` | Dangling references and conflicting explicit links / linked metadata. |
| `temporal-edge-cases.json` | Open and missing validity, overlap, supersession (a correction), `current=true` with a replacement, invalid/ambiguous timestamps, reversed interval, self-supersession, cycle, missing reference. |
| `duplicates/a.json`, `duplicates/b.json` | Identical duplicate (`SYN-DUP-SAME`, different key order) and conflicting duplicate (`SYN-DUP-CONFLICT`). |
| `mixed-folder/` | Singleton record, a `.txt` file containing a JSON array, malformed JSON, prose TXT, and PDF/PNG/EXE placeholders that must be skipped. |

Try them via **Add Data → Import Files / Folder**; see `docs/import-contract.md` for the walkthrough.
