# @ai-agencee/ai-starter-kit

> **Enterprise-grade multi-agent orchestration engine** — DAG-supervised parallel agents with streaming LLM output, intelligent model routing, resilience patterns, cost tracking, RBAC, audit logging, and a zero-API-key demo mode.

**Status**: ✅ Production-Ready | **Tests**: 424 passing | **Enterprise Features**: 13 completed (E1–E13)

---

## Who is this for?

| Audience | Why they use it |
|----------|-----------------|
| **Individual developers** | Run the full AI-assisted development loop — from idea to wired sprint plan — without leaving the terminal and without paying for API calls during exploration |
| **Feature squads (2–8 people)** | Coordinate parallel workstreams with hard sync points, automated handoffs between agents, and supervisor-gated quality checks |
| **Platform / enterprise teams** | Roll out AI-assisted workflows to multiple squads with RBAC, multi-tenant isolation, audit trails, cost controls, and CI integration — all enforced at the engine level |
| **AI tooling builders** | Use the DAG engine, MCP bridge, plugin system, and TypeScript Builder API as infrastructure for custom AI products |

---

## What problem does it solve?

> **"I want AI to help me build real software — not just generate snippets."**

Most AI coding tools stop at the file level. `ai-starter-kit` operates at the **project level**:

- A structured **5-phase discovery process** turns a vague requirement into a precise, wired sprint plan — with every agent knowing their scope, dependencies, and acceptance criteria before writing a line
- A **DAG execution engine** runs specialised agents in parallel, detects conflicts via alignment barriers, retries on failure, hands off between agents, and escalates to a human when it can't recover automatically
- **Supervisor checkpoints** enforce quality at every step — not just at the end — so regressions surface during planning, not in production
- **Zero API-key demo mode** means the entire system can be evaluated, tested in CI, and learned without spending anything

It ships two execution paths that compose seamlessly:

| Path | Entry point | When to use |
|------|------------|-------------|
| **Plan System** | `pnpm run:plan` | Discovery → synthesis → decomposition → wiring → DAG hand-off for a new project or feature |
| **DAG Engine** | `pnpm run:dag <dag.json>` | Run any defined agent graph directly: code review, security audit, migration, documentation, CI gate |

---

## Why ai-agencee and not another tool?

| Need | Generic AI chat | Code-gen copilots | ai-starter-kit |
|------|----------------|------------------|----------------|
| Structured multi-step plan from a vague idea | ❌ Hallucinated | ⚠️ Single-file suggestions | ✅ 5-phase BA-led discovery → wired sprint plan |
| Parallel agent coordination with sync points | ❌ | ❌ | ✅ DAG barriers, soft-align, read-contract |
| Automatic retry + escalation on failure | ❌ | ❌ | ✅ `retryBudget`, `HANDOFF`, `ESCALATE` verdicts |
| Human-in-the-loop approval gates | ❌ | ❌ | ✅ `needs-human-review` checkpoint |
| Enterprise: RBAC, audit, multi-tenant, PII, OIDC | ❌ | ❌ | ✅ E1–E13 enforced at runtime |
| Zero-cost evaluation + CI integration | ❌ | ❌ | ✅ Mock provider, $0.00, no keys |
| Extensible: custom agents, checks, providers | ⚠️ | ⚠️ | ✅ Plugin system + TypeScript Builder API |

---

## ⚡ Quickies — Get a result in under 5 minutes

Copy-paste recipes for the most common tasks. No reading required.

| I want to… | Command |
|------------|---------|
| **See the engine run** right now | `pnpm demo` |
| **See failures, retries, escalations** in one run | `pnpm demo:06` |
| **Plan a new app** from scratch | `pnpm run:plan` |
| **Add a feature** to an existing codebase | `pnpm demo:plan:04` then `pnpm run:plan` |
| **Security audit** my project | `pnpm run:dag agents/security-review.agent.json --provider mock` |
| **Generate docs** for an existing app | `pnpm run:plan` → type `spike`, stories = "generate architecture doc" |
| **Create a custom agent** in 5 min | [Q4 in Quickies →](docs/quickies.md#q4) |
| **Set up a CI quality gate** | [Q18 in Quickies →](docs/quickies.md#q18) |
| **Enterprise adoption** checklist | [Q13 in Quickies →](docs/quickies.md#q13) |
| **Data migration** plan + cutover gate | [Q19 in Quickies →](docs/quickies.md#q19) |

**📖 Full recipe list (19 quickies)**: [docs/quickies.md](docs/quickies.md)

---

## What it is (technical)

`ai-starter-kit` is a TypeScript monorepo that turns JSON-defined agent graphs into production-ready AI workflows with enterprise-grade security, compliance, and observability.

**Full Documentation**: Start with [📚 Features Index](docs/features/INDEX.md) for all capabilities.

---

## Core Capabilities

### 🎯 Orchestration & Execution
- **[DAG Orchestration](docs/features/01-dag-orchestration.md)** — Declarative JSON-based DAG with parallel lanes, barriers, and supervisor checkpoints
- **[Streaming Output](docs/features/05-streaming-output.md)** — Real-time token-by-token feedback from LLM providers
- **[Resilience Patterns](docs/features/07-resilience-patterns.md)** — Exponential backoff retry, circuit breakers, graceful fallbacks
- **[Model Routing & Cost](docs/features/03-model-routing-cost.md)** — Intelligent provider selection, budget enforcement, cost tracking
- **[Tool-Use Integration](docs/features/06-tool-use.md)** — Agents calling functions within LLM turns with supervisor approval

### 🔐 Enterprise & Security
- **[Authentication & RBAC](docs/features/09-rbac-auth.md)** — Role-based access control with OIDC JWT support
- **[Audit Logging](docs/features/10-audit-logging.md)** — Immutable hash-chained audit trails for compliance
- **[Multi-Tenant Isolation](docs/features/11-multi-tenant.md)** — Per-tenant data isolation and run sandboxing
- **PII Scrubbing** — Automatic detection and redaction of sensitive data
- **Rate Limiting** — Token budget and concurrent run limits per principal

### 📊 Observability
- **[Event Bus](docs/features/08-event-bus.md)** — Typed real-time event subscriptions for lane status, tokens, costs
- **DAG Visualizer** — Mermaid and DOT output for architecture visualization
- **Cost Analytics** — Per-run and per-principal cost breakdowns

### 👨‍💻 Developer Experience
- **[TypeScript Builder API](docs/features/13-dag-builder-api.md)** — Fluent, type-safe DSL for DAG construction
- **[CLI Commands](docs/features/15-cli-commands.md)** — Full command reference with examples
- **[MCP Integration](docs/features/16-mcp-integration.md)** — VS Code and Claude Desktop support

---

## Packages

| Package | Description | Docs |
|---|---|---|
| `packages/agent-executor` | Core engine: DAG orchestrator, supervised agents, model router, resilience, RBAC, audit logging | [Agent Executor Docs](docs/features/01-dag-orchestration.md) |
| `packages/cli` | `ai-kit` CLI — `init`, `sync`, `check`, `agent:dag`, `plan`, `visualize`, `data` | [CLI Reference](docs/features/15-cli-commands.md) |
| `packages/core` | Shared filesystem utilities, template scaffolding, event types | [Features Index](docs/features/INDEX.md) |
| `packages/mcp` | VS Code MCP bridge, OIDC auth middleware, SSE server, GitHub Copilot routing | [MCP Integration](docs/features/16-mcp-integration.md) |

---

## Quick Start

### 1. Install & Build

```sh
pnpm install
pnpm build
```

### 2. Run the Zero-Key Demo

```sh
# Run the original 3-lane demo — NO API keys required
pnpm demo

# Interactive menu — pick from 6 advanced scenarios
pnpm demo:menu

# Run a specific advanced scenario directly
pnpm demo:01   # App Boilerplate    — RETRY × 2, hard-barrier
pnpm demo:02   # Enterprise Skeleton — HANDOFF, needs-human-review
pnpm demo:03   # Website Build       — ESCALATE terminal 🚨
pnpm demo:04   # Feature in Context  — soft-align, read-contract
pnpm demo:05   # MVP Sprint          — flaky lane, mixed results
pnpm demo:06   # Resilience Showcase — every error type at once

# 5-Phase Plan Demo (seed Phase 0, start from SYNTHESIZE)
pnpm demo:plan
```

All demos run on the built-in `MockProvider` — **zero API keys required**.

**📖 See**: [Advanced Demo Scenarios](docs/demo-scenarios.md) · [Quickies — copy-paste recipes](docs/quickies.md)

### 3. Run a Real DAG

```sh
# With Anthropic
ANTHROPIC_API_KEY=sk-... pnpm run:dag agents/dag.json

# With OpenAI
OPENAI_API_KEY=sk-... pnpm run:dag agents/dag.json

# Force a specific provider
pnpm run:dag agents/dag.json --provider anthropic

# Mock provider (no key needed, great for CI)
pnpm run:dag agents/dag.json --provider mock
```

**📖 See**: [DAG Orchestration](docs/features/01-dag-orchestration.md), [CLI Reference](docs/features/15-cli-commands.md)

---

## Model Routing & Cost Control

Intelligent routing automatically selects the optimal model tier based on task complexity and budget constraints.

Configuration: [`agents/model-router.json`](agents/model-router.json)

| Task type | Family | Anthropic model | OpenAI model | Cost /1M tokens |
|---|---|---|---|---|
| `file-analysis` | haiku | claude-haiku-4-5 | gpt-4o-mini | $0.80 |
| `code-generation` | sonnet | claude-sonnet-4-5 | gpt-4o | $3.00 |
| `code-review` | sonnet | claude-sonnet-4-5 | gpt-4o | $3.00 |
| `architecture-decision` | opus | claude-opus-4-5 | gpt-4o | $15.00 |
| `security-review` | opus | claude-opus-4-5 | gpt-4o | $15.00 |

**Key Features**:
- ✅ Per-run budget enforcement
- ✅ Fallback to cheaper models when budget-constrained
- ✅ Real-time cost tracking per check and lane
- ✅ Cost attribution per principal (user/service)

**📖 See**: [Model Routing & Cost Tracking](docs/features/03-model-routing-cost.md)

---

## Check Handler Types

Agents compose any mix of these typed checks:

| Type | Description | Use Case |
|---|---|---|
| `file-exists` | Assert a file path is present | Pre-flight validation |
| `dir-exists` | Assert a directory exists | Pre-flight validation |
| `count-files` / `count-dirs` | Count files matching a glob | Coverage analysis |
| `grep` | Regex search inside text files | Pattern matching |
| `json-field` / `json-has-key` | JSON schema / value assertions | Data validation |
| `run-command` | Execute shell command, inspect stdout/exit code | System integration |
| `llm-generate` | LLM generation with streaming output | Content creation |
| `llm-review` | LLM review / critique with streaming output | Analysis & feedback |

**📖 See**: [Check Handlers & Validators](docs/features/04-check-handlers.md), [Tool-Use Integration](docs/features/06-tool-use.md)

---

## Resilience & Reliability

All LLM provider calls are protected by intelligent retry and circuit breaker patterns:

### Retry Policy
- **Exponential backoff** with jitter to prevent thundering herd
- **Configurable retry conditions** — 429/500/503 transient errors by default
- **Preset**: 4 attempts, 1s → 32s max delay
- **Respects Retry-After headers** from providers

### Circuit Breaker
- **CLOSED → OPEN → HALF_OPEN** state machine per provider
- **5-failure threshold** to trigger opening
- **60s cooldown** before attempting recovery
- **Per-provider stats** for observability

**📖 See**: [Resilience Patterns](docs/features/07-resilience-patterns.md)

---

## Real-Time Streaming Output

Every `llm-generate` and `llm-review` check streams tokens directly to `process.stdout` as they arrive.

**Supported Providers**:
- ✅ Anthropic (SSE)
- ✅ OpenAI (SSE + `stream_options`)
- ✅ VS Code Copilot (fallback to complete)
- ✅ Mock (word-level simulation)

**📖 See**: [Streaming Output & Real-Time Feedback](docs/features/05-streaming-output.md)

---

## Enterprise Features (E1–E7)

All implemented and enforced at runtime:

| ID | Feature | Status | Details |
|----|---------|--------|----------|
| **E1** | PII Scrubbing | ✅ Active | Automatic detection and redaction via regex patterns |
| **E2** | Security Audit | ✅ Active | CI/CD scanning via GitHub Actions on every push |
| **E3** | Multi-Tenant | ✅ Active | Path-isolated run roots per tenant ID |
| **E4** | GDPR Data CLI | ✅ Active | `data:export`, `data:delete`, `data:list-tenants` |
| **E5** | OIDC JWT Auth | ✅ Active | RS256/ES256 Bearer token validation on SSE events |
| **E6** | Rate Limiting | ✅ Active | Token budget + concurrent run limits per principal |
| **E7** | DAG Visualizer | ✅ Active | Mermaid + DOT output for architecture visualization |

**📖 See**: [Enterprise Readiness](docs/enterprise-readiness.md), [Authentication & RBAC](docs/features/09-rbac-auth.md), [Audit Logging](docs/features/10-audit-logging.md)

---

## Plan System — 5-Phase Discovery to Execution

A single `pnpm run:plan` session takes you from a vague idea to running agent tasks.
Each phase is distinct, inspectable, and resumable.

---

### Phase 0 — DISCOVER
**What:** The BA agent interviews you with ~12 structured questions across 4 blocks:  
problem definition · primary users · stories (feature/fix/migration/spike) · stack constraints.

**You do:** Answer in plain English. The BA probes and clarifies.  
**Output:** `.agents/plan-state/discovery.json` — a complete `DiscoveryResult` capturing every answer.

```
🧠 BA › What problem are you solving?
👤 You › Users can't track their subscription status in real time.
🧠 BA › Who is the primary user — consumer or internal team?
👤 You › Consumer, B2C SaaS, ~50k MAU.
🧠 BA › I'll capture: real-time subscription status for 50k MAU consumer SaaS…
         What quality grade? (mvp / enterprise / poc-stub)
```

> **Skip this phase** with a pre-seeded discovery: `pnpm demo:plan:01` through `pnpm demo:plan:05`

---

### Phase 1 — SYNTHESIZE
**What:** The BA reads the discovery result and produces a **plan skeleton** — Steps with
rough Tasks, ownership, and acceptance criteria. You review and approve.

**Output:** `.agents/plan-state/plan.json` at phase `synthesize` — Steps defined, Tasks stubbed.

```
🧠 BA › Draft plan for "Real-time Subscription Status":
         Step 1: Webhook ingestion (Backend)   — receive Stripe events
         Step 2: Status store (Database)        — idempotent event log
         Step 3: SSE endpoint (Backend)         — stream status to clients
         Step 4: UI widget (Frontend)           — live status badge
         Step 5: Test suite (Testing + E2E)     — contract + acceptance tests

         Approve? [y / edit / add story]
```

---

### Phase 2 — DECOMPOSE
**What:** Each specialist agent (Architecture, Backend, Frontend, Testing, E2E) expands
their Steps into detailed Tasks **in parallel**. Each task gets: description, acceptance
criteria, estimated effort, and output artefacts.

**Output:** `.agents/plan-state/plan.json` fully populated — every task defined.

```
🏗️  Architecture  › Decomposing Step 1…
⚙️  Backend       › Decomposing Step 2, 3…     ← parallel
🎨  Frontend      › Decomposing Step 4…        ← parallel
🧪  Testing       › Decomposing Step 5…        ← parallel
```

---

### Phase 3 — WIRE
**What:** The engine computes the **dependency graph** across all tasks, detects
conflicts between agent plans, injects **alignment gates** at conflict points, and
produces the execution order.

**Output:** `.agents/plan-state/plan.json` at phase `wire` — dependencies set,
`AlignmentGate` objects injected, the `Arbiter` resolves any cross-agent conflicts.

```
⚖️  Arbiter › Conflict: Backend Step 3 (SSE schema) ↔ Frontend Step 4 (event type)
             Resolution: agree on { type: 'subscription.status', payload: StatusEvent }
             → alignment gate injected after Step 3
```

---

### Phase 4 — EXECUTE
**What:** `PlanOrchestrator` feeds the wired plan into the `DagOrchestrator` lane by
lane, respecting the computed dependency order. Supervisors enforce acceptance criteria
at every checkpoint. Results land in `.agents/results/`.

**Output:** Execution artefacts per task, findings log, full `DagResult` JSON.

```
⚡  System  › Executing wired plan — 5 steps, 18 tasks
▶  Group 1: webhook-ingestion + status-store   ← parallel
✅  webhook-ingestion  — 3 checkpoints, 0 retries
✅  status-store       — 2 checkpoints, 0 retries
▶  Group 2: sse-endpoint
✅  sse-endpoint        — 2 checkpoints, 1 retry
▶  Group 3: ui-widget + test-suite             ← parallel
...
```

---

```sh
# Start the full interactive session:
pnpm run:plan

# Jump to Phase 1 with a pre-seeded discovery (no Q&A):
pnpm demo:plan          # interactive seed picker
pnpm demo:plan:01       # App Boilerplate seed
pnpm demo:plan:02       # Enterprise Skeleton seed
pnpm demo:plan:04       # Feature-in-context seed (billing on existing platform)
pnpm demo:plan:05       # MVP Sprint seed (2-week solo)
```

**📖 See**: [demo-scenarios.md — 5-Phase Plan Demo](docs/demo-scenarios.md#the-5-phase-plan-demo)

---

## Documentation

Comprehensive feature guides are available in [`docs/features/`](docs/features/INDEX.md):

**Core Features**
- [DAG Orchestration & Execution](docs/features/01-dag-orchestration.md)
- [Agent Types & Roles](docs/features/02-agent-types-roles.md)
- [Model Routing & Cost Tracking](docs/features/03-model-routing-cost.md)
- [Check Handlers & Validators](docs/features/04-check-handlers.md)

**Advanced Execution**
- [Streaming Output](docs/features/05-streaming-output.md)
- [Tool-Use Integration](docs/features/06-tool-use.md)
- [Resilience Patterns (Retry & Circuit Breaker)](docs/features/07-resilience-patterns.md)
- [Event Bus & Real-Time Events](docs/features/08-event-bus.md)

**Enterprise & Security**
- [Authentication & RBAC](docs/features/09-rbac-auth.md)
- [Audit Logging & Compliance](docs/features/10-audit-logging.md)
- [Multi-Tenant Isolation](docs/features/11-multi-tenant.md)
- [PII Scrubbing & Injection Defense](docs/features/12-pii-security.md)

**Developer Tools**
- [TypeScript DAG Builder API](docs/features/13-dag-builder-api.md)
- [Plugin System & Custom Checks](docs/features/14-plugin-system.md)
- [CLI Commands Reference](docs/features/15-cli-commands.md)
- [MCP Integration](docs/features/16-mcp-integration.md)

**📚 Full Index**: [All Features](docs/features/INDEX.md)

---

## Development

```sh
pnpm install          # install all workspace deps
pnpm build            # compile all packages (tsc)
pnpm test             # run all Jest suites (424 tests)
pnpm demo             # build + run the original 3-lane mock demo

# Advanced demo scenarios (no API keys)
pnpm demo:menu        # interactive scenario picker
pnpm demo:all         # run all 6 scenarios in sequence
pnpm demo:01          # App Boilerplate  (RETRY × 2, hard-barrier)
pnpm demo:02          # Enterprise       (HANDOFF, needs-human-review)
pnpm demo:03          # Website Build    (ESCALATE terminal)
pnpm demo:04          # Feature-in-ctx   (soft-align, read-contract)
pnpm demo:05          # MVP Sprint       (flaky lane)
pnpm demo:06          # Resilience       (all error types)

# 5-Phase Plan system
pnpm demo:plan        # seed Phase 0 → launch plan from SYNTHESIZE
pnpm demo:plan:01     # App Boilerplate seed
pnpm demo:plan:04     # Feature-in-context seed (billing on existing platform)
pnpm run:plan         # start fully interactive planning session

# DAG execution
pnpm run:dag agents/dag.json      # execute a DAG
pnpm visualize agents/dag.json    # output Mermaid/DOT diagram
```

---

## Roadmap & Status

### Enterprise Features (E1–E13) ✅ Implemented & Tested

| ID | Feature | Status | Details |
|----|---------|--------|----------|
| **E1** | PII Scrubbing | ✅ | Automatic detection and redaction via regex patterns |
| **E2** | Security Audit | ✅ | CI/CD scanning via GitHub Actions (`pnpm audit --audit-level=high`) |
| **E3** | Multi-Tenant Isolation | ✅ | Path-isolated run roots per tenant, GDPR-compliant |
| **E4** | GDPR Data CLI | ✅ | `data:export`, `data:delete`, `data:list-tenants` commands |
| **E5** | OIDC JWT Auth | ✅ | RS256/ES256 Bearer token validation on SSE `/events` endpoint |
| **E6** | Rate Limiting | ✅ | Token budget + concurrent run limits per principal |
| **E7** | DAG Visualizer | ✅ | Mermaid + DOT output for architecture visualization |
| **E8** | Prompt Injection Detection | ✅ | 10 detection families; configurable warn/block modes |
| **E10** | AWS Bedrock Provider | ✅ | SigV4-signed Converse API; supports Claude/Llama/Titan on Bedrock |
| **E13** | Run Advisor (Auto-Tune) | ✅ | Analyzes run history → suggests model downgrades, budget optimization, stability improvements |

**📖 See**: [Enterprise Readiness](docs/enterprise-readiness.md) for implementation details

### Advanced Features Implemented

| Feature | Roadmap ID | Status | Details |
|---------|-----------|--------|----------|
| Prompt Distillation | G-37 | ✅ | Few-shot example collection for self-improving prompts |
| Code Execution Sandbox | G-38 | ✅ | Isolated Node/Python/Bash code execution with timeout + output capture |
| Vector Memory | G-13 | ✅ | In-memory semantic search with cosine similarity |
| SQLite Vector Memory | G-24/G-25 | ✅ | Persistent embeddings with `better-sqlite3` backend |
| Webhook Triggers | G-16 | ✅ | GitHub webhook integration for DAG execution |
| DAG Builder Fluent API | G-22 | ✅ | Type-safe TypeScript DSL for programmatic DAG construction |
| LLM-as-Judge Eval | G-50 | ✅ | Structured evaluation harness for output quality assessment |
| OpenTelemetry | G-08 | ✅ | Distributed tracing and metrics collection |
| Plugin System | Core | ✅ | Custom check types and provider extensions |
| Human Review Gate | Core | ✅ | Manual approval checkpoints in DAG execution |

### Recently Shipped (E9, E11, E12)

| ID | Feature | Status | Details |
|----|---------|--------|----------|
| **E9** | Python MCP Bridge | ✅ | JSON-RPC 2.0 subprocess bridge; `PythonMcpProvider` LLM adapter |
| **E11** | Jira/Linear Sync | ✅ | Post issues on DAG lane failure via REST/GraphQL; `fromEnv()` |
| **E12** | Slack/Teams Notifications | ✅ | Incoming webhooks on DAG/lane end + budget exceeded; parallel delivery |

### Planned (E14)

| ID | Feature | Priority | Status |
|----|---------|----------|--------|
| **E14** | Visual DAG Editor | P3 | 🔜 React-based browser UI for editing `.dag.json` files |

**📖 See**: [Enterprise Readiness](docs/enterprise-readiness.md) for detailed roadmap

---

## License

MIT — see [LICENSE](LICENSE).
---

## Support & Resources

- 📚 **Full Documentation**: [docs/features/INDEX.md](docs/features/INDEX.md)
- ⚡ **Quickies — copy-paste recipes** (general + enterprise): [docs/quickies.md](docs/quickies.md)
- 🎬 **Advanced Demo Scenarios**: [docs/demo-scenarios.md](docs/demo-scenarios.md)
- 📋 **Enterprise Readiness**: [docs/enterprise-readiness.md](docs/enterprise-readiness.md)
- 🏗️ **Architecture**: [agents/](agents/)