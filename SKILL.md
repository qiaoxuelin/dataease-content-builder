---
name: dataease-content-builder
description: Create or update DataEase SQL datasets, dashboards, charts, and query filters in user-specified dataset and visualization folders through the DataEase OpenAPI. Use for repeatable DataEase content placement, publication, and validation; do not use for SQL-only analysis that does not modify DataEase.
---

# DataEase Content Builder

Create DataEase content in the exact dataset and visualization locations requested by the user, while keeping the workflow repeatable and verifiable.

## Before acting

Resolve these inputs from the request and local project files:

- DataEase base URL and ASK credentials. Never print credentials or signed headers.
- Explicit permission for plaintext HTTP when the base URL uses `http://`.
- Target dataset folder and visualization folder. Resolve each to an ID; they are separate trees even when their names match.
- Datasource ID, SQL files, dataset names, dashboard name, filters, and publication intent.

Read-only discovery is allowed when relevant. Creating, updating, publishing, moving, or deleting DataEase resources requires user intent that covers that mutation. Never treat earlier authorization from another task as permanent authorization.

## Workflow

1. Read [references/workflow.md](references/workflow.md) for folder resolution, idempotency, API calls, and verification.
2. Prefer `scripts/dataease_openapi.mjs` for ASK requests, SQL datasets, dashboard inspection/update/publication, and chart queries instead of rebuilding authentication and transport logic.
3. For dashboards or query filters, also read [references/dashboard-patterns.md](references/dashboard-patterns.md). Reuse a valid dashboard/view/query component from the same DataEase version rather than inventing a canvas schema.
4. For cohort, retention, LTV, ROI, currency conversion, ratio summaries, or cross-source work, also read [references/metric-contracts.md](references/metric-contracts.md) and write the metric/time/unit contract before building.
5. Before updating a dataset, inventory its dashboard consumers and dry-run the schema diff. Preserve the existing SQL table ID, field IDs, and internal names for unchanged fields. Treat removals, renames, and type changes as breaking changes.
6. Before changing a dashboard, make placement and preservation choices explicit in the dry-run, including whether a requested total or weighted mean is an embedded summary row or a separate chart, and which existing fields/views must remain.
7. Dry-run construction first. Before a live write, report the exact destination folder, datasource, resource names, schema and consumer impact, create/update/delete operations, existing draft delta, and publication intent.
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
- If `main-edit` already differs from `main`, do not overwrite or publish it until the exact existing draft view IDs are acknowledged. Experimental views must not ride along with an unrelated publish.
- Treat database raw event timestamps such as `event_time` as UTC0. Unless the user explicitly requests a local-day view, derive dates and hours directly from the raw timestamp; never add an implicit UTC+8 offset.
- For region-scoped daily cohort dashboards, `全部` uses the raw UTC0 day boundary. Each concrete country uses its explicit configured minute offset to derive local registration and event dates; use the same offset rule across every joined metric.
- For ratios and cumulative metrics, aggregate the eligible numerator and denominator first; never average row-level ratios. Exclude immature or null metric rows from both the numerator and the corresponding denominator.
- Run chart verification serially per datasource and keep the query set representative. On a connection-pool exhaustion error, stop unchanged retries and report the capacity boundary; datasource validation or an exact-config pool rebuild requires separate authorization.
- A failed post-write verification does not prove that the write rolled back. Re-read the draft before retrying, recovering, or publishing.
- Distinguish API/configuration verification from visual verification. For dashboards, both are required when layout or filter behavior matters.
- If browser verification is unavailable, report that boundary explicitly; chart queries and saved-configuration checks are not visual proof.
- If a field is missing or its semantics are uncertain, stop at the dataset contract instead of presenting a misleading chart.

## Script

Run `node scripts/dataease_openapi.mjs --help` for syntax. The helper supports generic ASK requests, custom SQL datasets, dashboard inspection/update/publication, and chart queries. Live dataset/dashboard writes remain dry-run by default. It refuses plaintext HTTP unless `--allow-http` is supplied after explicit authorization.
