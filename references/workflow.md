# DataEase content workflow

## Inputs and connection

Prefer a project-local credential file supplied by the user. The helper accepts labels such as `Access Key`, `Secret Key`, `地址`, `API 地址`, or `查看api`. Do not copy the credential file into the skill.

When the endpoint is plaintext HTTP, pass `--allow-http` only after the user authorizes plaintext transport for the target instance and scope. Reuse that authorization within the current task. ASK signs the request but does not encrypt HTTP traffic.

## ID safety

Keep dataset, dashboard, view, component, and field IDs as decimal strings from discovery through serialization. Some DataEase IDs exceed `Number.MAX_SAFE_INTEGER`; parsing them as JavaScript numbers can silently change filter-map keys, active view IDs, or deletion targets. Require quoted IDs in JSON specs and compare them as strings.

## Resolve destinations

Use the running instance's tree APIs to resolve locations:

- Dataset tree: `POST /datasetTree/tree` with `{"busiFlag":"dataset"}`.
- Visualization tree: `POST /dataVisualization/tree` with `{"busiFlag":"dashboard"}`.

Walk the full returned path and record both the name and ID. If several folders share a name, use the full path or ask for the intended one. Do not infer a visualization folder ID from a dataset folder ID.

If a requested folder does not exist, create it only when the request includes creating the destination. First inspect the OpenAPI schema or a same-version UI request for the folder payload; folder APIs vary more than leaf-resource APIs.

## Idempotent resource handling

Before a create:

1. List children under the resolved target folder.
2. Match exact name and resource type.
3. If no match exists, create.
4. If one match exists and the user asked to revise/rebuild, update that ID.
5. If multiple matches exist, do not guess. Report the IDs and disambiguate.

Persist resource IDs in a local JSON spec. A repeat run should update the same resource, not create a new sibling.

## Dashboard mutation state machine

Use this sequence for updates:

1. Fetch `main` and `main-edit`; confirm ID, parent ID, view IDs, and target name. Compare content as well as IDs: an unchanged view set can still contain someone else's filter, formula, or layout edits. Preserve or explicitly resolve pre-existing draft changes before writing.
2. Build and dry-run the desired payload, explicitly listing created, updated, removed, and retained views.
3. Call `updateCanvas` only for an authorized live write.
4. Fetch `main-edit` immediately and verify the draft's components, views, layout, filters, formulas, and representative chart queries.
5. If verification fails, stop publication and fetch `main-edit` again before deciding whether to repair or use `recoverToPublished`. Do not assume a thrown verification error reverted the draft.
6. Publish with explicit active view IDs only after the draft passes.
7. Fetch `main`, rerun representative queries, verify changed interactions on the page, and then perform any explicitly authorized orphan cleanup. For jump/outer-parameter definitions stored outside the canvas, also follow [interactions.md](interactions.md).

Keep recovery and cleanup separate from the update. A request to revise a chart does not automatically authorize deleting unrelated resources or restoring the whole dashboard.

### Change-scope contracts

Classify the intended mutation before building the payload:

- **Visual-only:** preserve dataset/table IDs, axes, calculated formulas, filters, sorts, active view IDs, and metric semantics. Record hashes or structural diffs before and after so a styling change cannot silently become a data change.
- **Metric-only:** preserve component geometry, canvas dimensions, reading order, and unaffected style unless the requested metric requires an explicit layout change.
- **Dataset/filter:** inventory every consumer and treat cached field metadata, filter mappings, and date semantics as part of the change surface.

`canvasViewInfo` can contain query-control entries such as `innerType = 'VQuery'` in addition to chart views. Published `activeViewIds` normally represent user chart views only. Validate preservation of the complete canvas key set and the active-view set separately; never require those two sets to be equal.

## SQL datasets

Example spec:

```json
{
  "id": "optional-existing-dataset-id",
  "name": "Resource timing",
  "pid": "target-dataset-folder-id",
  "datasourceId": "datasource-id",
  "tableName": "Custom SQL",
  "sqlFile": "./resource_timing.sql",
  "schemaContract": {
    "expectedFields": ["date", "country", "metric"],
    "allowRemovals": false,
    "allowTypeChanges": false
  },
  "dryRun": true
}
```

Run from any directory; `sqlFile` is resolved relative to the spec file:

```powershell
node <skill>/scripts/dataease_openapi.mjs --config .\dataease.txt --allow-http sql-dataset create '@.\dataset.json'
node <skill>/scripts/dataease_openapi.mjs --config .\dataease.txt --allow-http sql-dataset update '@.\dataset.json'
```

The helper performs `datasetData/tableField` and then calls `datasetTree/create` or `datasetTree/save`. On update it reads the existing dataset, reuses the current SQL table ID, and preserves each unchanged field's `id`, `dataeaseName`, and `fieldShortName`. Dry-run reports additions, removals, type changes, and identity preservation. A live update requires `schemaContract.expectedFields`; removals and type changes are blocked unless their individual contract flags are explicitly true.

### Dataset dependency and schema safety

Before updating a dataset:

1. Fetch its details and record the current SQL hash, table ID, complete field identity map, parent folder, and datasource.
2. Find every dashboard/view/query filter that consumes it. Save the dashboard ID, view ID, field IDs, calculated fields, and filter mappings in the task workspace.
3. Preview the new SQL with the existing table ID and compare fields by `originName`, type, and date semantics.
4. Treat a rename as removal plus addition. Additions are normally safe; removals, type changes, unit changes, time-zone changes, and grain changes require explicit intent and downstream repair.
5. After saving, read the dataset back, compare its SQL hash and field identities, then query every declared consumer before any dashboard publication.

If consumer discovery is incomplete, stop at the schema-diff dry-run. Do not rely on a successful dataset save response as evidence that downstream charts remain valid.

Even when field IDs are unchanged, re-fetch each consumer's `main` and `main-edit` definitions after the dataset write. Verify native `DATE` versus timestamp semantics, cached field types, date-filter conversion, and representative queries. Rebind or resave a consumer only when the readback proves that its cached metadata is stale.

After a live write, fetch dataset details and preview data. Verify field names/types, row count, representative dimensions, stage order, null handling, and metric magnitude. A successful save response is not sufficient.

## Generic OpenAPI requests

Use a JSON body file for reproducibility:

```powershell
node <skill>/scripts/dataease_openapi.mjs --config .\dataease.txt --allow-http request POST /dataVisualization/findById '@.\find.json'
```

Paths are relative to `/de2api`; do not include credentials in body files.

## Dashboard and chart helper commands

Dashboard inspection accepts a JSON spec with quoted IDs:

Use `dashboard lint @spec.json` before and after a dashboard mutation. It fetches `main` and `main-edit` but does not execute chart-data queries. The spec requires a quoted `dashboardId`, accepts `source` as `main`, `main-edit`, or `both`, and may define `thresholds.minTitleFontSize`, `minAxisFontSize`, and `minTableFontSize`. For overflow or bottom-whitespace assertions, also provide the dashboard's known `canvasGridWidth` and `canvasGridHeight`; `maxBottomBlankRatio` is evaluated only in that grid coordinate system, never against pixel canvas height. Set `failOnIssues` only when lint errors should produce a non-zero exit code.

Lint reports query-control IDs separately from active chart IDs, stale or incomplete filter mappings, suspicious orphan views, duplicate percent-format owners, canvas overflow/overlap, bottom whitespace, optional font thresholds, and the published-versus-draft structure hash delta.

```json
{"dashboardId":"123","source":"main"}
```

```powershell
node <skill>/scripts/dataease_openapi.mjs --config .\dataease.txt --allow-http dashboard inspect '@.\dashboard.json'
```

Dashboard update and publication are dry-run unless the spec contains `"dryRun": false`. Update specs reference a complete payload file and may declare expected/absent view IDs. Publish specs may declare the exact active view IDs:

```json
{
  "dashboardId": "123",
  "payloadFile": "./dashboard-payload.json",
  "expectedPid": "321",
  "expectedExistingDraftActiveViewIds": ["456", "789"],
  "expectedViewIds": ["456", "789"],
  "expectedAbsentViewIds": ["999"],
  "dryRun": true
}
```

```powershell
node <skill>/scripts/dataease_openapi.mjs --config .\dataease.txt --allow-http dashboard update '@.\dashboard-update.json'
node <skill>/scripts/dataease_openapi.mjs --config .\dataease.txt --allow-http dashboard publish '@.\dashboard-publish.json'
```

A live dashboard update requires `expectedPid` and `expectedViewIds`. If the existing draft's active views differ from the published main version, also supply the exact `expectedExistingDraftActiveViewIds` to acknowledge that pre-existing draft state.

A live publish requires:

```json
{
  "dashboardId": "123",
  "expectedMainActiveViewIds": ["456", "789"],
  "activeViewIds": ["456", "789", "900"],
  "allowedAddedViewIds": ["900"],
  "allowedRemovedViewIds": [],
  "dryRun": false
}
```

The helper blocks publication when the actual published baseline changed or when the draft adds/removes views that are not listed explicitly. This prevents abandoned experimental views from riding along with an unrelated publish.

Use `chart query @spec.json` for repeatable data verification. A declarative `dateRange` uses `YYYY-MM-DD` labels plus an explicit UTC offset and is converted to the millisecond values required by DataEase.

```json
{
  "dashboardId": "123",
  "viewId": "456",
  "source": "main-edit",
  "dateRange": {
    "filterId": "100",
    "componentId": "200",
    "fieldId": "300",
    "start": "2026-07-01",
    "end": "2026-07-31",
    "utcOffset": "+08:00"
  },
  "filters": []
}
```

The helper also exports its ASK transport, exact-ID, date-range, dashboard, and calculated-field encoding functions for project scripts. Import those functions instead of copying authentication code.

Keep reusable project modules import-safe: importing utilities must not read credentials, prepare a live payload, publish, or interpret the caller's `process.argv`. Use an explicit direct-execution guard, as the bundled helper does, and invoke mutations through named functions. Keep version-specific payload builders in the project until their behavior is demonstrated reusable; do not add a generic write helper based on a single instance's JSON shape.

## Query budget and datasource pool safety

- Reuse discovery results and query each materially different filter/time-zone branch once. Do not loop over the same chart merely to see whether an unchanged error disappears.
- Keep at most one outstanding validation query per datasource. Cross-source validation should also be serial because one logical chart can borrow connections from multiple pools.
- Start with field discovery and a small preview, then one representative chart query. Expand the validation matrix only after each layer succeeds.
- Estimate the logical query multiplier before adding comparison views: views x periods x regions x datasources. Benchmark the smallest filtered query and record latency before multiplying it.
- Current/previous-period or regional comparisons should reuse a daily aggregate. Do not duplicate a heavy raw-event cross-source join for every comparison branch.
- Treat `Cannot get a connection`, `pool error`, `Timeout waiting for idle object`, or `borrowMaxWaitDuration` as a capacity/pool incident. Stop further chart queries and preserve the draft recovery point.
- Data source validation proves that connection settings work; it does not prove the existing query pool has an idle connection. Re-saving a datasource to rebuild its pool is an external mutation and requires explicit user authorization.

## Removing a dashboard view

When removal is explicitly authorized, verify every layer:

- Remove the view from `canvasViewInfo`.
- Remove its `componentData` entry and restore the remaining layout deliberately.
- Remove it from every query component's `checkedFields`, `checkedFieldsMap`, `treeCheckedList`, and per-view auxiliary maps.
- Exclude it from published `activeViewIds`.
- After successful publication, remove chart-scoped calculated fields only when they belong solely to the removed view.

Read back both draft and published resources. A hidden component or orphan calculated field means the removal is incomplete.

## Completion evidence

Keep a reproducible task artifact with the resource paths/IDs, SQL/spec files, schema/consumer diff, draft/published delta, and relevant metric/filter contracts. Record representative query parameters, results/timings, and visual/interaction checks. For sync work, include the downstream freshness evidence from [data-freshness.md](data-freshness.md).

The user-facing completion should state what changed, where to view it, what was verified, and any remaining limit. Do not dump every ID for a small styling change. Distinguish saved configuration, successful queries, actual page behavior, and scheduled operation; report unavailable verification honestly.
