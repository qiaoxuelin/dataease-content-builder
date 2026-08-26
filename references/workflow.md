# DataEase content workflow

## Inputs and connection

Prefer a project-local credential file supplied by the user. The helper accepts labels such as `Access Key`, `Secret Key`, `地址`, `API 地址`, or `查看api`. Do not copy the credential file into the skill.

When the endpoint is plaintext HTTP, pass `--allow-http` only after the user explicitly authorizes plaintext transport for the target instance. ASK signs the request but does not encrypt HTTP traffic.

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

1. Fetch the published `main` resource and confirm its ID, parent ID, current view IDs, and target name.
2. Build and dry-run the desired payload, explicitly listing created, updated, removed, and retained views.
3. Call `updateCanvas` only for an authorized live write.
4. Fetch `main-edit` immediately and verify the draft's components, views, layout, filters, formulas, and representative chart queries.
5. If verification fails, stop publication and fetch `main-edit` again before deciding whether to repair or use `recoverToPublished`. Do not assume a thrown verification error reverted the draft.
6. Publish with explicit active view IDs only after the draft passes.
7. Fetch `main`, rerun representative queries, and then perform any explicitly authorized orphan cleanup.

Keep recovery and cleanup separate from the update. A request to revise a chart does not automatically authorize deleting unrelated resources or restoring the whole dashboard.

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

After a live write, fetch dataset details and preview data. Verify field names/types, row count, representative dimensions, stage order, null handling, and metric magnitude. A successful save response is not sufficient.

## Generic OpenAPI requests

Use a JSON body file for reproducibility:

```powershell
node <skill>/scripts/dataease_openapi.mjs --config .\dataease.txt --allow-http request POST /dataVisualization/findById '@.\find.json'
```

Paths are relative to `/de2api`; do not include credentials in body files.

## Dashboard and chart helper commands

Dashboard inspection accepts a JSON spec with quoted IDs:

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

## Query budget and datasource pool safety

- Reuse discovery results and query each materially different filter/time-zone branch once. Do not loop over the same chart merely to see whether an unchanged error disappears.
- Keep at most one outstanding validation query per datasource. Cross-source validation should also be serial because one logical chart can borrow connections from multiple pools.
- Start with field discovery and a small preview, then one representative chart query. Expand the validation matrix only after each layer succeeds.
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

Report:

- Dataset and visualization full paths, IDs, and create/update status.
- Datasource ID and SQL/spec files used.
- Dashboard ID, publish status, chart IDs, and preview URL.
- Default filter values and which views each filter controls.
- Dataset schema diff, preserved field identities, and the complete declared consumer list.
- Published-versus-draft active-view delta and every explicitly allowed addition/removal.
- Daily time-zone contract: raw database event timestamps are UTC0, the default path applies no offset, `全部 = UTC0`, and concrete-country offsets come from an explicit source when local-day reporting is requested.
- Currency/unit conversion, maturity/null policy, ratio numerator/denominator, and aggregate formula for financial or cohort metrics.
- Validation query count and whether any datasource pool/capacity boundary was encountered.
- Data preview checks and browser-level visual checks.
- If visual verification was unavailable, the exact API/query evidence completed and the remaining visual-review boundary.
- Any remaining semantic boundary, such as missing upstream install attribution or role-creation events.
