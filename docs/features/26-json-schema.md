# JSON Schema & IDE Support

**Status**: ✅ Implemented | **Priority**: P0 | **Roadmap**: G-23  
**Related**: DAG Orchestration, Agent Types & Roles, CLI Commands

## Overview

ai-agencee ships JSON Schema definitions for all configuration files. When referenced via the `"$schema"` field, VS Code and any JSON Schema-aware editor provides **autocompletion, inline documentation, and validation** as you type — no extension required.

---

## Schema Files

| File | Covers |
|------|--------|
| `schemas/dag.schema.json` | DAG pipeline definitions (`dag.json`, `*.dag.json`) |
| `schemas/agent.schema.json` | Agent definitions (`*.agent.json`) |

Both schemas are published at:
```
https://github.com/ai-agencee/schemas/dag.schema.json
https://github.com/ai-agencee/schemas/agent.schema.json
```

---

## Enabling Autocompletion

### In a DAG file

```json
{
  "$schema": "../../schemas/dag.schema.json",
  "name": "my-pipeline",
  "budgetUSD": 0.50,
  "lanes": [
    {
      "id": "backend",
      "agentFile": "agents/03-backend.agent.json"
    }
  ]
}
```

### In an agent file

```json
{
  "$schema": "../../schemas/agent.schema.json",
  "name": "my-agent",
  "taskType": "code-generation",
  "checks": [
    {
      "id": "check-src",
      "type": "file-exists",
      "path": "src"
    }
  ]
}
```

### Using the published URL

```json
{
  "$schema": "https://github.com/ai-agencee/schemas/raw/main/dag.schema.json"
}
```

---

## What the Schema Validates

### DAG schema (`dag.schema.json`)

| Field | Validation |
|-------|-----------|
| `name` | Required string, min length 1 |
| `lanes` | Required array, min 1 item |
| `lanes[].id` | Required, unique within DAG |
| `lanes[].dependsOn` | Array of lane IDs that must complete first |
| `lanes[].agentFile` | Path to agent JSON |
| `globalBarriers[].participants` | Must be valid lane IDs |
| `budgetUSD` | Number ≥ 0 |
| `rbac.required_role` | String |

### Agent schema (`agent.schema.json`)

| Field | Validation |
|-------|-----------|
| `name` | Required |
| `checks` | Required array |
| `checks[].type` | Enum: all 11 built-in check types |
| `checks[].failSeverity` | Enum: `info`, `warning`, `error` |
| `checks[].taskType` | Enum: all 10 task types |
| `checks[].glob` | String (for `count-files`) |
| `checks[].command` | String (for `run-command`) |

---

## VS Code Settings Auto-Association

To auto-apply schemas to all matching files without adding `"$schema"` to every file, add to your `.vscode/settings.json`:

```json
{
  "json.schemas": [
    {
      "fileMatch": ["**/agents/*.dag.json", "**/agents/dag.json"],
      "url": "./schemas/dag.schema.json"
    },
    {
      "fileMatch": ["**/agents/*.agent.json"],
      "url": "./schemas/agent.schema.json"
    },
    {
      "fileMatch": ["**/agents/model-router.json"],
      "url": "./schemas/model-router.schema.json"
    }
  ]
}
```

---

## Schema-Driven Features

With the schema active, Your IDE provides:

- **Autocompletion** for all `type` values (`file-exists`, `llm-review`, etc.)
- **Hover documentation** for every field
- **Squiggles** on unknown fields or invalid values
- **Required field reminders** when you add a check without an `id`
- **Enum dropdown** for `failSeverity`, `taskType`, and provider names

---

## schema.json Reference Snippet

The DAG schema `$defs` include:

```json
"lane": {
  "type": "object",
  "required": ["id"],
  "properties": {
    "id": { "type": "string" },
    "dependsOn": { "type": "array", "items": { "type": "string" } },
    "agentFile": { "type": "string" },
    "supervisorFile": { "type": "string" },
    "retryPolicy": { "$ref": "#/$defs/retryPolicy" },
    "budgetUSD": { "type": "number", "minimum": 0 }
  }
}
```

---

## Related Features

- [DAG Orchestration](./01-dag-orchestration.md) — Validated fields in detail
- [Agent Types & Roles](./02-agent-types-roles.md) — Agent JSON structure
- [CLI Commands](./15-cli-commands.md) — `ai-kit run --dry-run` uses schema validation

---

**Last Updated**: March 7, 2026  
**Roadmap**: G-23 — JSON Schema & IDE Support  
**Implementation**: `schemas/dag.schema.json`, `schemas/agent.schema.json`
