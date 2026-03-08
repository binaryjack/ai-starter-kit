# MCP Integration

**Status**: ✅ Implemented | **Priority**: P0 | **Roadmap**: Core  
**Related**: CLI Commands, Agent Types & Roles

## Overview

The **Model Context Protocol (MCP)** integration exposes the engine's capabilities as tools that AI assistants (Claude Desktop, VS Code Copilot, Cursor) can invoke directly. Once configured, your AI assistant can run DAGs, check project health, browse agent definitions, and apply coding standards — all from a chat interface.

---

## Quick Start

### Claude Desktop

Add to `~/.config/Claude/claude_desktop_config.json` (macOS/Linux) or  
`%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "ai-agencee": {
      "command": "npx",
      "args": ["@ai-agencee/mcp"]
    }
  }
}
```

Restart Claude Desktop. You'll see the ai-agencee tools appear in the tool picker.

### VS Code (via `ai-kit mcp`)

```bash
ai-kit mcp
```

Then add the MCP server URL to your VS Code `settings.json`:

```json
{
  "mcp.servers": {
    "ai-agencee": {
      "command": "npx",
      "args": ["@ai-agencee/mcp"]
    }
  }
}
```

---

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `@init` | Initialise an AI session with OWNER/ULTRA_HIGH standards |
| `@check` | Validate the current project structure against agent checks |
| `@rules` | Display the active coding rules and standards |
| `@patterns` | Browse recommended design patterns |
| `@bootstrap` | View setup instructions for a fresh project |

### `@init`

Sets up session context with the active agent standards. Equivalent to running `ai-kit init` and loading the instruction files into context. Call this at the start of any AI-assisted development session.

### `@check`

Runs the default check agent against the current project root and returns a structured report:

```
✅ src/ exists (5 subdirectories)
✅ package.json has scripts.test
⚠️  No OpenTelemetry instrumentation found
❌ Missing src/routes — API layer not scaffolded
```

### `@rules`

Returns the full set of active coding rules from `.ai/copilot-instructions.md` and `.ai/STANDARDS.md`.

### `@patterns`

Returns recommended patterns for the current tech stack (TypeScript, React, Node.js).

### `@bootstrap`

Returns the project setup checklist appropriate for the current project type (monorepo, standalone, etc.).

---

## MCP Package

The MCP server lives in `packages/mcp`. Install standalone:

```bash
npm install -g @ai-agencee/mcp
# or run without installing:
npx @ai-agencee/mcp
```

---

## Configuration

The MCP package reads from `agents/model-router.json` when present in the project root. This means the same provider configuration used for DAG runs also applies to MCP tool calls.

```json
{
  "defaultProvider": "anthropic",
  "tiers": {
    "haiku":  { "provider": "anthropic", "model": "claude-haiku-3-5" },
    "sonnet": { "provider": "anthropic", "model": "claude-sonnet-3-7" },
    "opus":   { "provider": "anthropic", "model": "claude-opus-4" }
  }
}
```

---

## Using MCP in CI

MCP tools can be invoked programmatically via the `@ai-agencee/mcp` package's exported functions:

```typescript
import { runCheck } from '@ai-agencee/mcp'

const report = await runCheck({ projectRoot: process.cwd() })
if (report.errors.length > 0) {
  process.exit(1)
}
```

---

## Related Features

- [CLI Commands](./15-cli-commands.md) — `ai-kit mcp` command
- [Agent Types & Roles](./02-agent-types-roles.md) — Agents used by `@check`
- [JSON Schema & IDE Support](./26-json-schema.md) — IDE autocompletion
- [Provider Configuration](./23-provider-config.md) — Model routing setup

---

**Last Updated**: March 7, 2026  
**Roadmap**: Core  
**Implementation**: `packages/mcp/`
