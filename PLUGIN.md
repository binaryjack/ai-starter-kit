# AI-Kit Plugin API

AI-Kit has a first-class plugin system that lets you add custom check types to any DAG without forking the core packages.

## How it works

Every check type (e.g. `file-exists`, `llm-generate`, `run-command`) is handled by an `ICheckHandler` registered in the `CheckHandlerRegistry`.  
The registry's `register()` method is public, so you can add handlers at runtime.

Plugins are npm packages that export a `register` function. AI-Kit discovers them automatically at DAG startup from your project's `node_modules`.

---

## Plugin naming

AI-Kit discovers any package whose name matches one of these patterns:

| Pattern | Example |
|---------|---------|
| `@ai-kit-plugin/<name>` | `@ai-kit-plugin/terraform` |
| `ai-kit-plugin-<name>` | `ai-kit-plugin-sonar` |
| `@<scope>/ai-kit-plugin-<name>` | `@myorg/ai-kit-plugin-compliance` |

---

## Getting started

### 1. Create the package

```bash
mkdir ai-kit-plugin-my-checks
cd ai-kit-plugin-my-checks
npm init -y
```

```json
// package.json
{
  "name": "ai-kit-plugin-my-checks",
  "version": "1.0.0",
  "main": "dist/index.js",
  "peerDependencies": {
    "@ai-agencee/ai-kit-agent-executor": ">=1.0.0"
  }
}
```

### 2. Implement your handler

```typescript
// src/my-check.handler.ts
import type { ICheckHandler, RawCheckResult, CheckContext } from '@ai-agencee/ai-kit-agent-executor';

export class MyCheckHandler implements ICheckHandler {
  readonly type = 'my-org-lint' as const;

  async execute(ctx: CheckContext): Promise<RawCheckResult> {
    // ctx.projectRoot  — absolute path to the project being analysed
    // ctx.check        — the full CheckDefinition from the agent JSON
    // ctx.modelRouter  — call LLMs via ctx.modelRouter?.route(...)
    // ctx.toolExecutor — run built-in tools (read_file, run_shell, etc.)

    const result = await runMyLinter(ctx.projectRoot);
    return {
      passed:       result.issues === 0,
      value:        String(result.issues),
      extraFindings: result.findings,
    };
  }
}
```

### 3. Export `register` + `manifest`

```typescript
// src/index.ts
import type {
  AiKitPluginManifest,
  AiKitPluginRegisterFn,
  CheckHandlerRegistry,
} from '@ai-agencee/ai-kit-agent-executor';
import { MyCheckHandler } from './my-check.handler.js';

export const manifest: AiKitPluginManifest = {
  name:        'ai-kit-plugin-my-checks',
  version:     '1.0.0',
  description: 'Custom checks for my-org coding standards',
  checkTypes:  ['my-org-lint', 'my-org-security'],
};

export const register: AiKitPluginRegisterFn = (registry: CheckHandlerRegistry) => {
  registry.register(new MyCheckHandler());
};
```

### 4. Use in a DAG agent

```json
// agents/03-backend.agent.json  (excerpt)
{
  "checks": [
    {
      "id": "lint-check",
      "type": "my-org-lint",
      "description": "Enforce my-org coding standards",
      "pass": "✅ No lint violations found",
      "fail": "❌ Lint violations detected"
    }
  ]
}
```

### 5. Install and auto-discover

```bash
# In your project
npm install ai-kit-plugin-my-checks
```

AI-Kit will scan `node_modules` and load the plugin automatically when you run a DAG. No configuration required.

---

## Manual registration

If you prefer explicit control:

```typescript
import { CheckHandlerRegistry } from '@ai-agencee/ai-kit-agent-executor';
import { MyCheckHandler } from './my-check.handler.js';

const registry = CheckHandlerRegistry.createDefault(modelRouter);
registry.register(new MyCheckHandler());
```

## Programmatic discovery

```typescript
const registry = CheckHandlerRegistry.createDefault(modelRouter);

// Scan default node_modules
const report = await registry.discover();
console.log(`Loaded ${report.loaded} plugins`);

// Or specify a custom path
const report2 = await registry.discover('/path/to/node_modules');

if (Object.keys(report2.errors).length > 0) {
  console.error('Plugin load errors:', report2.errors);
}
```

---

## ICheckHandler interface

```typescript
interface ICheckHandler {
  /** Must match the `type` field in agent JSON check definitions */
  readonly type: CheckType | string;
  execute(ctx: CheckContext): Promise<RawCheckResult>;
}

interface RawCheckResult {
  passed:                boolean;
  value?:                string;
  detail?:               { key: string; value: unknown };
  extraFindings?:        string[];
  extraRecommendations?: string[];
  earlyReturn?:          boolean;
}
```

## CheckContext reference

| Field | Type | Description |
|-------|------|-------------|
| `check` | `CheckDefinition` | Full check definition from agent JSON |
| `projectRoot` | `string` | Absolute path to the project |
| `fullPath` | `string` | Resolved `check.path` within `projectRoot` |
| `retryInstructions` | `string?` | Supervisor instructions on RETRY |
| `modelRouter` | `ModelRouter?` | Route LLM calls |
| `onLlmResponse` | `fn?` | Cost tracking callback |
| `onLlmStream` | `fn?` | Streaming token callback |
| `toolExecutor` | `ToolExecutorFn?` | Run built-in tools |

---

## Publishing checklist

- [ ] Package name matches a discovery pattern
- [ ] `package.json` has `"main"` pointing to the compiled entry
- [ ] Entry exports both `register` and `manifest`
- [ ] `register` function is synchronous or returns a `Promise`
- [ ] `manifest.checkTypes` lists all type strings your handlers declare
- [ ] Peer dependency on `@ai-agencee/ai-kit-agent-executor` ≥ 1.0.0
