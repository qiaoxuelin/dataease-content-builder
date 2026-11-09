# Metric and cross-source contracts

Read this reference for cohort, retention, LTV, ROI, currency conversion, ratio summaries, maturity-limited metrics, or cross-source datasets.

## Write the contract first

Keep a project-local JSON or Markdown contract beside the SQL/spec. Record only fields relevant to the requested metric:

- source datasets and datasources;
- source timestamp semantics and reporting-day grain;
- reporting time zone, all-region aggregation model, and country/timezone mapping source;
- source units, display units, and conversion factors;
- numerator, denominator, aggregation, and division-by-zero behavior;
- maturity mode, source-completeness evidence, and null policy;
- excluded traffic, users, payments, or revenue classes;
- date/region filters and every controlled view;
- expected fields and representative magnitude checks.

## Reporting days and all-region totals

Verify source timestamp semantics. For a new raw-event view with confirmed UTC timestamps and no other requested contract, use UTC0; preserve an existing approved local-day view. Never infer UTC+8 from the operator's machine.

Choose and label the aggregate model explicitly:

- **Common reporting day:** recut all events at one timezone, such as UTC0. This can require a separate aggregate query rather than summing local-day country rows.
- **Sum of country-local reporting days:** each country contributes its selected local calendar dates. Label the total accordingly; it is not a single simultaneous UTC interval. Recompute ratios from the corresponding underlying values. Sum distinct-user counts only if country populations are mutually exclusive under the contract; otherwise deduplicate at the total's intended grain.

`全部` can mean no country restriction or a dedicated aggregate branch, depending on this model. It does not universally mean UTC0. Apply the same reporting-day rule to cohort creation, activity, payment, ad revenue, and maturity within each joined metric. Reuse the project's configured timezone or fixed-offset mapping; disclose fixed-offset/DST limitations and unknown-region fallbacks rather than calling them precise local time.

If one source cannot be cut to the same local-day boundary as another, do not join local-day revenue to UTC0 cost and call it ROI. Either keep both sides at UTC0, obtain a compatible source field, or report that the comparison is not semantically available.

## Standard game analytics conventions

Use these defaults unless an explicit project contract overrides them:

- Declare lifecycle numbering before copying metrics. In a one-based contract, registration/first-play day is visible `D1` and SQL offset `day_n = 0`; next-day retention is `D2` at offset 1. Cumulative LTV/ROI `Dn` includes offsets `0..n-1`, while point retention `Dn` tests qualifying activity at offset `n-1`. Other projects may label next-day retention D1; preserve their convention and explain the offset. Do not silently rename or shift windows. Define qualifying activity separately from registration.
- If raw IAP money is gross cents, convert to gross USD with `money / 100.0`; when the approved net-revenue contract is 70%, calculate net USD as `money / 100.0 * 0.7`. Do not divide an already-USD field or apply 70% again to an already-net field.
- If raw IAA revenue is micro-USD, convert with `revenue / 1000000.0`. Do not re-convert a field already expressed in USD.
- AEO/Install attribution must retain `未归因` and `多来源冲突` instead of forcing them into a paid type. Unattributed does not by itself mean organic traffic or no character creation. Prefer a direct stable role/user mapping when available, then a documented fallback bridge. Report mapped, unmapped, and conflicting coverage before comparing retention, LTV, or ROI by traffic type.

Period payer/active counts usually require distinct users over the whole interval, not a sum of daily distinct counts. Record the actual grain; daily average DAU is a separate measure. Apply approved player/IP exclusions consistently to overview, detail, popup, and benchmark queries. Do not remove aggregate ad spend merely because game users are excluded.

Field names alone do not prove these source contracts. Confirm raw unit, gross/net status, event-day meaning, and attribution lineage before applying a conversion or label.

## Maturity and missing data

Choose a mode for each cohort metric and retain it across the overview, daily detail, popup, and comparison:

- **Eligible cohorts only:** use only cohorts whose matching observation window is complete; disclose the covered cohort count/range. Numerator and denominator must use the same eligible set.
- **All selected cohorts complete:** show `NULL`/`—` until every relevant cohort in the selected interval has a complete observation window. Do not silently fall back to eligible-only calculation. Use the same rule for retention and ROI when the user requests it.

An observation is complete only when its reporting-day window has ended and the required sources have coverage through that boundary. A latest event timestamp alone does not prove ingestion completeness. Missing attribution/cost, zero cost, immature observations, and genuine zero results are different states. Preserve them in SQL; formatting must not turn them all into zero.

## Ratios and summaries

- Totals and filtered summaries use `sum(eligible numerator) / sum(eligible denominator)`, not an average or sum of row-level ratios.
- Weighted means use `sum(metric * weight) / sum(weight)` only over rows where the metric is present.
- An immature cumulative observation is `NULL`, not zero.
- For eligible-only ROI, include cost only for the matching complete revenue cohorts; for all-selected-complete ROI, suppress the result while any required cohort is incomplete.
- Guard zero denominators with `nullIf` or the datasource equivalent.
- Verify the server aggregate against an independent calculation at the same grain using complete detail or a source aggregate. A truncated page cannot validate a grand total, and daily distinct counts cannot reconstruct interval distinct users.
- Declare whether ratio values are stored as `0..1` or `0..100`, and let exactly one display layer add the percent suffix and rounding.

For monetary metrics, state conversions explicitly. Example: if game revenue is reported in cents and spend is in USD, convert revenue with `revenue_cents / 100.0` before aggregation and label every displayed amount as USD.

Name the business formula explicitly: installation-cohort net revenue / matched spend, same-period net revenue / spend, and (revenue - spend) / spend are different measures. If the project calls the first measure ROI, retain that term with a definition; do not relabel same-period coverage as cohort ROI. For retention decay, preserve a requested ratio such as D3/D2 and display a factor, not a subtraction or percentage.

## Creative quality and radar comparisons

- Keep raw values alongside any normalized score. Define each dimension's formula, direction (for example lower CPI is better), unit, eligible comparison pool, and sample requirement.
- Compare like-for-like date, region, traffic type, attribution, and maturity scopes. Thresholds and rating weights belong to the project contract; do not invent a universal minimum sample or composite grade.
- For percentile scores, define ties and insufficient-pool behavior; a missing dimension is not zero or an invented neutral score.
- A percentile median fixed at 50 is a reference line, not evidence of a measured average. Label it as such. For a useful actual benchmark, expose raw peer median/weighted aggregate values with their denominators. If comparing a best creative, identify the selection criterion and use one real creative; do not stitch dimension-wise maxima into a fictional material.
- The radar, dimension table, and popup must use the same values and eligible pool. If next-day retention contributes to quality, expose its raw rate and sample/coverage explanation in the popup.

## Cross-source preflight

Before creating or changing a dashboard:

1. Preview each source independently at the intended daily grain.
2. Verify join keys, units, time zones, and duplicate cardinality.
3. Build the smallest cross-source dataset with one dimension and one metric from each side.
4. Test date parameters in the exact layer where DataEase will evaluate them; datasource SQL functions that work alone may still fail through Calcite.
5. Run one unfiltered and one filtered chart query.
6. Only then add cumulative stages, calculated fields, summaries, and layout.

For databases on the same ClickHouse instance, test a single authorized datasource with fully qualified table names before using a cross-datasource join. Verify access to both databases and the actual DataEase query path; do not assume the source name determines permission or performance. Prefer a persisted aggregate when repeated joins remain slow. Any new aggregate must preserve required distinct counts and drill dimensions.

Before adding period or region comparisons, estimate `views x periods x regions x datasources`. If the smallest filtered query is already slow or triggers a pool incident, stop and build/reuse a daily aggregate instead of multiplying the raw cross-source query.

Record timings for the same representative parameters before and after optimization, including whether results were cached. Use [interactions.md](interactions.md) for the filter regression matrix and [workflow.md](workflow.md) for datasource pool limits.
