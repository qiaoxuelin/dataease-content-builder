# Filters, tree expansion, and popups

Read for filter changes, cross-dataset linkage, expandable detail, scatter-point clicks, or material-detail popups. Native properties below are version-sensitive; inspect a working component on the target instance first.

## Filter and parameter contracts

A query condition is not linked merely because fields share a name. In components using these structures, populate `checkedFields`, `checkedFieldsMap`, and `treeCheckedList` consistently, using each view's own dataset field ID and exact string view IDs. Preserve required per-view auxiliary maps.

Record for each control: displayed label, stored value/type, single/multiple mode, empty/all meaning, default/reset value, affected views, and SQL parameter binding. Then:

- Handle `全部`/empty selection deliberately. A literal country or traffic predicate must not accidentally filter for a row named `全部`. Keep explicit aggregate-row models distinct from unrestricted detail selection.
- Confirm which layer quotes a parameter. If DataEase expands a selected string into quoted SQL literals, do not add another quote pair around the placeholder. Inspect the actual rendered query for defaults and multi-selects; do not repair it with blind string replacement.
- Keep compatible types in comparisons, `IN`, `if`/`multiIf`, `CASE`, and `UNION` branches. For ClickHouse `String`/`UInt8` conflicts, inspect the expanded expression and source types before choosing an explicit cast. A UI label can be text while the stored switch is numeric; map them consistently.
- Date-only controls may pass epoch milliseconds through the chart API. Verify the payload boundary separately from the source reporting-day timezone; do not shift event dates to match the browser's clock. See [dashboard-patterns.md](dashboard-patterns.md) for native date controls.
- When a filter yields no data, check view/field mapping, expanded operators/types, the unfiltered source values, then date/attribution semantics. Reproduce the actual default chart request before changing permissions or SQL.

For expensive selectors, check whether option loading scans facts. Reuse an appropriate small dimension or configured enum when it has the same coverage and approved refresh behavior; do not sacrifice new-region visibility merely to speed up a dropdown.

## Interaction model

Distinguish these requests before implementation:

- **Tree expansion:** keeps a parent row and reveals child rows with expand/collapse controls.
- **Drill-down:** replaces the displayed level and typically provides a return path.
- **Linkage:** filters other views on the current dashboard.
- **Popup navigation:** opens a target view/dashboard with passed context.

To switch between two-level region/date and three-level region/traffic/creative trees, separate native views controlled by a supported tab/single-select can be appropriate. Preserve shared filters and sorting. Verify expand, collapse, branch order, and subtotal semantics in both modes. Do not claim a serialized drill configuration implements a plus/minus tree.

For a total-row click, remove the row's region constraint while retaining the selected region set and other filters; daily detail should then show daily totals for that scope. Never send the visible label `合计` as a country code. Do not add a visible standalone daily dashboard unless requested; an internal popup target may still be needed.

## Popup contract and publication

Treat source click configuration, target controls, and external parameters as one dependency chain. Capture their IDs and mappings alongside the source/target canvases.

- Bind the stable creative ID, not just its display name. Map selected date, region, traffic type, and applicable user scope to the target. Explain intentionally different scopes, such as UTC0 delivery facts unaffected by a game-user filter.
- In versions using `linkJump`, inspect `jumpActive`, popup type such as `newPop`, and window size. A source field may map to a target query-control field (`targetType: view`), while query values may require named `outerParams`. Names and IDs are not interchangeable.
- Jump/outer-parameter configuration can live outside `canvasViewInfo`. Save and read back those definitions too; a published canvas does not prove parameter publication.
- Some versions retain old outer parameters if they are written before a draft canvas exists. After checking for pre-existing edits, a verified sequence may be: stage the target canvas, update outer parameters with only expected writable fields, inspect the draft and parameter definitions, publish, then read the published definitions. Use the instance's observed lifecycle; do not blindly replay a full GET response into an update API.
- Test the actual entry point: a table cell, total row, or scatter circle. Confirm target control values and queried results match the selected item and context. Opening the target URL directly only tests the target.

For embedded external material pages, verify authentication, click/scroll interaction, and attachment playback in the actual popup. A saved iframe URL or API response proves none of these. If embedding is blocked, use a clearly labeled external/open-material action and state the limitation. Keep technical match/sync diagnostics in an information area rather than overwhelming the material metrics.

## Focused regression matrix

Run representative cases serially per datasource; reuse passing evidence unless a new change affects it:

| Case | Verify |
| --- | --- |
| Fresh load and reload | Visible defaults, actual request values, durable selection |
| Empty/all, single, supported multi-select, reset | Intended scope and no double quoting/type conflict |
| Non-empty and intentionally empty ranges | Results versus valid empty states, no hidden SQL error |
| Local-day region and all-region total | Each approved timezone/aggregate branch |
| Overview, daily detail, total click, creative/scatter click | Passed identifiers, visible controls, result consistency |
| Tree and sorting switches | Parent/child scope, sibling order, ties, nulls, reset behavior |

Only claim cross-dashboard filter persistence for paths actually tested. Explicit popup/link parameters do not prove arbitrary left-directory navigation preserves the last selection.
