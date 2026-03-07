# @ai-agencee/engine

[![npm](https://img.shields.io/npm/v/@ai-agencee/engine)](https://www.npmjs.com/package/@ai-agencee/engine)
[![license](https://img.shields.io/npm/l/@ai-agencee/engine)](https://github.com/binaryjack/ai-agencee/blob/main/LICENSE)

The core execution engine for **AI Agencee**. Runs multi-lane, supervised, DAG-driven AI agent workflows with pluggable LLM providers, per-USD budget caps, cross-lane barrier coordination, and a full 5-phase interactive planning system.

Used internally by [`@ai-agencee/mcp`](https://www.npmjs.com/package/@ai-agencee/mcp) and [`@ai-agencee/cli`](https://www.npmjs.com/package/@ai-agencee/cli).

---

## Installation

```bash
npm install @ai-agencee/engine
# or
pnpm add @ai-agencee/engine
```

> **Node ≥ 20** required. CommonJS module. Peer dependency: `@ai-agencee/core`.

---

## Concepts

### DAG — Directed Acyclic Graph of agent lanes

A **DAG** (`dag.json`) declares a set of parallel **lanes**, each driven by a JSON agent definition and an optional supervisor. Lanes run concurrently up to their declared dependencies. The orchestrator resolves the dependency graph, dispatches lanes, and collects results.

```
dag.json
├── lane: business-analyst   (no deps)
├── lane: architecture        (depends on: business-analyst)
├── lane: backend             (depends on: architecture)
├── lane: frontend            (depends on: architecture)
└── lane: testing             (depends on: backend, frontend)
```

### Checkpoint System

Agents are generator functions that **yield** `CheckpointPayload` objects at decision points. The engine routes each checkpoint through the supervisor and resumes the generator with a `SupervisorVerdict`.

| Checkpoint mode | Behaviour |
|----------------|-----------|
| `self` | Supervisor validates this lane's own output |
| `read-contract` | Non-blocking read of another lane's latest snapshot |
| `soft-align` | Wait up to `timeoutMs` for another lane's snapshot |
| `hard-barrier` | All named lanes must reach this point before any continues |
| `needs-human-review` | Pause and prompt the operator (when `--interactive`) |

### Verdict System

```ts
type VerdictType = 'APPROVE' | 'RETRY' | 'HANDOFF' | 'ESCALATE';
```

| Verdict | Outcome |
|---------|---------|
| `APPROVE` | Lane continues to next step |
| `RETRY` | Lane re-runs current step with corrective instructions |
| `HANDOFF` | Lane transfers context to a specialist lane |
| `ESCALATE` | Automatic resolution failed — human review required |

---

## Quick Start

### 1. Run a DAG directly

```ts
import { DagOrchestrator } from '@ai-agencee/engine';

const orchestrator = new DagOrchestrator('/path/to/project', {
  verbose: true,
  budgetCapUSD: 0.50,
});

const result = await orchestrator.run('agents/dag.json');

console.log(result.status);   // 'success' | 'partial' | 'failed'
console.log(result.costUSD);  // actual spend
```

### 2. Dry-run (validate config, no LLM calls)

```ts
const dag = await orchestrator.loadDag('agents/dag.json');
console.log(`${dag.lanes.length} lanes, ${dag.globalBarriers?.length ?? 0} barriers`);
```

### 3. Use the Plan System (5-phase interactive planning)

```ts
import { ModelRouter, PlanOrchestrator } from '@ai-agencee/engine';

const router = await ModelRouter.fromFile('agents/model-router.json');
const planner = new PlanOrchestrator(router, { projectRoot: '/path/to/project' });

const result = await planner.run({ startFrom: 'discover' });
```

---

## API

### `DagOrchestrator`

```ts
new DagOrchestrator(projectRoot: string, options?: DagRunOptions)
```

#### `DagRunOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `verbose` | `boolean` | `false` | Emit per-checkpoint log lines |
| `budgetCapUSD` | `number` | `undefined` | Abort when estimated spend exceeds this |
| `interactive` | `boolean` | `false` | Pause at `needs-human-review` checkpoints |
| `modelRouterFile` | `string` | `'agents/model-router.json'` | Path to model-router config |
| `agentsBaseDir` | `string` | DAG file's directory | Directory containing agent/supervisor JSON |
| `forceProvider` | `string` | auto-detect | Override LLM provider for all lanes: `anthropic \| openai \| vscode \| mock` |
| `samplingCallback` | `SamplingCallback` | — | VS Code MCP sampling bridge (no API keys needed) |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `loadDag(dagFile)` | `Promise<DagDefinition>` | Parse and validate a dag.json without running |
| `run(dagFile)` | `Promise<DagResult>` | Execute the full DAG |

#### `DagResult`

```ts
interface DagResult {
  dagId: string;
  status: 'success' | 'partial' | 'failed';
  costUSD: number;
  laneResults: LaneResult[];
  startedAt: string;   // ISO timestamp
  finishedAt: string;
}
```

---

### `ModelRouter`

Routes tasks to the appropriate LLM provider and model tier based on task type.

```ts
import { ModelRouter, TaskType } from '@ai-agencee/engine';

const router = await ModelRouter.fromFile('agents/model-router.json');
// or
const router = ModelRouter.fromConfig({ defaultProvider: 'anthropic', taskProfiles: {}, providers: {} });

const response = await router.route({
  taskType: 'code-generation',
  messages: [{ role: 'user', content: 'Write a TypeScript utility…' }],
});
```

#### Task → Model tier mapping

| Task type | Model tier | Suitable for |
|-----------|-----------|--------------|
| `file-analysis` | Haiku | File reading, counting, data extraction |
| `contract-extraction` | Haiku | Pulling schema/interface data from code |
| `validation` | Haiku | Applying deterministic rules |
| `code-generation` | Sonnet | Writing TypeScript/JS/CSS |
| `refactoring` | Sonnet | Restructuring existing code |
| `api-design` | Sonnet | Designing interfaces and contracts |
| `prompt-synthesis` | Sonnet | Compressing context for next agent |
| `architecture-decision` | Opus | Long-range consequence reasoning |
| `hard-barrier-resolution` | Opus | Arbitrating cross-lane conflicts |
| `security-review` | Opus | Adversarial thinking |

#### Supported providers

| Provider | Env var | Notes |
|----------|---------|-------|
| `anthropic` | `ANTHROPIC_API_KEY` | Claude Haiku / Sonnet / Opus |
| `openai` | `OPENAI_API_KEY` | GPT-4o and variants |
| `vscode` | — | VS Code Copilot via MCP sampling; no API key |
| `mock` | — | No LLM calls — for tests and CI dry-runs |

---

### Plan System

A structured 5-phase planning workflow. Each phase builds on the previous one.

```
Phase 0 — discover    BA ↔ User structured interview
Phase 1 — synthesize  BA produces plan skeleton; user approves
Phase 2 — decompose   Each agent fills in tasks (parallel)
Phase 3 — wire        Dependency graph + alignment gates resolved
Phase 4 — execute     PlanOrchestrator runs wired plan via DagOrchestrator
```

```ts
import { PlanOrchestrator, PlanPhase } from '@ai-agencee/engine';

const planner = new PlanOrchestrator(router, { projectRoot, agentsBaseDir });
const result = await planner.run({ startFrom: 'decompose' }); // resume mid-plan
```

#### `PlanResult`

```ts
interface PlanResult {
  status: 'success' | 'partial' | 'failed' | 'cancelled';
  plan?: Plan;
  dagResult?: DagResult;
}
```

---

### Cost Tracker

```ts
import { CostTracker } from '@ai-agencee/engine';

const tracker = new CostTracker({ perRun: 1.00, perLane: 0.20, currency: 'USD' });

tracker.record({ inputTokens: 1500, outputTokens: 300 }, 'sonnet', 'anthropic');
console.log(tracker.totalUSD()); // e.g. 0.012

tracker.assertBudget(); // throws BudgetExceededError if over cap
```

---

### Events

The engine emits typed events via a global event bus for monitoring and UI integration.

```ts
import { getGlobalEventBus } from '@ai-agencee/engine';

const bus = getGlobalEventBus();

bus.on('dag:start',         (e) => console.log('Run started:', e.runId));
bus.on('dag:end',           (e) => console.log('Run ended:', e.status, `$${e.costUSD}`));
bus.on('lane:start',        (e) => console.log('Lane:', e.laneId));
bus.on('lane:end',          (e) => console.log('Lane done:', e.laneId, e.status));
bus.on('llm:call',          (e) => console.log('LLM call:', e.provider, e.model));
bus.on('budget:exceeded',   (e) => console.warn('Budget cap hit:', e.spentUSD));
bus.on('checkpoint:complete',(e) => console.log('Checkpoint:', e.checkpointId, e.verdict));
bus.on('rbac:denied',       (e) => console.warn('RBAC denied:', e.principal, e.action));
```

---

### Enterprise Modules

The engine includes production-grade infrastructure available for direct use:

| Module | Import | Description |
|--------|--------|-------------|
| `AuditLog` | `@ai-agencee/engine` | Append-only structured run log |
| `CircuitBreaker` | `@ai-agencee/engine` | Prevents cascade failures across lanes |
| `RateLimiter` | `@ai-agencee/engine` | Per-provider request rate limiting |
| `RbacPolicy` | `@ai-agencee/engine` | Role-based access control for lane actions |
| `PromptInjectionDetector` | `@ai-agencee/engine` | Detects and blocks prompt injection in LLM inputs |
| `PiiScrubber` | `@ai-agencee/engine` | Redacts PII from prompts and outputs |
| `RunRegistry` | `@ai-agencee/engine` | Tracks active and historical DAG runs |
| `SqliteVectorMemory` | `@ai-agencee/engine` | Persistent vector memory for cross-run context |
| `TenantRegistry` | `@ai-agencee/engine` | Multi-tenant isolation for enterprise deployments |
| `EvalHarness` | `@ai-agencee/engine` | Regression testing of agent outputs |

---

## `dag.json` Schema

```jsonc
{
  "name": "my-workflow",
  "modelRouterFile": "agents/model-router.json",
  "lanes": [
    {
      "id": "business-analyst",
      "agentFile": "agents/01-business-analyst.agent.json",
      "supervisorFile": "agents/business-analyst.supervisor.json"
    },
    {
      "id": "backend",
      "agentFile": "agents/03-backend.agent.json",
      "supervisorFile": "agents/backend.supervisor.json",
      "dependsOn": ["business-analyst"]
    }
  ],
  "globalBarriers": [
    {
      "name": "design-complete",
      "participants": ["business-analyst", "backend"],
      "timeoutMs": 60000
    }
  ]
}
```

Full schema: [`schemas/dag.schema.json`](https://github.com/binaryjack/ai-agencee/blob/main/schemas/dag.schema.json)

---

## Related Packages

| Package | Description |
|---------|-------------|
| [`@ai-agencee/core`](https://www.npmjs.com/package/@ai-agencee/core) | File system utilities and project validation |
| [`@ai-agencee/mcp`](https://www.npmjs.com/package/@ai-agencee/mcp) | MCP server — run DAGs from AI assistants, no API keys |
| [`@ai-agencee/cli`](https://www.npmjs.com/package/@ai-agencee/cli) | CLI tool — `ai-kit agent:dag` / `agent:plan` |

---

## License

MIT — see [LICENSE](https://github.com/binaryjack/ai-agencee/blob/main/LICENSE)
