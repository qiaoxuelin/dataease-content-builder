---
name: dataease-content-builder
description: Build, update, diagnose, and validate DataEase SQL datasets, dashboards, charts, and filter interactions through the DataEase OpenAPI. Use for DataEase content work, not standalone SQL analysis unrelated to a dashboard.
---

# DataEase Content Builder

Create DataEase content in the exact dataset and visualization locations requested by the user, while keeping the workflow repeatable and verifiable.

## Before acting

Resolve these inputs from the request and local project files:

- DataEase base URL and ASK credentials. Never print credentials or signed headers.
- Permission for plaintext HTTP when the base URL uses `http://`; reuse authorization already given for this instance and scope in the current task.
- Target dataset folder and visualization folder. Resolve each to an ID; they are separate trees even when their names match.
- Datasource ID, SQL files, dataset names, dashboard name, filters, and publication intent.

Read-only discovery is allowed when relevant. Mutations require user intent covering their scope. Do not ask again for an already authorized step, or extend that authorization to unrelated resources or deployment changes.

## Workflow

1. Read [references/workflow.md](references/workflow.md) for folder resolution, idempotency, API calls, and verification.
2. Prefer `scripts/dataease_openapi.mjs` for ASK requests, SQL datasets, dashboard inspection/lint/update/publication, and chart queries instead of rebuilding authentication and transport logic.
3. Inspect existing chart definitions and data before changing presentation. For layout, formatting, sorting, and summaries, read [references/dashboard-patterns.md](references/dashboard-patterns.md). Reuse same-version components rather than inventing a canvas schema.
4. For metric, time-zone, maturity, benchmark, or cross-source changes, read [references/metric-contracts.md](references/metric-contracts.md). For filters, tree expansion, or popups, read [references/interactions.md](references/interactions.md). For material-library matching or scheduled refresh, read [references/data-freshness.md](references/data-freshness.md). Keep project-specific contracts beside the SQL/spec, not in this skill.
5. Before updating a dataset, inventory its dashboard consumers and dry-run the schema diff. Preserve the existing SQL table ID, field IDs, and internal names for unchanged fields. Treat removals, renames, and type changes as breaking changes.
6. Before changing a dashboard, make placement and preservation choices explicit in the dry-run, including whether a requested total or weighted mean is an embedded summary row or a separate chart, and which existing fields/views must remain.
7. Dry-run construction first. Record destination IDs, schema/consumer impact, operations, existing draft delta, and publication intent in the task artifacts; briefly report the material change before writing. An authorized update does not need a second approval ritual.
8. Treat draft update and publication as separate phases. Verify `main-edit` after `updateCanvas`; publish only explicitly declared active view IDs and explicitly acknowledged additions/removals relative to `main`.
9. After writing, verify resource IDs, parent folder IDs, dataset field identities, filter-to-view mappings, actual chart queries, publish status, and the rendered page.

## Invariants

- Dataset folder IDs and visualization folder IDs are not interchangeable.
- Keep every DataEase resource and view ID as a string. IDs can exceed JavaScript's safe integer range and must never pass through `Number`.
- Search the target folder for an existing same-name resource before creating. Update the confirmed existing ID on reruns to avoid duplicates.
- Preserve unrelated resources. Do not delete or move anything unless explicitly requested.
- Keep SQL and dashboard specs in the task workspace so the build can be repeated.
- A SQL dataset update must reuse unchanged field identities. The helper blocks live removals or type changes unless the schema contract explicitly allows them; a rename is a removal plus an addition.
- A dataset save is not complete until every declared consumer still resolves its fields and representative chart queries pass. Do not publish a dashboard that still references stale dataset field IDs.
- If `main-edit` already differs from `main`, preserve or resolve the existing content delta as well as acknowledging its view IDs. Experimental views and unrelated formula/filter/layout edits must not ride along with a publish.
- Preserve the approved metric contract, including time boundaries, units, exclusions, distinct-count grain, and maturity policy. Never infer these from a chart label, workstation timezone, or a cloned tooltip.
- Recompute ratio totals from their numerator and denominator. Whether incomplete cohorts are excluded or suppress the entire result is a contract choice, not a formatting choice.
- Run chart verification serially per datasource and keep the query set representative. On a connection-pool exhaustion error, stop unchanged retries and report the capacity boundary; datasource validation or an exact-config pool rebuild requires separate authorization.
- A failed post-write verification does not prove that the write rolled back. Re-read the draft before retrying, recovering, or publishing.
- Separate configuration, query results, browser interaction, and upstream refresh evidence. State any unverified layer; a save response or chart query is not proof of the rendered page, popup playback, or automatic synchronization.
- If a field is missing or its semantics are uncertain, stop at the dataset contract instead of presenting a misleading chart.

## Script

Run `node scripts/dataease_openapi.mjs --help` for syntax. The helper supports generic ASK requests, custom SQL datasets, read-only dashboard lint, dashboard inspection/update/publication, and chart queries. Live dataset/dashboard writes remain dry-run by default. It refuses plaintext HTTP unless `--allow-http` is supplied after explicit authorization.
