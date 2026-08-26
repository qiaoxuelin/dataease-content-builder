# Dashboard and filter patterns

## Reuse same-version templates

DataEase stores views, canvas components, styles, and query controls as large version-sensitive structures. Fetch a valid dashboard from the same instance/version and clone the nearest compatible chart and query components. Then replace only the fields that must change:

- New view/component IDs.
- `tableId`, title, chart type, axes, series, custom filters, and sort.
- Component layout and canvas dimensions.
- Target visualization folder `pid`.

Keep the source untouched. Save a new dashboard with `dataVisualization/saveCanvas`, or update the confirmed target with `dataVisualization/updateCanvas`. Publish with `dataVisualization/updatePublishStatus` and explicit active view IDs.

Before saving, build a preservation list from the source view: title, chart type, dataset, axes, calculated fields, filters, sorts, tooltips, download/duration measures, result count, and layout. Mark every item as retained, intentionally changed, or intentionally removed. Fail the dry-run when an existing item disappears without an explicit removal. This protects secondary measures that are easy to lose while rebuilding a chart.

## Cross-dataset query filters

A query condition is not linked merely because fields share a name. Populate:

- `checkedFields`: every linked view ID.
- `checkedFieldsMap`: view ID to that view's dataset field ID.
- `treeCheckedList` with the same mapping.
- Empty per-view arrays/maps expected by the component schema.

Use the field ID from each chart's own dataset. This is especially important when a version filter controls both a funnel dataset and a timing dataset.

Keep view IDs as exact strings in every mapping. When a filter returns no data, debug in this order: confirm the view-to-field mapping, confirm operator and value types, query the field without the filter, then inspect date grain and time-zone semantics.

## Useful defaults

### Dynamic recent date range

For the most recent `N` days including today:

- `defaultValueCheck = true`
- `timeType = "dynamic"`
- `relativeToCurrentRange = "custom"`
- `timeNum = N - 1`, `around = "f"`
- `timeNumRange = 0`, `aroundRange = "f"`
- date-range granularity with start and end relative to the current date

Leave fixed date arrays empty so the client recalculates the range when the dashboard opens. Verify the rendered input values, not only the saved JSON.

### Day-only date ranges

Reuse a same-version date-range query component and configure day granularity rather than date-time granularity. In versions that expose these properties, this is typically `displayType = "7"`, `timeGranularity = "date"`, and `timeGranularityMultiple = "daterange"`; verify the actual rendered control because the schema is version-sensitive.

The chart-data API still expects epoch milliseconds for a `between` filter even when the UI displays only `YYYY-MM-DD`. Do not send date strings. Convert the start to local `00:00:00.000` and the end to local `23:59:59.999` using an explicit offset for the DataEase/user context used by the test.

### Country-local days and `全部`

For daily cohort, retention, revenue, or LTV dashboards with a region selector, use one stable contract:

- Raw database event timestamps are UTC0. Default date and hour dimensions use the raw timestamp without an offset; do not infer UTC+8 from the operator's browser or workstation timezone.
- `全部` is a dedicated aggregate branch whose registration and event dates are cut at the raw UTC0 boundary.
- Each concrete country uses an explicit configured minute offset to derive its local dates.
- Apply the same offset to cohort creation, activity, payment, ad-revenue, and maturity dates before joining or comparing day numbers.
- Keep the country-to-offset mapping in project SQL/config and reuse the project's established mapping. Do not infer offsets from the operator's browser or the DataEase server.

An explicit `全部` row is required when local-day country rows are present; removing the country constraint would mix differently cut calendar days. Configure the selector to default to the explicit `全部` value. For dashboards that do not use local-day country branches, a conventional unfiltered “all” may still be appropriate, but do not conflate the two models.

A ClickHouse implementation can join a small offset table and derive `toDate(addMinutes(timestamp, offset_min))`. The `全部` branch uses `offset_min = 0`. Validate at least one non-zero-offset country and the UTC0 aggregate over the same visible date range.

### Latest version

For a required single-select version:

- `multiple = false`
- `required = true`
- `defaultValueCheck = true`
- `sortId = <version field id>`
- `sort = "desc"`
- `defaultValueFirstItem = true`

Both `sortId` and `sort` are needed; otherwise the first returned option can be arbitrary. Verify the actual rendered value. If version strings are not lexically sortable, add a numeric version-order field or set a validated explicit default rather than claiming “latest.”

## Ordering and metrics

Chart category order should come from a stable ordinal field or an explicit custom sort. Do not let label alphabetization redefine a process.

Never add pre-aggregated percentiles across dates or regions. Either keep P50/P95 aggregated at the exact filter grain or expose raw durations to a chart engine that can calculate percentiles correctly. For an overall duration, calculate the timestamp difference between the true process begin/end events; do not sum optional module durations.

For a ratio total, aggregate source values rather than visible percentages: `sum(eligible numerator) / sum(eligible denominator)`. Averages of daily ROI, conversion rate, retention rate, or LTV multipliers are not valid totals unless the metric contract explicitly proves equal weights. For maturity-limited cumulative metrics, include cost or cohort weight only for rows whose matching numerator is mature and non-null.

### Weighted means

Do not use a plain average when cohort rows have different population sizes. For metric `m` and weight `w`, calculate `sum(m * w) / sum(w)` over rows where `m` is present. Exclude the weight of null or immature metric rows from the denominator and guard division by zero with `nullIf` or the datasource equivalent.

Before building, state whether the result belongs in an embedded table summary row or a separate chart. Preserve that placement choice in the dry-run.

### Embedded custom summary rows

DataEase table charts can calculate filtered custom totals without creating a separate chart:

- Set `customAttr.basicStyle.showSummary = true` and a clear `summaryLabel`.
- Populate `seriesSummary` using each displayed metric's `dataeaseName` as `field`.
- For a custom formula, set `summary = "custom"`, `show = true`, and store the aggregate expression in `originName` with calculated-field metadata expected by the same-version component.
- For `table-normal`, displayed metrics are normally in `yAxis`; for `table-info`, the summary selector uses numeric fields in `xAxis`.
- Hide non-metric cells such as registration count when their aggregation would make the “weighted mean” label misleading.

The backend returns custom aggregates in `data.customSumResult`; the frontend appends the visible summary row. Verification must compare each returned aggregate with an independent client-side weighted recomputation from the filtered detail rows. A persisted `showSummary` flag alone is insufficient.

## Verification

After publish:

1. Fetch the dashboard and parse `canvasViewInfo` and `componentData`.
2. Confirm parent folder, publish status, view IDs, dataset IDs, axes, stages, sort, and filter mappings.
3. Query each representative view through `chartData/getData`, including at least one date range and each materially different region/time-zone branch.
4. For custom summaries, compare `customSumResult` with an independent calculation over the returned detail rows.
5. Open the preview page in a browser.
6. Verify visible default values, labels, summary-row placement, legends, clipping, overlap, loading state, and representative results.
7. Reload once to ensure defaults are durable rather than residual browser state.

Also check layout geometry before visual review:

- no unintended overlap among query controls and charts;
- component height fits the configured default row count;
- canvas height contains the last component;
- labels, columns, legends, and summaries are not clipped;
- desktop and mobile layouts preserve reading order;
- absolute coordinates remain stable after a second dry-run.

If browser control is unavailable, report API/configuration verification as complete and visual verification as outstanding. Do not describe server-side chart data as rendered-page proof.
