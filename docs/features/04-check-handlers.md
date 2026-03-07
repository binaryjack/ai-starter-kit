# Check Handlers & Validators

**Status**: ✅ Implemented | **Priority**: P0 | **Roadmap**: Core  
**Related**: Agent Types & Roles, DAG Orchestration, Plugin System

## Overview

A **check** is the atomic unit of work in a DAG lane. Each check has a `type` that determines which handler executes it. The engine ships **11 built-in check types** covering filesystem inspection, shell execution, and LLM reasoning — and any number of custom types can be added via plugins.

---

## Built-in Check Types

| Type | Category | Description |
|------|----------|-------------|
| `file-exists` | Filesystem | Does a file or directory exist at `path`? |
| `dir-exists` | Filesystem | Does a directory exist at `path`? |
| `count-files` | Filesystem | Count files matching a glob pattern |
| `count-dirs` | Filesystem | Count subdirectories in `path` |
| `json-field` | Filesystem | Read a dot-notation field from a JSON file |
| `json-has-key` | Filesystem | Check a JSON file has a specific dot-notation key |
| `grep` | Filesystem | Does any file in `path` match `pattern`? |
| `run-command` | Shell | Run a shell command and inspect exit code / output |
| `llm-generate` | LLM | Generate content via LLM; store result under `outputKey` |
| `llm-review` | LLM | Review a file/directory via LLM and report findings |
| `llm-tool` | LLM | LLM generation with full built-in tool-use loop |

---

## Common Fields

All check types share these fields:

```typescript
interface CheckDefinition {
  id:                  string;           // Unique within the agent
  type:                CheckType;
  path?:               string;           // File/dir path (relative to projectRoot)
  pass?:               string;           // Message when check passes (supports {value}, {count})
  fail?:               string;           // Message when check fails
  failSeverity?:       'info' | 'warning' | 'error';  // Default: 'info'
  recommendations?:    string[];         // Always appended
  failRecommendations?: string[];        // Appended only on failure
  passRecommendations?: string[];        // Appended only on success
}
```

---

## Filesystem Checks

### `file-exists` / `dir-exists`

```json
{
  "id": "check-src",
  "type": "file-exists",
  "path": "src/index.ts",
  "pass": "Entry point present",
  "fail": "src/index.ts is missing",
  "failSeverity": "error"
}
```

### `count-files`

```json
{
  "id": "count-tests",
  "type": "count-files",
  "path": "src",
  "glob": "**/*.test.ts",
  "pass": "Found {count} test file(s)",
  "fail": "No test files found"
}
```

### `count-dirs`

```json
{
  "id": "count-routes",
  "type": "count-dirs",
  "path": "src/routes",
  "pass": "Found {count} route director(ies)",
  "fail": "No route directories found"
}
```

### `json-field`

```json
{
  "id": "check-engine-field",
  "type": "json-field",
  "path": "package.json",
  "field": "engines.node",
  "pass": "Node engine set to {value}",
  "fail": "engines.node not specified in package.json"
}
```

### `json-has-key`

```json
{
  "id": "check-scripts",
  "type": "json-has-key",
  "path": "package.json",
  "key": "scripts.test",
  "pass": "test script present",
  "fail": "Missing scripts.test in package.json"
}
```

### `grep`

```json
{
  "id": "no-console",
  "type": "grep",
  "path": "src",
  "pattern": "console\\.log",
  "pass": "No stray console.log calls",
  "fail": "console.log found in src — remove before release",
  "failSeverity": "warning"
}
```

---

## Shell Check

### `run-command`

```json
{
  "id": "type-check",
  "type": "run-command",
  "command": "pnpm tsc --noEmit",
  "pass": "TypeScript type check passed",
  "fail": "TypeScript errors found",
  "failSeverity": "error"
}
```

With output pattern matching:

```json
{
  "id": "tests-pass",
  "type": "run-command",
  "command": "pnpm test --reporter=json",
  "passPattern": "\"passed\":\\s*[1-9]",
  "failPattern": "\"failed\":\\s*[1-9]",
  "pass": "Tests passed",
  "fail": "Test suite has failures"
}
```

Additional fields:

| Field | Description |
|-------|-------------|
| `command` | Shell command (cwd = projectRoot, timeout = 30 s) |
| `passPattern` | Regex applied to stdout+stderr — check passes when it matches |
| `failPattern` | Regex applied to stdout+stderr — check passes when it does NOT match |

---

## LLM Checks

### `llm-review`

Sends a prompt about `path` to the LLM and reports findings.

```json
{
  "id": "api-review",
  "type": "llm-review",
  "path": "src/routes",
  "taskType": "code-generation",
  "prompt": "Review these API routes for REST conventions and error handling. Return a bullet list of specific issues.",
  "pass": "API routes reviewed",
  "fail": "API review failed"
}
```

### `llm-generate`

Generates text and stores it under `outputKey` for downstream lanes.

```json
{
  "id": "write-summary",
  "type": "llm-generate",
  "taskType": "prompt-synthesis",
  "outputKey": "project_summary",
  "prompt": "Summarise the project in 3 sentences. Path: {path}",
  "path": "src"
}
```

The generated value is available to later lanes via `ctx.detail["project_summary"]`.

### `llm-tool`

Like `llm-generate` but gives the LLM access to the built-in tool set (`read_file`, `list_dir`, `grep_files`) for multi-step exploration.

```json
{
  "id": "deep-review",
  "type": "llm-tool",
  "taskType": "security-review",
  "prompt": "Explore the src directory and identify all hardcoded credentials or insecure patterns.",
  "pass": "Deep security scan complete",
  "fail": "Security tool scan failed"
}
```

### LLM-specific fields

| Field | Applies to | Description |
|-------|-----------|-------------|
| `taskType` | All LLM | `TaskType` — determines model tier |
| `prompt` | All LLM | Prompt template (supports `{path}`, `{retryContext}`) |
| `outputKey` | `llm-generate` | Key to store generated content |
| `model` | All LLM | Override model family: `'haiku'`, `'sonnet'`, `'opus'` |

---

## Result Severity

| `failSeverity` | Effect |
|----------------|--------|
| `'info'` (default) | Failure is reported but does not block the lane |
| `'warning'` | Reported with ⚠️ prefix; lane can still pass |
| `'error'` | Lane is marked failed; downstream dependent lanes are skipped |

---

## Custom Check Handlers (Plugins)

To add a custom check type, implement `ICheckHandler` and register it via a plugin:

```typescript
import type { ICheckHandler, RawCheckResult, CheckContext } from '@ai-agencee/engine'

export class MyCustomHandler implements ICheckHandler {
  readonly type = 'my-custom-check' as const

  async execute(ctx: CheckContext): Promise<RawCheckResult> {
    const result = await doMyCheck(ctx.check.path ?? '')
    return {
      passed: result.ok,
      value:  result.detail,
    }
  }
}
```

See [Plugin System](./14-plugin-system.md) for the full registration flow.

---

## Related Features

- [Agent Types & Roles](./02-agent-types-roles.md) — Agent JSON structure using checks
- [Plugin System](./14-plugin-system.md) — Registering custom check types
- [DAG Orchestration](./01-dag-orchestration.md) — How checks are sequenced in lanes
- [Streaming Output](./05-streaming-output.md) — Live token output from LLM checks

---

**Last Updated**: March 7, 2026  
**Roadmap**: Core  
**Implementation**: `packages/agent-executor/src/lib/checks/`
