# CLI Commands Reference

**Status**: ✅ Implemented | **Priority**: P0 | **Roadmap**: Core  
**Related**: DAG Orchestration, MCP Integration, Multi-Tenant Isolation

## Overview

The `ai-kit` CLI is the primary interface for running DAGs, initialising projects, managing data, and interacting with the MCP server. Install it globally or use `pnpx`/`npx` for zero-install access.

```bash
npm install -g @ai-agencee/cli
# or
pnpx @ai-agencee/cli <command>
```

---

## Command Overview

| Command | Description |
|---------|-------------|
| `ai-kit init` | Scaffold config files into the current project |
| `ai-kit run <dag>` | Execute a DAG file |
| `ai-kit check <agent>` | Run a single agent file |
| `ai-kit plan` | Generate a DAG from a natural-language spec |
| `ai-kit agents` | List or inspect agent definitions |
| `ai-kit sync` | Sync agents with a remote registry |
| `ai-kit visualize` | Open the DAG visual editor |
| `ai-kit benchmark` | Benchmark model routing configurations |
| `ai-kit data:export` | Export tenant run data (GDPR Art. 20) |
| `ai-kit data:delete` | Delete tenant run data (GDPR Art. 17) |
| `ai-kit data:list-tenants` | List all known tenant IDs |
| `ai-kit code` | Index, search, and watch the codebase (Codernic / E14) |
| `ai-kit mcp` | Start the MCP server |

---

## `ai-kit init`

Scaffolds the agent configuration files into the current directory.

```bash
ai-kit init
ai-kit init --strict
```

| Flag | Description |
|------|-------------|
| `--strict` | Enable ULTRA_HIGH standards mode — copies strict rule files and sets `STRICT_MODE=1` |

Creates:
- `agents/model-router.json` — model routing config
- `agents/dag.json` — example DAG
- `.ai/` — copilot instruction files (with `--strict`)

---

## `ai-kit run`

Execute a DAG file against the current project.

```bash
ai-kit run agents/dag.json
ai-kit run agents/dag.json --project /path/to/project
ai-kit run agents/dag.json --budget 2.00
ai-kit run agents/dag.json --provider anthropic
ai-kit run agents/dag.json --dry-run
ai-kit run agents/dag.json --verbose
ai-kit run agents/dag.json --interactive
```

| Flag | Default | Description |
|------|---------|-------------|
| `--project <path>` | `cwd` | Project root to analyse |
| `--budget <USD>` | `dag.budgetUSD` | Override budget cap in USD |
| `--provider <name>` | model-router config | Force a specific LLM provider |
| `--dry-run` | false | Validate DAG structure without executing lanes |
| `--verbose` | false | Print per-check results as they complete |
| `--interactive` | false | Pause at `needs-human-review` gates for operator input |

### Dry-run output example

```
✅ DAG validated: "full-review"
   3 lane(s):
     • backend (after: architecture) 🔍
     • frontend
     • testing 🔍
   1 global barrier(s):
     ⏸  quality-gate [backend, frontend] timeout=30000ms

  (dry-run — no lanes executed)
```

---

## `ai-kit check`

Run a single agent file (outside a DAG context).

```bash
ai-kit check agents/03-backend.agent.json
ai-kit check agents/03-backend.agent.json --project ./my-app
ai-kit check agents/03-backend.agent.json --verbose
```

---

## `ai-kit plan`

Generate a DAG JSON from a natural-language project description.

```bash
ai-kit plan "Build a REST API with auth, PostgreSQL, and Stripe integration"
ai-kit plan "Add dark mode to existing React app" --out agents/dark-mode.dag.json
```

| Flag | Description |
|------|-------------|
| `--out <path>` | Write generated DAG to this file (default: stdout) |
| `--provider <name>` | LLM provider to use for planning |

---

## `ai-kit agents`

List and inspect agent definitions.

```bash
ai-kit agents list
ai-kit agents show agents/03-backend.agent.json
```

---

## `ai-kit visualize`

Open the interactive DAG visual editor in the browser.

```bash
ai-kit visualize
ai-kit visualize --dag agents/dag.json
ai-kit visualize --port 3333
```

Starts a local server and opens the [DAG Editor](./13-dag-builder-api.md) UI.

---

## `ai-kit benchmark`

Compare model routing configurations by running a DAG multiple times with different provider settings.

```bash
ai-kit benchmark agents/dag.json --runs 3
ai-kit benchmark agents/dag.json --providers anthropic,openai --runs 5
```

Outputs a table of cost, latency, and verdict statistics per provider.

---

## Data Commands (GDPR)

### `ai-kit data:export`

Export all run data for a tenant (GDPR Art. 20 — Data Portability).

```bash
ai-kit data:export --dest ./exports/acme
ai-kit data:export --tenant acme-corp --dest ./exports/acme
```

| Flag | Description |
|------|-------------|
| `--tenant <id>` | Tenant ID (default: `AIKIT_TENANT_ID` env or `"default"`) |
| `--dest <dir>` | Destination directory for exported data |

Writes a `export-manifest.json` receipt to `--dest`.

### `ai-kit data:delete`

Permanently delete all run data for a tenant (GDPR Art. 17 — Right to Erasure).

```bash
ai-kit data:delete --tenant acme-corp --confirm
```

| Flag | Description |
|------|-------------|
| `--tenant <id>` | Tenant ID to purge |
| `--confirm` | Required safety flag — prevents accidental deletion |

### `ai-kit data:list-tenants`

List all known tenant IDs stored in `.agents/tenants/`.

```bash
ai-kit data:list-tenants
# → default
# → acme-corp
# → beta-org
```

---

## `ai-kit code`

Codbase indexing, search, and watch commands powered by the Codernic (E14) module.  
See [Feature 28: Codernic (E14)](./28-code-assistant.md) for full API and architecture details.

### `ai-kit code index`

Index (or incrementally re-index) the current project into a local SQLite store.

```bash
ai-kit code index
ai-kit code index --project /path/to/project
ai-kit code index --full              # force full re-index (skip incremental)
ai-kit code index --push              # upload index to cloud dashboard
```

| Flag | Description |
|------|-------------|
| `--project <path>` | Root of the project to index (default: `cwd`) |
| `--full` | Discard existing index and rebuild from scratch |
| `--push` | Sync the local index to the cloud dashboard |

### `ai-kit code search <term>`

Search the index for symbols, files, or cross-references.

```bash
ai-kit code search AuthService
ai-kit code search "createUser" --semantic
ai-kit code search "@ai-agencee/engine" --type import
```

| Flag | Description |
|------|-------------|
| `--semantic` | Use vector embeddings for semantic (meaning-based) search |
| `--type <kind>` | Filter by symbol type: `symbol`, `file`, `import` |
| `--limit <n>` | Maximum number of results (default: `20`) |

### `ai-kit code stats`

Print a health summary of the current index.

```bash
ai-kit code stats
```

Outputs file count, symbol count, dependency count, index size, and last-updated timestamp.

### `ai-kit code watch`

Continuously re-index on file changes (useful during active development).

```bash
ai-kit code watch
ai-kit code watch --project /path/to/project
```

Uses native file-system events — no polling. Press `Ctrl+C` to stop.

---

## `ai-kit mcp`

Start the MCP server for Claude Desktop or VS Code integration.

```bash
ai-kit mcp
```

See [MCP Integration](./16-mcp-integration.md) for full configuration.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AIKIT_TENANT_ID` | Default tenant ID for all commands |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry endpoint for tracing |
| `STRICT_MODE` | Enable ULTRA_HIGH coding standards (e.g. `STRICT_MODE=1`) |

---

## Related Features

- [DAG Orchestration](./01-dag-orchestration.md) — DAG file format
- [MCP Integration](./16-mcp-integration.md) — `ai-kit mcp` details
- [Multi-Tenant Isolation](./11-multi-tenant.md) — `data:` commands detail
- [JSON Schema & IDE Support](./26-json-schema.md) — Autocompletion for DAG/agent files

---

**Last Updated**: March 7, 2026  
**Roadmap**: Core  
**Implementation**: `packages/cli/src/commands/`
