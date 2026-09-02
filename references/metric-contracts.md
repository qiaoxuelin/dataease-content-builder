# Metric and cross-source contracts

Read this reference for cohort, retention, LTV, ROI, currency conversion, ratio summaries, maturity-limited metrics, or cross-source datasets.

## Write the contract first

Keep a project-local JSON or Markdown contract beside the SQL/spec. Record only fields relevant to the requested metric:

- source datasets and datasources;
- source timestamp semantics and reporting-day grain;
- default time zone, `全部` boundary, and country-offset source;
- source units, display units, and conversion factors;
- numerator, denominator, aggregation, and division-by-zero behavior;
- maturity rule and null policy;
- excluded traffic, users, payments, or revenue classes;
- date/region filters and every controlled view;
- expected fields and representative magnitude checks.

For raw game events, default to UTC0 unless the user explicitly requests a local-day view. For local-day country rows, apply the same configured minute offset to cohort creation, activity, payment, ad revenue, and maturity. `全部` remains an explicit UTC0 branch.

If one source cannot be cut to the same local-day boundary as another, do not join local-day revenue to UTC0 cost and call it ROI. Either keep both sides at UTC0, obtain a compatible source field, or report that the comparison is not semantically available.

## Standard game analytics conventions

Use these defaults unless an explicit project contract overrides them:

- Raw event timestamps are UTC0. The explicit `全部` aggregate is also cut at UTC0.
- Concrete-country daily views use the established country-to-minute-offset mapping. Apply the same offset to cohort creation, activity, IAP, IAA, and maturity before calculating lifecycle days.
- Lifecycle days are one-based for every player metric: the registration/first-play calendar day is visible `D1` and SQL offset `day_n = 0`; visible `D2` maps to `day_n = 1`. Cumulative LTV/ROI `Dn` includes offsets `0..n-1`, while point retention `Dn` tests qualifying activity at offset `n-1`. A cumulative or retention `Dn` is mature only after that reporting-day window is complete. Define qualifying activity separately from registration so D1 retention is not assumed to be 100%. Do not use a D0 business label.
- If raw IAP money is gross cents, convert to gross USD with `money / 100.0`; when the approved net-revenue contract is 70%, calculate net USD as `money / 100.0 * 0.7`. Do not divide an already-USD field or apply 70% again to an already-net field.
- If raw IAA revenue is micro-USD, convert with `revenue / 1000000.0`. Do not re-convert a field already expressed in USD.
- AEO/Install attribution must retain `未归因` and `多来源冲突` instead of forcing them into a paid type. Prefer a direct stable role/user mapping when available, then a documented fallback bridge. Report mapped, unmapped, and conflicting coverage before comparing retention, LTV, or ROI by traffic type.

Field names alone do not prove these source contracts. Confirm raw unit, gross/net status, event-day meaning, and attribution lineage before applying a conversion or label.

## Ratio and maturity rules

- Totals and filtered summaries use `sum(eligible numerator) / sum(eligible denominator)`, not an average or sum of row-level ratios.
- Weighted means use `sum(metric * weight) / sum(weight)` only over rows where the metric is present.
- An immature cumulative observation is `NULL`, not zero.
- For maturity-limited ROI, cost enters the denominator only where the matching cumulative revenue observation is mature and non-null.
- Guard zero denominators with `nullIf` or the datasource equivalent.
- Verify the server aggregate against an independent recomputation from returned detail rows.
- Declare whether ratio values are stored as `0..1` or `0..100`, and let exactly one display layer add the percent suffix and rounding.

For monetary metrics, state conversions explicitly. Example: if game revenue is reported in cents and spend is in USD, convert revenue with `revenue_cents / 100.0` before aggregation and label every displayed amount as USD.

## Cross-source preflight

Before creating or changing a dashboard:

1. Preview each source independently at the intended daily grain.
2. Verify join keys, units, time zones, and duplicate cardinality.
3. Build the smallest cross-source dataset with one dimension and one metric from each side.
4. Test date parameters in the exact layer where DataEase will evaluate them; datasource SQL functions that work alone may still fail through Calcite.
5. Run one unfiltered and one filtered chart query.
6. Only then add cumulative stages, calculated fields, summaries, and layout.

Prefer a persisted daily aggregate or a same-source join when the cross-source query is repeatedly used, slow, or dependent on unsupported Calcite translation.

Before adding period or region comparisons, estimate `views x periods x regions x datasources`. If the smallest filtered query is already slow or triggers a pool incident, stop and build/reuse a daily aggregate instead of multiplying the raw cross-source query.

## Filter verification matrix

For date/region dashboards, verify at least:

- default range after a fresh page load and after one reload;
- one known non-empty range and one intentionally empty range;
- `全部` at UTC0;
- one non-zero-offset country when local-day reporting is enabled;
- every mapped dataset field ID;
- day-only display while the query API receives epoch-millisecond bounds;
- no stale chart or filter field IDs after a dataset update.
