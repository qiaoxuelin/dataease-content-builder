# DataEase Content Builder

A Codex skill for safely creating and updating DataEase SQL datasets, dashboards, charts, and query filters through the DataEase OpenAPI.

## Highlights

- Resolves dataset and visualization folders independently by full path.
- Uses dry-run by default for dataset and dashboard mutations.
- Preserves SQL table IDs and unchanged field identities during dataset updates.
- Blocks undeclared field removals, type changes, dirty drafts, and dashboard view deltas.
- Encodes UTC0, country-local-day, weighted-average, maturity, ratio-total, and cross-source safety rules.
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

Plaintext HTTP is refused unless the user explicitly authorizes it for the current task and the command includes `--allow-http`.

## Helper

```powershell
node scripts/dataease_openapi.mjs --help
```

The helper supports:

- generic signed OpenAPI requests;
- SQL dataset creation and schema-safe updates;
- dashboard inspection, guarded draft updates, and guarded publication;
- representative chart queries and chart-scoped calculated-field cleanup.

See [SKILL.md](SKILL.md), [workflow.md](references/workflow.md), [dashboard-patterns.md](references/dashboard-patterns.md), and [metric-contracts.md](references/metric-contracts.md) for the complete contract.

## Security

This repository intentionally contains no DataEase host, database address, credentials, private API endpoint, project resource IDs, or user-specific filesystem paths. Keep local configuration, exported payloads, and project SQL outside the repository unless they have been reviewed for publication.
