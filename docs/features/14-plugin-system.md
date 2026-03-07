# Plugin System & Custom Checks

**Status**: ✅ Implemented | **Priority**: P2 | **Roadmap**: G-18  
**Related**: Check Handlers, DAG Orchestration

## Overview

The plugin system lets you extend the engine with **custom check types** without forking the core. A plugin is a standard Node.js package that exports a `register` function and a `manifest` object. The `CheckHandlerRegistry` discovers plugins automatically from `node_modules` or accepts manual registration.

---

## Quick Start

### 1. Create a plugin package

```
my-org-ai-kit-plugin/
  package.json
  dist/
    index.js      ← must export `register` and `manifest`
  src/
    index.ts
    my-handler.ts
```

`package.json`:

```json
{
  "name": "ai-kit-plugin-my-org",
  "version": "1.0.0",
  "main": "dist/index.js",
  "type": "commonjs"
}
```

### 2. Implement the handler

```typescript
// src/my-handler.ts
import type { ICheckHandler, RawCheckResult, CheckContext } from '@ai-agencee/engine'

export class MyOrgLintHandler implements ICheckHandler {
  readonly type = 'my-org-lint' as const

  async execute(ctx: CheckContext): Promise<RawCheckResult> {
    const path = ctx.check.path ?? '.'
    // ... your logic ...
    return { passed: true, value: 'All checks passed' }
  }
}
```

### 3. Export the plugin entry point

```typescript
// src/index.ts
import type { AiKitPluginManifest, AiKitPluginRegisterFn } from '@ai-agencee/engine'
import { MyOrgLintHandler } from './my-handler.js'

export const manifest: AiKitPluginManifest = {
  name:        'ai-kit-plugin-my-org',
  version:     '1.0.0',
  description: 'Custom lint and policy checks for my-org',
  checkTypes:  ['my-org-lint', 'my-org-policy'],
}

export const register: AiKitPluginRegisterFn = (registry) => {
  registry.register(new MyOrgLintHandler())
}
```

### 4. Use in agent JSON

```json
{
  "id": "my-lint-check",
  "type": "my-org-lint",
  "path": "src",
  "pass": "Lint passed",
  "fail": "Lint violations found"
}
```

---

## Plugin Discovery

The `CheckHandlerRegistry` scans `node_modules` for packages matching any of these patterns:

| Pattern | Example |
|---------|---------|
| `@ai-kit-plugin/<name>` | `@ai-kit-plugin/my-org` |
| `ai-kit-plugin-<name>` | `ai-kit-plugin-my-org` |
| `@<scope>/ai-kit-plugin-<name>` | `@my-org/ai-kit-plugin-lint` |

```typescript
import { CheckHandlerRegistry } from '@ai-agencee/engine'

const registry = CheckHandlerRegistry.createDefault(modelRouter)

// Auto-discover all installed plugins
const result = await registry.discover()
console.log(`Loaded ${result.loaded} plugin(s): ${result.manifests.map(m => m.name).join(', ')}`)

// Inspect errors
for (const [name, err] of Object.entries(result.errors)) {
  console.warn(`Plugin ${name} failed to load: ${err}`)
}
```

---

## Manual Registration

For internal handlers or testing, skip discovery and register directly:

```typescript
import { CheckHandlerRegistry } from '@ai-agencee/engine'

const registry = CheckHandlerRegistry.createDefault(modelRouter)
registry.register(new MyOrgLintHandler())
```

---

## API Reference

### `AiKitPluginManifest`

```typescript
interface AiKitPluginManifest {
  /** npm package name */
  name: string;
  /** SemVer version */
  version: string;
  /** Human-readable description */
  description?: string;
  /** Check type identifiers this plugin registers */
  checkTypes: string[];
}
```

### `AiKitPluginRegisterFn`

```typescript
type AiKitPluginRegisterFn = (registry: CheckHandlerRegistry) => void | Promise<void>;
```

### `PluginDiscoveryResult`

```typescript
interface PluginDiscoveryResult {
  loaded:    number;
  manifests: AiKitPluginManifest[];
  errors:    Record<string, string>;
}
```

### `ICheckHandler`

```typescript
interface ICheckHandler {
  readonly type: string;
  execute(ctx: CheckContext): Promise<RawCheckResult>;
}
```

### `CheckContext` (key fields for plugin handlers)

```typescript
interface CheckContext {
  check:       CheckDefinition;   // The check config from agent JSON
  projectRoot: string;
  modelRouter?: ModelRouter;      // Available for LLM-assisted checks
  onLlmStream?: (token: string) => void;
  retryInstructions?: string;
}
```

### `RawCheckResult`

```typescript
interface RawCheckResult {
  passed:               boolean;
  value?:               string | number;
  detail?:              { key: string; value: unknown };
  extraFindings?:       string[];
  extraRecommendations?: string[];
  earlyReturn?:         boolean;
}
```

---

## Plugin Best Practices

- **Always catch errors** — `execute()` must not throw; return `{ passed: false, value: err.message }`
- **Be idempotent** — plugins may be called multiple times on retry
- **Respect `ctx.check.path`** — always resolve relative to `ctx.projectRoot`
- **Use `ctx.modelRouter`** only when needed — avoid LLM calls in checks that can be answered deterministically
- **Declare all check types** in `manifest.checkTypes` — used for validation and IDE autocomplete

---

## Related Features

- [Check Handlers](./04-check-handlers.md) — Built-in check type reference
- [DAG Orchestration](./01-dag-orchestration.md) — How checks run in lanes
- [TypeScript DAG Builder API](./13-dag-builder-api.md) — Fluent DSL for building DAGs

---

**Last Updated**: March 7, 2026  
**Roadmap**: G-18 — Plugin System  
**Implementation**: `packages/agent-executor/src/lib/plugin-api.ts`
