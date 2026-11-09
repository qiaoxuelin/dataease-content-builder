# Material matching and refresh evidence

Read when connecting a material library, using labels/keywords, diagnosing stale creative details, or configuring scheduled updates.

## Trace the complete path

Inventory the current implementation rather than trusting an old delivery note:

`library records -> connector/API mirror -> matching dimension -> dataset SQL -> chart/cache`

Record the refresh mechanism and last verified evidence at each layer. Direct live queries, scheduled API imports, and SQL literals copied from a snapshot have different freshness. Making a library a datasource does not automatically refresh a separate hardcoded ID/name mapping embedded in dashboard SQL.

Check task logs, imported records, mapping versions, and downstream results together. A `Completed` task does not prove all pages were fetched or every chart uses its output; a stale status label alone does not prove the latest run failed. Distinguish sync time, source fact coverage, mapping time, and chart query/cache time.

## Matching and tags

- Prefer stable creative/record IDs where a trustworthy bridge exists. Otherwise use a documented exact normalized-name or attachment-name rule. Link only unique matches; leave unmatched and ambiguous cases explicit. Do not guess from shared prefixes or language suffixes.
- Preserve the ad creative ID separately from the library record ID. Many delivery creatives may reference one library item; an individual delivery row must not multiply when joined to its metadata.
- Use declared tags, keywords, language, and dimensions as metadata. Do not infer actual attachment language or availability solely from a record's declared list.
- For multi-value tags, use membership filtering or a distinct creative-ID bridge before aggregating facts. A creative with two tags must not double its spend in an overall total. If tag groups overlap, label their totals as non-additive.
- Validate matched/unmatched/ambiguous counts and compare fact totals before and after joining. Verify newly added and renamed records with a subsequent read; keep recoverable prior mappings for failed refreshes.

## Scheduled refresh

Before creating a schedule, check for an existing supported datasource schedule or server job. Reuse authorized application credentials on the intended host, outside source code and logs. Keep the read-only library scope unless the user authorized writes.

Specify interval/timezone, pagination, incremental versus full refresh, deletion handling, retries/backoff, and failure visibility. When materializing a snapshot, do not replace a good snapshot with an empty/partial result from a failed fetch. Update the mapping and consuming dataset together when their versions are coupled.

An always-on server schedule and a desktop task are different delivery guarantees. Do not claim unattended hourly operation until the configured job has run and its output is consumed downstream. Report configuration, manual-run validation, observed scheduled-run validation, and remaining gaps separately.

## Scope and performance

Keep descriptive library metadata separate from delivery and player facts. A library API is not a substitute for the ad/game metric source. Preserve stable IDs, reporting-day rules, and attribution grain across joins.

Daily ad reports cannot yield real hourly CPM/CPI by spreading spend across hours. Show the available daily grain or acquire an hourly source. Where a connector is slow, prefer a maintained dimension with explicit freshness over repeated per-chart API scans; do not silently introduce a stale snapshot.
