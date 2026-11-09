# DataEase Content Builder

A Codex skill for safely creating and updating DataEase SQL datasets, dashboards, charts, and query filters through the DataEase OpenAPI.

## Highlights

- Resolves dataset and visualization folders independently by full path.
- Uses dry-run by default for dataset and dashboard mutations.
- Preserves SQL table IDs and unchanged field identities during dataset updates.
- Guards undeclared field removals, type changes, and dashboard view deltas; also requires inspecting draft content changes that keep the same view IDs.
- Makes reporting-day aggregation, lifecycle numbering, IAP/IAA units, attribution, maturity modes, and ratio totals explicit without replacing approved project conventions.
- Covers numeric and tree sorting, filter parameter types, popup context, frozen summaries, and browser-visible interaction checks.
- Traces material-library matching, multi-value tags, scheduled imports, and downstream freshness separately.
- Detects datasource connection-pool exhaustion and stops unchanged retries.
- Separates draft verification, publication, API/query evidence, and browser-visible verification.

## Install

Clone the repository into the Codex skills directory:

```powershell
git clone https://github.com/qiaoxuelin/dataease-content-builder.git "$env:USERPROFILE\.codex\skills\dataease-content-builder"
```

Then invoke it in Codex with:

```text
Use $dataease-content-builder to create or update my DataEase dashboard.
```

Natural-language DataEase dashboard requests can also activate the skill automatically.

## Local configuration

Keep credentials in a project-local file that is never committed:

```text
Access Key: <access-key>
Secret Key: <secret-key>
API 地址: https://dataease.example.com
```

Plaintext HTTP is refused unless the user authorizes it for the target instance and scope in the current task and the command includes `--allow-http`.

## Helper

```powershell
node scripts/dataease_openapi.mjs --help
```

The helper supports:

- generic signed OpenAPI requests;
- SQL dataset creation and schema-safe updates;
- dashboard inspection, read-only structural/format/layout lint, guarded draft updates, and guarded publication;
- representative chart queries and chart-scoped calculated-field cleanup.

Start with [SKILL.md](SKILL.md). Supporting references cover [workflow and publication](references/workflow.md), [layout and sorting](references/dashboard-patterns.md), [metric contracts](references/metric-contracts.md), [filters and popups](references/interactions.md), and [material matching and refresh](references/data-freshness.md).

## Security

This repository intentionally contains no DataEase host, database address, credentials, private API endpoint, project resource IDs, or user-specific filesystem paths. Keep local configuration, exported payloads, and project SQL outside the repository unless they have been reviewed for publication.
