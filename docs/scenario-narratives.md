# Cedar Watch scenario narratives

All locations, actors, sources, reports, and exercise-grid coordinates below are fictional. Times are Cedar Watch exercise time (UTC−04:00) on 2035-04-01. Freshness is computed relative to the fixed exercise reference time, 2035-04-02 12:00 UTC−04:00, rather than the current date.

## Consistent sightings

At 08:20, Observation Team Cedar reports approximately six cargo trucks suspected to be associated with Red Falcon at Cedar Junction (reported range: 5–7 vehicles). At 08:42, the Imagery Review Desk records six trucks in the same episode. Two more sources add overlapping reports: Community Contact Network (08:55, approximately five, machine-translated and not human verified, received at 10:10) and Road Patrol Log (09:05, approximately seven). The four records come from separate independent sources and their ranges overlap. Similar reports can still describe the same vehicles; the dataset does not deduplicate vehicles or establish total inventory.

## Conflicting equipment counts

Observation Team Cedar reports six cargo trucks at East Depot at 09:20. The Imagery Review Desk reports four at 09:45, grouped to the same exercise episode, item type, location, and stated counting boundary. Radio Log Monitor mentions trucks in the storage area at 09:55 without giving a number, and Road Patrol Log reports approximately six at 10:05. The Radio Log Monitor report leaves the count unknown, so it neither supports nor resolves the disagreement. The records still disagree; the data does not establish whether the difference reflects changed observations or another cause. Counts remain separate source claims.

## Delayed report

Field Report Liaison records an approximate report of eight personnel (range: 6–10) near North Ridge at 08:05. The report arrives at 12:05, four exercise hours later. Radio Log Monitor later logs a relay of that report (12:20, received 12:40); it is marked as derived and not independent, so it does not corroborate the original. A separate North Ridge episode from Observation Team Cedar has no reported count and unknown actor attribution. Another separate North Ridge episode from Community Contact Network (observed 10:00, approximately five) arrives at 14:30, 4.5 exercise hours later. The receipt time does not replace the observation time.

## Translation uncertainty

Translation Review Desk records a translated report near Pine Crossing at 10:10. The translated phrase is represented as a source-reported range of 2–4 personnel; its midpoint is not treated as an exact count, and human verification is incomplete. A second source reports the same episode but provides no quantity, and Community Contact Network's machine-translated report (10:30) could not resolve a quantity, so it stays unknown rather than zero. Road Patrol Log (10:50) reports approximately four personnel in the original language with an overlapping range. None of this verifies the translated quantity.

## Apparent activity increase

Two reports from one source occur in the earlier exercise window. Six reports appear in the later window, with reporting coverage expanding from one to five sources (Road Patrol Log and Community Contact Network join the later window). The reports are separate observation episodes. The example is designed to distinguish increased report frequency and coverage from established increased activity. It does not sum vehicle sightings or infer unique vehicles.

## Source and episode rules

- Source names are readable labels; stable source IDs remain for joins.
- Reports in one event are comparable observations of an episode, not necessarily observations of distinct objects.
- A report contributes to the independent similar-report count only if it has a different source, is marked independent, is not derived from another report, and carries a comparable item, location, and count.
- Different episodes, item types, locations, times, and counting scopes are not automatically contradictions.
- Synthetic evaluation ground-truth fields are separate from report claims, not used to generate corroboration, and not displayed in normal report views.
