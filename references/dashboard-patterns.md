# Dashboard and filter patterns

## Reuse same-version templates

DataEase stores views, canvas components, styles, and query controls as large version-sensitive structures. Fetch a valid dashboard from the same instance/version and clone the nearest compatible chart and query components. Then replace only the fields that must change:

- New view/component IDs.
- `tableId`, title, chart type, axes, series, custom filters, and sort.
- Component layout and canvas dimensions.
- Target visualization folder `pid`.

Keep the source untouched. Save a new dashboard with `dataVisualization/saveCanvas`, or update the confirmed target with `dataVisualization/updateCanvas`. Publish with `dataVisualization/updatePublishStatus` and explicit active view IDs.

Before saving, build a preservation list from the source view: title, chart type, dataset, axes, calculated fields, filters, sorts, tooltips, download/duration measures, result count, and layout. Mark every item as retained, intentionally changed, or intentionally removed. Fail the dry-run when an existing item disappears without an explicit removal. Cloned metric explanations must be checked against the new SQL, not preserved blindly: source, date boundary, formula, denominator, exclusions, maturity, and unit must describe the actual chart.

## Formatting ownership

Declare whether a ratio is stored as `0..1` or `0..100`. Exactly one display layer owns the suffix and precision:

- Prefer the field formatter for percent, currency, and multiplier formatting.
- Keep axis, label, and tooltip suffixes empty when the field formatter already supplies the same suffix.
- If backend values and aggregates are correct but the page shows doubled percent signs, long recurring decimals, or inconsistent precision, repair the formatter rather than changing the metric formula.
- Use finite axis intervals compatible with the declared scale and precision; verify rendered ticks instead of trusting serialized settings.
- For dense tables, put a shared percent/currency unit in the header or title when requested and omit repeated cell suffixes without changing the numeric scale. Integer counts normally use no decimals; money and rates normally use two, while small LTV/CPI values may need more. Keep precision consistent across cells, cards, axes, and hover values.

Query returned values and actual browser rendering. A correct numeric result is not evidence that its visible format is correct.

For filter mappings, parameter types, tree expansion, and popup behavior, use [interactions.md](interactions.md).

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

Use the project's aggregate model from [metric-contracts.md](metric-contracts.md): a common timezone or a total of country-local reporting days. The selector's label alone does not choose the model. Keep timezone details in a title tooltip or compact explanation when they are informational rather than comparison columns.

### Latest version

For a required single-select version:

- `multiple = false`
- `required = true`
- `defaultValueCheck = true`
- `sortId = <version field id>`
- `sort = "desc"`
- `defaultValueFirstItem = true`

Both `sortId` and `sort` are needed; otherwise the first returned option can be arbitrary. Verify the actual rendered value. If version strings are not lexically sortable, add a numeric version-order field or set a validated explicit default rather than claiming “latest.”

## Ordering

Chart category order should come from a stable ordinal field or an explicit custom sort. Do not let label alphabetization redefine a process.

- For a metric ranking, inspect effective priority as well as each field's `sort`. A dimension's alphabetical order can take precedence over the intended numeric metric. Where supported, set `sortPriority` explicitly using field IDs, metric first, then stable tie-break dimensions. Verify the same-version schema rather than assuming this property alone is sufficient.
- Choose a default suited to the task, such as spend for delivery scale or a qualified efficiency measure for performance. Sort numbers as numbers, define null placement, and keep low-sample status visible. Preserve existing sort switches and test ascending, descending, and reset/default behavior.
- For tree tables, sort siblings within each parent and define each level separately; do not globally flatten children into a ranking. Date order, traffic-type order, and creative ranking can differ. Totals should retain their requested fixed position.
- Compare the ordered IDs and values before and after a sort-only change. Pivot rendering can reorder API rows; inspect the rendered tree too. A persisted `tableHeaderSort = true` does not prove that a particular tree-table implementation exposes clickable sorting.

## Summaries

Use [metric-contracts.md](metric-contracts.md) for ratio totals, distinct counts, weighting, and maturity. Never add pre-aggregated percentiles across dates or regions; recompute at the requested grain. For an overall duration, use true process begin/end events rather than summing optional module durations. Declare whether the result belongs in an embedded summary row or a separate chart before building.

### Embedded custom summary rows

DataEase table charts can calculate filtered custom totals without creating a separate chart:

- Set `customAttr.basicStyle.showSummary = true` and a clear `summaryLabel`.
- Populate `seriesSummary` using each displayed metric's `dataeaseName` as `field`.
- For a custom formula, set `summary = "custom"`, `show = true`, and store the aggregate expression in `originName` with calculated-field metadata expected by the same-version component.
- For `table-normal`, displayed metrics are normally in `yAxis`; for `table-info`, the summary selector uses numeric fields in `xAxis`.
- Hide non-metric cells such as registration count when their aggregation would make the “weighted mean” label misleading.

The backend returns custom aggregates in `data.customSumResult`; the frontend appends the visible summary row. Compare it with an independent calculation from complete, compatible-grain detail or a source aggregate. A persisted `showSummary` flag alone is insufficient. When a frozen bottom total is requested, verify it stays visible while scrolling; placing a literal total last in SQL does not freeze it. Totals must cover the selected dataset, not just the visible page.

## Readability and density

- Arrange the page around the user's comparison: key metrics first, supporting trends and detail below. Group date/user scope/traffic controls together and region/continent/market controls together when appropriate. Keep query/reset controls visible. Prefer a supported flat single-select for two explicit states over a decorative pseudo-switch; do not promise native controls without testing the installed version.
- Choose chart types by purpose: trends for time, stacked bars for composition, scatter for cost/quality tradeoffs, and radar only for defined comparable normalized dimensions. Keep metric colors consistent across views. Remove duplicate legends and empty decorative cards.
- Compare canvas width, scale settings, component width, and font sizes with a readable same-instance dashboard. Do not hardcode a universal zoom percentage.
- Separate aggregate overview from high-cardinality detail. Avoid labeling every point when category count makes labels unreadable.
- Size a table for its title, header, rows, and summary/pager. Give numeric columns enough room for realistic values; keep region columns compact and long creative names available on hover. Check card number/unit baselines so large values are not clipped.
- For no-pagination views, configure continuous scrolling and an adequate result limit, then reconcile returned row count against the filtered source. Hiding a pager or enlarging a chart does not fetch missing rows. Check normal, enlarged, and popup sizes, including internal scroll areas and frozen totals.
- Keep the canvas bottom close to the last intentional component and make the primary content use the intended width. Large unused regions usually indicate a canvas or component geometry problem.
- Verify desktop and mobile layouts independently when both are provided; a desktop coordinate edit does not prove mobile readability.

## Verification

After publish:

1. Fetch the dashboard and parse `canvasViewInfo` and `componentData`.
2. Confirm parent folder, publish status, view IDs, dataset IDs, axes, stages, sort, and filter mappings.
3. Query each representative view through `chartData/getData`, including at least one date range and each materially different region/time-zone branch.
4. Verify custom summaries and complete result counts as described above.
5. Open the preview page in a browser.
6. Verify visible default values, labels, summary-row placement, legends, clipping, overlap, loading state, and representative results.
7. Reload once to ensure defaults are durable rather than residual browser state.

If browser control is unavailable, report API/configuration verification as complete and visual verification as outstanding. Do not describe server-side chart data as rendered-page proof.
