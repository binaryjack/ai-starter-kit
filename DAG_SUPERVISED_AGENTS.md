# Multi-Lane Supervised Agent DAG — Implementation Specification

> **Status:** Design finalized — Phase 0 implemented, Phases 1-7 pending  
> **Version:** 1.1  
> **Date:** March 4, 2026  
> **Builds on:** existing `JsonAgentStrategy` + `AgentChainExecutor` in `packages/agent-executor`

---

## Table of Contents

0. [Model Routing Layer (Phase 0)](#0-model-routing-layer-phase-0)
1. [Problem Statement](#1-problem-statement)
2. [Architecture Overview](#2-architecture-overview)
3. [Core Concepts](#3-core-concepts)
4. [Checkpoint Taxonomy](#4-checkpoint-taxonomy)
5. [Data Contracts](#5-data-contracts)
6. [New Files to Create](#6-new-files-to-create)
7. [Files to Modify](#7-files-to-modify)
8. [JSON Configuration Schema](#8-json-configuration-schema)
9. [Implementation Phases](#9-implementation-phases)
10. [Execution Flow Walkthrough](#10-execution-flow-walkthrough)
11. [Edge Cases & Invariants](#11-edge-cases--invariants)
12. [Testing Strategy](#12-testing-strategy)
13. [CLI Integration](#13-cli-integration)

---

## 0. Model Routing Layer (Phase 0)

> ✅ **IMPLEMENTED** — all files created, `pnpm build` passing.

### 0.1 Why Model Routing?

Every agent framework sends everything to the same model. That is economically broken at scale.
The formula for a killer app is:

```
Right Model × Right Prompt × Right Context = Minimum Cost + Maximum Quality
```

### 0.2 Task → Model Family Matrix

| Task Type | Model Family | Reason |
|---|---|---|
| `file-analysis`, `contract-extraction`, `validation` | **Haiku** | Pattern recognition, no deep reasoning needed |
| `code-generation`, `refactoring`, `api-design`, `prompt-synthesis` | **Sonnet** | Best code quality / cost ratio |
| `architecture-decision`, `hard-barrier-resolution`, `security-review` | **Opus** | Long-range consequences, adversarial thinking |

### 0.3 Provider Hierarchy

```
Runtime context        Provider selected
─────────────────────  ─────────────────────────────────────────────
VS Code + MCP          VSCodeSamplingProvider  (no API key, uses user's Copilot)
CLI + ANTHROPIC_API_KEY  AnthropicProvider      (direct API, metered billing)
CLI + OPENAI_API_KEY     OpenAIProvider         (direct API, metered billing)
Test environment       MockProvider             (zero cost, deterministic)
```

**VS Code Sampling** is the killer feature: routes through `server.createMessage()` in the MCP
protocol — no API keys, no config, uses whatever model the user has in VS Code.

### 0.4 Files Created (Phase 0)

```
packages/agent-executor/src/lib/
├── llm-provider.ts       ✅  LLMProvider interface + Anthropic, OpenAI, VSCodeSampling, Mock
├── model-router.ts       ✅  Task-type → family → model ID routing + cost estimation
├── prompt-registry.ts    ✅  Loads *.prompt.md with frontmatter, resolves by agent+family
└── cost-tracker.ts       ✅  Token counting, budget enforcement, per-run cost report

packages/mcp/src/
└── vscode-lm-bridge.ts   ✅  createVSCodeSamplingBridge(server) → SamplingCallback

agents/
├── model-router.json     ✅  Declarative task→family→provider config + budget caps
└── prompts/
    ├── file-analysis.haiku.prompt.md         ✅
    ├── backend-agent.sonnet.prompt.md        ✅
    ├── frontend-agent.sonnet.prompt.md       ✅
    ├── supervisor.opus.prompt.md             ✅
    └── architecture-decision.opus.prompt.md ✅
```

### 0.5 Cost Visibility (unique feature)

Every DAG run produces a cost breakdown no other tool provides:

```
💰 Cost Report — Run abc-123
   Total: $0.00231 USD  (1,240 in / 380 out tokens)

   By lane:
     sql-lane             $0.00080  (2 calls)
     react-lane           $0.00051  (1 call)
     backend-lane         $0.00100  (3 calls)

   By task type:
     file-analysis             $0.00031  (4 calls)   ← Haiku
     code-generation           $0.00180  (2 calls)   ← Sonnet
     hard-barrier-resolution   $0.00020  (1 call)    ← Opus
```

Users optimize their DAGs based on this data. Budget caps auto-abort runs that exceed limits.

### 0.6 Fully Declarative (no TypeScript to add new models/providers)

```json
// agents/model-router.json — add a new provider: zero TypeScript
{
  "providers": {
    "ollama": {
      "models": { "haiku": "llama3.2", "sonnet": "codestral", "opus": "deepseek-r1" },
      "costs":  { "inputPerMillion": 0, "outputPerMillion": 0 }
    }
  }
}
```

```markdown
<!-- agents/prompts/my-agent.sonnet.prompt.md — add a new prompt: zero TypeScript -->
---
agent: my-agent
modelFamily: sonnet
task: code-generation
---
You are ...
```

---

## 1. Problem Statement

Current state: `AgentChainExecutor` runs agents **sequentially**, collecting results post-mortem.
The Supervisor only reads dead results — it cannot influence execution.

Required state: A **multi-lane parallel execution model** where:
- Each lane runs its agent independently with an **intra-lane supervisor** (Saga quality gate)
- Agents can emit **cross-lane alignment requests** (rendezvous) without blocking other lanes
- A **global barrier** can synchronize N lanes before any continues (hard contract alignment)
- All agreed interfaces are published to a **Contract Registry** (live shared truth)
- A **Barrier Coordinator** resolves all three checkpoint modes
- Everything is **declaratively configured in JSON** — no TypeScript needed to add lanes, checkpoints, or rules

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        DAG ORCHESTRATOR                               │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  PHASE 0 — MODEL ROUTING LAYER                                 │  │
│  │  ModelRouter → PromptRegistry → CostTracker → LLMProvider     │  │
│  │  (Haiku / Sonnet / Opus) × (Anthropic / OpenAI / VSCode / Mock)│  │
│  └────────────────────────────┬───────────────────────────────────┘  │
│                               │ every LLM call routes through here   │
│  Reads dag.json ──► spawns lanes ──► drives to completion            │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │   SQL Lane   │  │  React Lane  │  │Backend Lane  │               │
│  │              │  │              │  │              │               │
│  │ [SQL Agent]  │  │[React Agent] │  │[Backend Agent│               │
│  │     ↕        │  │     ↕        │  │     ↕        │               │
│  │[SQL Supv.]   │  │[React Supv.] │  │[Bknd Supv.]  │               │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │
│         │                 │                  │                       │
│  ┌──────▼─────────────────▼──────────────────▼───────────────────┐  │
│  │                   CONTRACT REGISTRY                            │  │
│  │  (versioned live snapshots — every lane reads and writes here) │  │
│  └─────────────────────────────────┬──────────────────────────────┘  │
│                                    │                                 │
│  ┌─────────────────────────────────▼──────────────────────────────┐  │
│  │                  BARRIER COORDINATOR                           │  │
│  │  Resolves: self | read-contract | soft-align | hard-barrier    │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Concepts

### 3.1 Lane
A lane is a **named execution unit** containing one agent + one supervisor.
Lanes run in parallel (managed by `Promise.allSettled`).
Each lane has its own **checkpoint stream** (AsyncGenerator).

### 3.2 Checkpoint
A point during agent execution where the agent **yields its current partial state**.
The executor intercepts the yield, routes it to the correct resolver, then resumes the generator.

### 3.3 Supervisor Verdict
When a supervisor evaluates a checkpoint it returns one of four verdicts:

| Verdict    | Effect                                                        |
|------------|---------------------------------------------------------------|
| `APPROVE`  | Generator resumes normally                                   |
| `RETRY`    | Generator receives corrective instructions, reruns last step |
| `HANDOFF`  | Specialist agent takes over a sub-context                    |
| `ESCALATE` | Lane aborts, reason recorded, DAG marks lane as failed       |

A **retry budget** (default: 3) prevents infinite retry loops. Exhausted budget → auto-escalate.

### 3.4 Contract Snapshot
What a lane publishes to the Contract Registry at each checkpoint.
Other lanes can read a snapshot **without blocking** the publisher.

```typescript
interface ContractSnapshot {
  laneId: string;
  version: number;           // bumps on every publish
  timestamp: string;
  exports: {
    apiRoutes?:     RouteContract[];
    dbSchema?:      TableContract[];
    components?:    ComponentContract[];
    errorTypes?:    ErrorContract[];
    eventTypes?:    EventContract[];
    // extensible — add new export types without code changes
  };
  pending: string[];         // what this lane still needs from others
}
```

### 3.5 Barrier Coordinator
Receives **rendezvous requests** from agents.
Decides whether to resolve immediately (non-blocking) or wait.
Never lets one lane starve another indefinitely — soft-align has a configurable timeout.

### 3.6 Capability Registry
Maps capability names to the agents that can fulfill them.
Used by the Supervisor to route `HANDOFF` verdicts.

```json
{
  "validate-sql-schema": ["sql-agent", "db-specialist-agent"],
  "validate-react-component": ["react-agent", "storybook-agent"],
  "validate-error-contract": ["backend-agent", "error-specialist-agent"]
}
```

---

## 4. Checkpoint Taxonomy

```typescript
type CheckpointMode =
  | 'self'           // Intra-lane: supervisor validates this lane's own output
  | 'read-contract'  // Cross-lane: read another lane's current snapshot (non-blocking)
  | 'soft-align'     // Cross-lane: wait up to timeoutMs for compatible version, then proceed
  | 'hard-barrier'   // Global: ALL named lanes must reach this point before any continues
```

### Decision tree

```
Is this checkpoint only about my own output?
  YES → 'self'
  NO  → Does it depend on another lane's state?
          YES → Do I NEED their exact agreed contract before I can continue?
                  YES → Do ALL named lanes need to meet here?
                          YES → 'hard-barrier'
                          NO  → 'soft-align' (with timeout)
                  NO  → 'read-contract' (take best-available snapshot)
```

### Real-world mapping

| Scenario | Mode |
|---|---|
| SQL supervisor validates a query optimization | `self` |
| React supervisor validates atomic design structure | `self` |
| Backend reads SQL error types to build error manager | `soft-align` |
| Backend reads React error boundary props | `soft-align` |
| All lanes agree on API contract before any writes code | `hard-barrier` |
| Backend publishes error shape so React can consume | `read-contract` |

---

## 5. Data Contracts

### 5.1 New TypeScript interfaces
> File: `packages/agent-executor/src/lib/dag-types.ts`

```typescript
// ─── Verdict ────────────────────────────────────────────────────────────────
type VerdictType = 'APPROVE' | 'RETRY' | 'HANDOFF' | 'ESCALATE';

interface SupervisorVerdict {
  type: VerdictType;
  instructions?: string;    // RETRY: corrective instructions passed back to agent
  targetLaneId?: string;    // HANDOFF: which specialist takes over
  handoffContext?: unknown;  // HANDOFF: sub-context to pass to specialist
  reason?: string;           // ESCALATE: why it failed
  evidence?: unknown;        // ESCALATE: what the supervisor found wrong
}

// ─── Checkpoint ─────────────────────────────────────────────────────────────
interface CheckpointPayload {
  checkpointId: string;       // unique within the lane e.g. "step-2-sql-schema"
  mode: CheckpointMode;
  stepIndex: number;
  partialResult: Partial<AgentResult>;
  contracts?: ContractSnapshot;   // what this lane is publishing
  waitFor?: string[];              // lane IDs needed for soft-align / hard-barrier
  timeoutMs?: number;              // soft-align: max wait before using best-available
}

// ─── Contract Registry ───────────────────────────────────────────────────────
interface ContractRegistry {
  getSnapshot(laneId: string): ContractSnapshot | undefined;
  publish(laneId: string, snapshot: ContractSnapshot): void;
  getVersion(laneId: string): number;
  waitForVersion(laneId: string, minVersion: number, timeoutMs: number): Promise<ContractSnapshot | null>;
  getAll(): Map<string, ContractSnapshot>;
}

// ─── Lane Definition ─────────────────────────────────────────────────────────
interface LaneDefinition {
  id: string;
  agentFile: string;           // path to *.agent.json
  supervisorFile: string;      // path to *.supervisor.json
  dependsOn?: string[];        // lane IDs that must start before this lane
  capabilities?: string[];     // what this lane can handle for handoffs
}

// ─── DAG Definition ──────────────────────────────────────────────────────────
interface DagDefinition {
  name: string;
  description: string;
  lanes: LaneDefinition[];
  globalBarriers?: GlobalBarrier[];  // named global sync points
  capabilityRegistry?: Record<string, string[]>;
}

interface GlobalBarrier {
  name: string;
  participants: string[];   // lane IDs that must all reach this barrier
  timeoutMs: number;
}

// ─── Supervised Generator Protocol ───────────────────────────────────────────
// An agent implementing this protocol yields CheckpointPayload objects
type SupervisedAgent = AsyncGenerator<CheckpointPayload, AgentResult, SupervisorVerdict>;
```

### 5.2 Supervisor configuration schema
> File: `agents/*.supervisor.json`

```json
{
  "laneId": "sql",
  "retryBudget": 3,
  "checkpoints": [
    {
      "checkpointId": "step-1-query-structure",
      "mode": "self",
      "expect": {
        "minFindings": 2,
        "maxErrorSeverity": "warning",
        "requiredKeys": ["queryCount"]
      },
      "onFail": "RETRY",
      "retryInstructions": "Re-analyze query structure focusing on index usage"
    },
    {
      "checkpointId": "step-2-schema-alignment",
      "mode": "soft-align",
      "waitFor": ["backend"],
      "timeoutMs": 5000,
      "expect": {
        "contractFields": ["errorTypes"]
      },
      "onFail": "APPROVE",
      "fallback": "proceed-with-snapshot"
    }
  ]
}
```

### 5.3 DAG configuration schema
> File: `agents/dag.json`

```json
{
  "name": "Full Stack Analysis DAG",
  "description": "Parallel multi-lane analysis with cross-lane contract alignment",
  "lanes": [
    {
      "id": "sql",
      "agentFile": "agents/03-backend.agent.json",
      "supervisorFile": "agents/sql.supervisor.json",
      "capabilities": ["validate-sql-schema", "validate-query-performance"]
    },
    {
      "id": "react",
      "agentFile": "agents/04-frontend.agent.json",
      "supervisorFile": "agents/react.supervisor.json",
      "capabilities": ["validate-react-component", "validate-atomic-design"]
    },
    {
      "id": "backend",
      "agentFile": "agents/03-backend.agent.json",
      "supervisorFile": "agents/backend.supervisor.json",
      "dependsOn": [],
      "capabilities": ["validate-error-contract", "validate-api-routes"]
    }
  ],
  "globalBarriers": [
    {
      "name": "api-contract-alignment",
      "participants": ["sql", "backend", "react"],
      "timeoutMs": 10000
    }
  ],
  "capabilityRegistry": {
    "validate-sql-schema": ["sql"],
    "validate-react-component": ["react"],
    "validate-error-contract": ["backend", "sql"]
  }
}
```

---

## 6. New Files to Create

```
packages/agent-executor/src/lib/
├── llm-provider.ts       ✅ DONE  LLMProvider interface + 4 implementations
├── model-router.ts       ✅ DONE  Task-type routing + cost estimation
├── prompt-registry.ts    ✅ DONE  *.prompt.md loader with frontmatter parser
├── cost-tracker.ts       ✅ DONE  Token counting, budget, run summary
├── dag-types.ts          ⏳ P1    All DAG TypeScript interfaces
├── contract-registry.ts  ⏳ P1    Versioned live contract snapshots
├── barrier-coordinator.ts ⏳ P2   Resolves all 4 checkpoint modes
├── intra-supervisor.ts   ⏳ P3    RETRY/HANDOFF/ESCALATE verdict logic
├── supervised-agent.ts   ⏳ P4    AsyncGenerator protocol adapter
├── lane-executor.ts      ⏳ P4    Drives one lane, calls supervisor
└── dag-orchestrator.ts   ⏳ P5    Top-level: loads dag.json, spawns lanes

packages/mcp/src/
└── vscode-lm-bridge.ts   ✅ DONE  MCP sampling → SamplingCallback bridge

agents/
├── model-router.json     ✅ DONE  Declarative model routing config
├── dag.json              ⏳ P7    DAG wiring configuration
├── sql.supervisor.json   ⏳ P7    SQL lane supervisor rules
├── react.supervisor.json ⏳ P7    React lane supervisor rules
├── backend.supervisor.json ⏳ P7  Backend lane supervisor rules
└── prompts/
    ├── file-analysis.haiku.prompt.md         ✅ DONE
    ├── backend-agent.sonnet.prompt.md        ✅ DONE
    ├── frontend-agent.sonnet.prompt.md       ✅ DONE
    ├── supervisor.opus.prompt.md             ✅ DONE
    └── architecture-decision.opus.prompt.md ✅ DONE
```

---

## 7. Files to Modify

### `packages/agent-executor/src/index.ts`
Add exports:
```typescript
export * from './lib/dag-types.js';
export * from './lib/contract-registry.js';
export * from './lib/barrier-coordinator.js';
export * from './lib/dag-orchestrator.js';
```

### `packages/agent-executor/scripts/copy-agents.js`
Already copies `agents/` to `dist/agents/` — no change needed.
The new `.supervisor.json` and `dag.json` files land there automatically.

### `packages/cli/src/commands/agents.ts`
Add a new command:
```
ai-kit agent:dag <dag-file>    Run a multi-lane supervised DAG workflow
```

---

## 8. JSON Configuration Schema

### 8.1 `*.supervisor.json` — full field reference

| Field | Type | Required | Description |
|---|---|---|---|
| `laneId` | string | ✅ | Must match the lane `id` in `dag.json` |
| `retryBudget` | number | ✅ | Max retries before auto-ESCALATE |
| `checkpoints` | array | ✅ | Ordered list of checkpoint rules |
| `checkpoints[].checkpointId` | string | ✅ | Must match `yield`'s `checkpointId` |
| `checkpoints[].mode` | CheckpointMode | ✅ | `self` / `read-contract` / `soft-align` / `hard-barrier` |
| `checkpoints[].expect` | object | ✅ | Validation rules (see below) |
| `checkpoints[].onFail` | VerdictType | ✅ | Default verdict when expect fails |
| `checkpoints[].retryInstructions` | string | — | Sent to agent on RETRY |
| `checkpoints[].handoffTo` | string | — | Lane ID for HANDOFF |
| `checkpoints[].waitFor` | string[] | — | Lane IDs for soft-align/hard-barrier |
| `checkpoints[].timeoutMs` | number | — | Timeout for soft-align (default: 5000) |
| `checkpoints[].fallback` | string | — | `proceed-with-snapshot` or `escalate` |

### 8.2 `expect` object — validation fields

| Field | Type | Description |
|---|---|---|
| `minFindings` | number | At least N findings must exist |
| `maxErrorSeverity` | `info`/`warning`/`error` | No finding above this severity |
| `requiredKeys` | string[] | These keys must exist in `details` |
| `contractFields` | string[] | These fields must be present in the other lane's `exports` |
| `noErrorFindings` | boolean | No findings starting with ❌ |
| `custom` | string | Name of a registered custom validator (future extension point) |

### 8.3 `dag.json` — full field reference

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✅ | Human name for this DAG |
| `description` | string | ✅ | What this DAG does |
| `lanes` | array | ✅ | All lanes in the DAG |
| `lanes[].id` | string | ✅ | Unique lane identifier |
| `lanes[].agentFile` | string | ✅ | Relative path to `*.agent.json` |
| `lanes[].supervisorFile` | string | ✅ | Relative path to `*.supervisor.json` |
| `lanes[].dependsOn` | string[] | — | Lane IDs that must START before this one |
| `lanes[].capabilities` | string[] | — | What this lane can handle for HOANDOFFs |
| `globalBarriers` | array | — | Named global sync points |
| `globalBarriers[].name` | string | ✅ | Unique barrier name |
| `globalBarriers[].participants` | string[] | ✅ | Lane IDs that must all reach it |
| `globalBarriers[].timeoutMs` | number | ✅ | Max wait before treating absent lanes as failed |
| `capabilityRegistry` | object | — | Maps capability → lane IDs |

---

## 9. Implementation Phases

### Phase 0a — LLM Provider Abstraction ✅ DONE
- [x] Create `llm-provider.ts` — `LLMProvider` interface, `TaskType`, `ModelFamily`
- [x] Implement `AnthropicProvider` — direct Anthropic API via fetch
- [x] Implement `OpenAIProvider` — direct OpenAI API via fetch
- [x] Implement `VSCodeSamplingProvider` — delegates via injected `SamplingCallback`
- [x] Implement `MockProvider` — deterministic responses for testing

### Phase 0b — Model Router ✅ DONE
- [x] Create `model-router.ts` — `ModelRouter` class with `route()`, `profileFor()`, `modelIdFor()`
- [x] `ModelRouter.fromFile('agents/model-router.json')` factory
- [x] `autoRegister()` — scans env vars, registers available providers silently
- [x] Cost estimation per call
- [x] Create `agents/model-router.json` — full declarative config with 4 providers + budget caps

### Phase 0c — Prompt Registry ✅ DONE
- [x] Create `prompt-registry.ts` — `PromptRegistry` with `loadAll()`, `resolve()`, frontmatter parser
- [x] `agents/prompts/file-analysis.haiku.prompt.md`
- [x] `agents/prompts/backend-agent.sonnet.prompt.md`
- [x] `agents/prompts/frontend-agent.sonnet.prompt.md`
- [x] `agents/prompts/supervisor.opus.prompt.md`
- [x] `agents/prompts/architecture-decision.opus.prompt.md`

### Phase 0d — VS Code LM Bridge ✅ DONE
- [x] Create `packages/mcp/src/vscode-lm-bridge.ts`
- [x] `createVSCodeSamplingBridge(server)` → `SamplingCallback`
- [x] `isSamplingSupported(server)` — capability check
- [x] `modelPreferences` priority mapping (haiku=speed, opus=intelligence)

### Phase 0e — Cost Tracker ✅ DONE
- [x] Create `cost-tracker.ts` — `CostTracker` with `record()`, `summary()`, `formatReport()`, `save()`
- [x] Per-lane and per-task-type breakdowns
- [x] Budget cap enforcement with `onBudgetExceeded` callback

### Phase 1 — Types & Registry (no breaking changes)
**Goal:** Lay the foundation. Existing chain still works untouched.

- [ ] Create `dag-types.ts` with all interfaces from Section 5.1
- [ ] Create `contract-registry.ts`
  - In-memory `Map<laneId, ContractSnapshot>`
  - `publish()`, `getSnapshot()`, `getVersion()`, `waitForVersion()` (uses polling with `setInterval` + Promise)
  - `waitForVersion` resolves when version ≥ requested OR timeout elapses (returns null on timeout)
- [ ] Add exports to `index.ts`
- [ ] Write unit tests for ContractRegistry

### Phase 2 — Barrier Coordinator
**Goal:** Resolve all 4 checkpoint modes.

- [ ] Create `barrier-coordinator.ts`
  - Holds a reference to `ContractRegistry`
  - `resolve(checkpoint, registry): Promise<BarrierResolution>`
  - Mode `self` → resolves immediately (supervisor handles the validation, not the coordinator)
  - Mode `read-contract` → reads current snapshot, returns immediately even if null
  - Mode `soft-align` → calls `registry.waitForVersion()` with timeout, returns best-available
  - Mode `hard-barrier` → waits for ALL `waitFor` lanes to publish a snapshot, uses `Promise.all` with individual timeouts
- [ ] Write unit tests with mock registry

### Phase 3 — Intra Supervisor
**Goal:** Implement RETRY / HANDOFF / ESCALATE verdict logic.

- [ ] Create `intra-supervisor.ts`
  - Loads `*.supervisor.json`
  - `evaluate(checkpointId, partialResult, retryCount): Promise<SupervisorVerdict>`
  - Applies `expect` validation rules (each rule type → a pure function)
  - Tracks retry count per checkpoint, auto-ESCALATEs on budget exhaustion
  - On `HANDOFF`: looks up `capabilityRegistry` to find target lane

### Phase 4 — Lane Executor + Supervised Agent
**Goal:** Drive a single lane end-to-end with supervision.

- [ ] Create `supervised-agent.ts`
  - Adapts `JsonAgentStrategy` (current) into `AsyncGenerator<CheckpointPayload, AgentResult, SupervisorVerdict>`
  - Yields at each check boundary with `mode: 'self'` by default
  - Reads checkpoint overrides from the agent's `*.agent.json` (new optional `checkpoint` field per check)
- [ ] Create `lane-executor.ts`
  - `runLane(lane, projectRoot, registry, coordinator): Promise<LaneResult>`
  - Calls `generator.next()` in a loop
  - When generator yields → calls `coordinator.resolve()` + `supervisor.evaluate()`
  - Routes verdict:
    - `APPROVE` → `generator.next({ type: 'APPROVE' })`
    - `RETRY` → `generator.next({ type: 'RETRY', instructions })`, track retryCount
    - `HANDOFF` → spin up specialist lane, merge result back, resume original generator
    - `ESCALATE` → `generator.return()`, record failure
  - Saves checkpoint snapshots to `.agents/checkpoints/<laneId>/`

### Phase 5 — DAG Orchestrator
**Goal:** Wire everything together.

- [ ] Create `dag-orchestrator.ts`
  - `loadDag(dagFile): Promise<DagDefinition>`
  - `execute(dagDef, projectRoot): Promise<DagResult>`
    - Creates a shared `ContractRegistry`
    - Creates a `BarrierCoordinator` backed by the registry
    - Builds execution groups respecting `dependsOn` (topological sort)
    - Runs each group with `Promise.allSettled(group.map(runLane))`
    - Collects `LaneResult[]` per group, merges into final `DagResult`
  - Saves full DAG result to `.agents/results/dag-<timestamp>.json`

### Phase 6 — CLI Command
**Goal:** Expose DAG execution via `ai-kit agent:dag`.

- [ ] Add `agent:dag` command to `packages/cli/src/commands/agents.ts`
  - `ai-kit agent:dag [dag-file]` (defaults to `agents/dag.json` in CWD)
  - Progress display: show each lane's status as a live table (update in-place)
  - Show cross-lane alignment events as they happen

### Phase 7 — JSON Supervisor Files
**Goal:** Provide working supervisor configs for existing 6 agents.

- [ ] `agents/business-analyst.supervisor.json`
- [ ] `agents/architecture.supervisor.json`
- [ ] `agents/backend.supervisor.json`
- [ ] `agents/frontend.supervisor.json`
- [ ] `agents/testing.supervisor.json`
- [ ] `agents/e2e.supervisor.json`
- [ ] `agents/dag.json` — wiring them together

---

## 10. Execution Flow Walkthrough

### Scenario: Backend error manager needs SQL + React contracts

```
t=0   DAG starts
      SQL Lane    → starts (no dependsOn)
      React Lane  → starts (no dependsOn)
      Backend Lane → starts (no dependsOn)

t=1   SQL Agent yields checkpoint "step-1-query-structure" (mode: self)
      SQL Supervisor evaluates → APPROVE
      SQL Agent resumes, publishes ContractSnapshot v1 { errorTypes: ["NOT_FOUND", "TIMEOUT"] }

t=2   React Agent yields checkpoint "step-1-component-structure" (mode: self)
      React Supervisor evaluates → RETRY (missing required key "componentTree")
      React Agent receives instructions, re-runs step 1
      React Agent yields again → APPROVE
      React publishes ContractSnapshot v1 { components: [...], errorBoundaryProps: {...} }

t=3   Backend Agent yields checkpoint "step-2-error-manager" (mode: soft-align)
      waitFor: ["sql", "react"], timeoutMs: 5000
      BarrierCoordinator checks registry:
        SQL v1 → available ✅
        React v1 → available ✅
      Both available → resolve immediately
      Backend receives both snapshots in verdict.handoffContext
      Backend Agent resumes, builds error manager against real contracts

t=4   All lanes complete
      DAG Orchestrator merges results
      Saves to .agents/results/dag-<timestamp>.json
```

### Retry Flow

```
Backend yields "step-3-api-routes" (mode: self)
Backend Supervisor: expect.noErrorFindings = true, but 2 ❌ findings exist
  retryCount = 0, budget = 3 → verdict: RETRY
  instructions: "Re-check Express route registration — missing error handler middleware"

Backend receives instructions, re-runs step 3
Backend yields "step-3-api-routes" again
Backend Supervisor: 0 ❌ findings → APPROVE
```

### Handoff Flow

```
SQL Agent yields "step-2-index-optimization" (mode: self)
SQL Supervisor: expect.maxErrorSeverity = "warning" but finds "error" severity
  retryCount = 3, budget exhausted → auto-ESCALATE
  ... OR supervisor config says onFail: "HANDOFF", handoffTo: "db-specialist"

Lane Executor:
  looks up "db-specialist" in capabilityRegistry
  spins up specialist lane with sub-context (the failing checkpoint's partialResult)
  specialist runs, produces result
  Lane Executor merges specialist result back into SQL lane
  SQL Agent generator receives merged result as the HANDOFF verdict's context
  SQL Agent continues from next checkpoint
```

---

## 11. Edge Cases & Invariants

### Retry loop prevention
- Each checkpoint tracks `retryCount` independently
- On `retryCount >= retryBudget` → force `ESCALATE` regardless of supervisor config
- `ESCALATE` marks the lane as `failed` but does NOT stop other lanes

### Timeout handling
- `soft-align` timeout: return best-available snapshot (may be `null` if lane hasn't published yet)
- `hard-barrier` timeout: if any participant lane has not published, the barrier coordinator resolves with the lanes that have published, marks absent lanes as `timed-out`
- A `timed-out` lane in a barrier is not an error — the requesting agent receives a partial snapshot set and can decide whether to proceed or escalate

### Circular dependencies
- `dependsOn` forms a DAG — must be validated at load time
- If a cycle is detected, `loadDag()` throws with a clear message listing the cycle
- Use standard topological sort (Kahn's algorithm)

### Handoff specialist lane
- Specialist lanes are **ephemeral** — they run, produce a result, and are discarded
- They do NOT publish to the Contract Registry under their own ID
- Their output is merged into the **requesting lane's** partial result
- They DO run through their own supervisor rules

### Empty lanes
- A lane with 0 checkpoints is valid — it runs the agent with no supervision
- This is backward-compatible with the current `JsonAgentStrategy`

### Missing supervisor file
- If `supervisorFile` does not exist, lane runs with `null` supervisor
- All checkpoints auto-approve (no-op supervision)
- Logged as a warning at DAG startup

---

## 12. Testing Strategy

### Unit tests

| File | What to test |
|---|---|
| `contract-registry.test.ts` | publish/read, version bumping, waitForVersion resolves, waitForVersion times out |
| `barrier-coordinator.test.ts` | all 4 modes, timeout handling, partial resolution |
| `intra-supervisor.test.ts` | each expect field, RETRY budget exhaustion, HANDOFF routing |
| `supervised-agent.test.ts` | generator yields checkpoints, receives verdicts correctly |
| `lane-executor.test.ts` | full lane run with mocked supervisor, retry flow, handoff flow |
| `dag-orchestrator.test.ts` | parallel lane execution, barrier resolution, topological sort |

### Integration test scenario
Create `tests/dag-integration.test.ts`:
- Use a real `dag.json` pointing at test agent/supervisor JSON files
- Run against a fixture project directory
- Assert that cross-lane contract reads work end-to-end
- Assert that RETRY flow produces correct audit trail in `.agents/checkpoints/`

---

## 13. CLI Integration

### New command

```
ai-kit agent:dag [options] [dag-file]

Options:
  --project <path>    Project root to analyze (default: current directory)
  --output <path>     Where to save results (default: .agents/results/)
  --verbose           Show per-checkpoint supervisor verdicts
  --dry-run           Load and validate dag.json without executing

Arguments:
  dag-file            Path to dag.json (default: agents/dag.json in CWD)
```

### Progress display format (verbose)

```
🚀 DAG: Full Stack Analysis
   3 lanes | 1 global barrier

  SQL Lane      ████████░░  step 2/3  ✅ APPROVED  ✅ APPROVED  ⏳
  React Lane    ██████████  step 3/3  ✅ APPROVED  🔄 RETRIED   ✅ APPROVED
  Backend Lane  ████░░░░░░  step 1/3  ⏳ waiting on [sql, react]

  🔗 soft-align barrier: sql ✅  react ✅  → resolved (0ms wait)
```

### Audit trail written to disk

```
.agents/
  results/
    dag-2026-03-04T12-00-00.json    ← full merged DagResult
  checkpoints/
    sql/
      step-1-query-structure.json   ← { payload, verdict, retryCount, timestamp }
      step-2-schema-alignment.json
    react/
      step-1-component-structure.json
    backend/
      step-1-setup.json
      step-2-error-manager.json     ← includes contractsReceived snapshot
```

---

## Implementation Order Summary

```
Phase 0a: llm-provider.ts                             ✅ DONE
Phase 0b: model-router.ts + agents/model-router.json  ✅ DONE
Phase 0c: prompt-registry.ts + agents/prompts/        ✅ DONE
Phase 0d: vscode-lm-bridge.ts (MCP package)           ✅ DONE
Phase 0e: cost-tracker.ts                             ✅ DONE
─────────────────────────────────────────────────────────────
Phase 1: dag-types.ts + contract-registry.ts          (foundation, no risk)
Phase 2: barrier-coordinator.ts                        (pure logic, easy to test)
Phase 3: intra-supervisor.ts                           (reads JSON, applies rules)
Phase 4: supervised-agent.ts + lane-executor.ts        (generator protocol)
Phase 5: dag-orchestrator.ts                           (wires everything)
Phase 6: CLI agent:dag command                         (user-facing)
Phase 7: JSON supervisor files for existing 6 agents   (declarative config)
```

Each phase is independently testable.  
No phase breaks existing `AgentChainExecutor` behavior.  
The full system is backward-compatible — existing `agent:workflow` command is untouched.
