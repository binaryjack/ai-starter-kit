# AI Agencee — Single Source of Truth Roadmap

> **Verified against source code** on 2026-03-08.
> Each entry links to the authoritative implementation file(s) and records the real status from a codebase scan, not from documentation alone.
> "Implemented" means production code exists with real logic — stubs and no-op fall-throughs are called out explicitly.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Fully implemented, wired into execution path, has tests |
| ⚠️ | Implemented but opt-in / not wired by default |
| 🔌 | Implemented behind a runtime dependency (package must be installed separately) |
| 🧪 | Implemented, not yet wired into CLI or orchestrator |
| ❌ | Not yet implemented / backlog |

---

## Core Engine (P0 — always on)

| ID | Feature | Source file(s) | Status | Notes |
|----|---------|---------------|--------|-------|
| C-01 | DAG Orchestration | `agent-executor/src/lib/dag-orchestrator.ts` | ✅ | Parallel lane execution, dependency resolution, barrier sync, retry budget, cost tracking |
| C-02 | Lane Executor | `agent-executor/src/lib/lane-executor.ts` | ✅ | Per-lane LLM loop, check runner integration, checkpoint → supervisor → verdict cycle |
| C-03 | Intra-Lane Supervisor | `agent-executor/src/lib/intra-supervisor.ts` | ✅ | APPROVE / RETRY / HANDOFF / ESCALATE verdicts |
| C-04 | DAG Event Bus | `agent-executor/src/lib/dag-events.ts` | ✅ | Typed EventEmitter; `dag:start`, `dag:end`, `lane:start`, `lane:end`, `checkpoint:complete`, `llm:call`, `token:stream`, `budget:exceeded` |
| C-05 | Agent Types & Roles | `agent-executor/src/lib/agent-types.ts` | ✅ | BA, Architecture, Backend, Frontend, Testing, E2E; supervisor JSON schema |
| C-06 | Model Router | `agent-executor/src/lib/model-router.ts` + `model-router-factory.ts` | ✅ | JSON-driven tier routing (haiku/sonnet/opus); cost-per-token accounting; per-lane overrides |
| C-07 | Cost Tracker | `agent-executor/src/lib/cost-tracker.ts` | ✅ | Per-run cumulative USD, per-lane breakdown, `budget:exceeded` event |
| C-08 | Prompt Registry | `agent-executor/src/lib/prompt-registry.ts` | ✅ | YAML/JSON prompt templates; XML example injection; per-task-type file resolution |
| C-09 | DAG Planner | `agent-executor/src/lib/dag-planner.ts` | ✅ | Topological sort, dependency validation, barrier wiring |
| C-10 | DAG Result Builder | `agent-executor/src/lib/dag-result-builder.ts` | ✅ | `DagResult` / `LaneResult` construction; writes `results/dag-<runId>.json` |
| C-11 | Run Registry | `agent-executor/src/lib/run-registry.ts` | ✅ | `manifest.json` writer/reader; run lifecycle (running → completed/failed) |
| C-12 | Contract Registry | `agent-executor/src/lib/contract-registry.ts` | ✅ | Read-contract validation at barrier sync points |
| C-13 | Barrier Coordinator | `agent-executor/src/lib/barrier-coordinator.ts` | ✅ | Hard barriers (block) and soft barriers (align); per-barrier timeout |
| C-14 | Streaming Output | `agent-executor/src/lib/llm-provider.ts` (optional `stream()`) | ✅ | `token:stream` events from all providers that support server-sent-event streaming |
| C-15 | Tool Executor | `agent-executor/src/lib/tool-executor.ts` | ✅ | Built-in tool dispatch for `read-file`, `write-file`, `run-command`, `search-files` |
| C-16 | Demo / Mock Provider | `agent-executor/src/lib/providers/mock.provider.ts` | ✅ | Zero-API-key scripted responses; word-by-word streaming simulation |

---

## Check Handlers (P0)

| ID | Handler | Source file | Status |
|----|---------|------------|--------|
| CH-01 | `file-exists` | `checks/file-exists.handler.ts` | ✅ |
| CH-02 | `dir-exists` | `checks/dir-exists.handler.ts` | ✅ |
| CH-03 | `count-files` | `checks/count-files.handler.ts` | ✅ |
| CH-04 | `count-dirs` | `checks/count-dirs.handler.ts` | ✅ |
| CH-05 | `grep` | `checks/grep.handler.ts` | ✅ |
| CH-06 | `json-has-key` | `checks/json-has-key.handler.ts` | ✅ |
| CH-07 | `json-field` | `checks/json-field.handler.ts` | ✅ |
| CH-08 | `run-command` | `checks/run-command.handler.ts` | ✅ |
| CH-09 | `llm-review` | `checks/llm-review.handler.ts` | ✅ |
| CH-10 | `llm-generate` | `checks/llm-generate.handler.ts` | ✅ |
| CH-11 | `llm-tool` | `checks/llm-tool.handler.ts` | ✅ |

---

## LLM Providers (P0)

| ID | Provider | Source file | Status | Notes |
|----|---------|------------|--------|-------|
| P-01 | Anthropic (Claude) | `providers/anthropic.provider.ts` | ✅ | Messages API; streaming; tool-use |
| P-02 | OpenAI (GPT) | `providers/openai.provider.ts` | ✅ | Chat completions; streaming; tool-use |
| P-03 | Ollama | `providers/ollama.provider.ts` | ✅ | Local inference; streaming |
| P-04 | Gemini | `providers/gemini.provider.ts` | ✅ | Google AI; streaming |
| P-05 | AWS Bedrock | `providers/bedrock.provider.ts` | ✅ | SigV4 auth via Node `crypto`; Converse API; auto-registered when AWS creds detected |
| P-06 | VS Code Language Model | `providers/vscode-sampling.provider.ts` | ✅ | VS Code extension API sampling (`lm.selectChatModels`) |
| P-07 | Mock (scripted) | `providers/mock.provider.ts` | ✅ | Zero-cost; word-streaming simulation |

---

## Resilience Patterns (P1)

| ID | Feature | Source file | Status | Notes |
|----|---------|------------|--------|-------|
| R-01 | Retry policy (exp. backoff) | `lib/retry-policy.ts` | ✅ | `retryBudget`, jitter, per-lane |
| R-02 | Circuit breaker | `lib/circuit-breaker.ts` | ✅ | CLOSED/OPEN/HALF_OPEN; per-provider; configurable failure threshold + cooldown |
| R-03 | Human review gate | `lib/human-review-gate.ts` | ✅ | `InteractiveHumanReviewGate` (stdin) + `AutoApproveHumanReviewGate` (CI) |

---

## Enterprise Features (E-series)

| ID | Feature | Source file(s) | Status | Notes |
|----|---------|---------------|--------|-------|
| E1 | PII scrubbing | `lib/pii-scrubber.ts` | ✅ | 10 built-in patterns (AWS key, GitHub token, JWT, SSH key, CC, etc.); `warn`/`block` mode; `custom-patterns` config; wraps any `LLMProvider` transparently |
| E2 | Security CI audit | `SECURITY.md`, `.github/workflows/security-audit.yml` | ✅ | `pnpm audit --audit-level=high` on every push/PR |
| E3 | Multi-tenant isolation | `lib/tenant-registry.ts` | ✅ | Per-tenant path-isolated run roots under `.agents/tenants/<tenantId>/`; `AIKIT_TENANT_ID` env var |
| E4 | GDPR CLI | `cli/src/commands/run-data-export.ts`, `run-data-delete.ts`, `run-data-list-tenants.ts` | ✅ | `data:export`, `data:delete`, `data:list-tenants` commands implemented |
| E5 | OIDC JWT auth | `mcp/src/oidc/verify-jwt.ts` + `mcp/src/sse/sse-server.ts` | ✅ | RS256/ES256 Bearer token validated on `/events`; JWKS fetch with cache; `/health` open; `AIKIT_OIDC_ISSUER` env toggle |
| E6 | Rate limiting | `lib/rate-limiter.ts` → wired in `dag-orchestrator.ts` | ✅ | Per-principal: `tokenBudgetPerDay`, `maxConcurrentRuns`, `maxRunsPerHour`; reads from `rbac.json`; in-memory + JSON-persistent state |
| E7 | DAG visualizer | `cli/src/commands/run-visualize.ts` + `render-mermaid.ts` + `render-dot.ts` | ✅ | Mermaid + Graphviz DOT output from DAG JSON; `ai-kit visualize` command |
| E8 | Prompt injection detection | `lib/prompt-injection-detector.ts` → wired in `dag-orchestrator.ts` | ✅ | 10 signature families; confidence scoring (0.3/0.6/0.9); `warn`/`block` mode; `DagRunOptions.injectionDetection`; `skipRoles` + `customSignatures` extension points |
| E9 | Python MCP bridge | `lib/python-mcp-bridge.ts` | ✅ | **Fully implemented** (324 lines); JSON-RPC 2.0 over stdio; `initialize` handshake; `tools/list` + `tools/call`; `PythonMcpProvider` LLM adapter; ⚠️ enterprise-readiness doc incorrectly marks as backlog |
| E10 | AWS Bedrock provider | `lib/providers/bedrock.provider.ts` | ✅ | See P-05 above |
| E11 | Jira/Linear sync | `lib/issue-sync.ts` | ✅ | Subscribes to `DagEventBus`; creates Jira issues via REST (`Bearer` Basic Auth) and Linear issues via GraphQL on `dag:end` failure/partial |
| E12 | Slack/Teams notifications | `lib/notification-sink.ts` | ✅ | Incoming webhook (Slack + Teams); `failuresOnly`, `notifyLaneEnd`, `notifyBudget` options; zero SDK dependencies |
| E13 | Run advisor (auto-tune) | `lib/run-advisor.ts` → integrated in `dag-orchestrator.ts` | ✅ | 6 recommendation types; configurable thresholds; `ai-kit advise` CLI |
| E14 | Codernic | `code-assistant/indexer/codebase-indexer.ts` + `storage/codebase-index-store.ts` + `parsers/typescript-parser.ts` | ✅ | Codebase-aware coding agent: 449 files in 1.03s; symbol extraction (classes, functions, interfaces); dependency graph analysis; SQLite + FTS5 full-text search; incremental indexing; cross-platform path normalization; 581 tests (575 unit + 6 integration) |

---

## Security & Auth (P1)

| ID | Feature | Source file(s) | Status | Notes |
|----|---------|---------------|--------|-------|
| S-01 | RBAC policy | `lib/rbac.ts` | ✅ | File-based `.agents/rbac.json`; role → permissions; per-principal `laneRestrictions`; `assertCan()` / `can()` |
| S-02 | Audit log (hash-chained) | `lib/audit-log.ts` | ✅ | Append-only NDJSON; sha256 chain; `AuditLog.verify()` forensic check; events: `run-start/end`, `lane-start/end`, `checkpoint`, `verdict`, `llm-call`, `tool-call`, `human-review`, `budget-exceeded` |
| S-03 | Secrets management | `lib/secrets.ts` | ✅ | `EnvSecretsProvider`, `DotenvSecretsProvider`, `CompositeSecretsProvider`; injected via `DagRunOptions.secrets`; zero external deps |

---

## Developer Experience (P0–P1)

| ID | Feature | Source file(s) | Status | Notes |
|----|---------|---------------|--------|-------|
| DX-01 | CLI (`ai-kit`) | `packages/cli/src/` | ✅ | `plan`, `agent:dag`, `visualize`, `data:export/delete/list-tenants`, `advise`, `benchmark`, `mcp`, `init`, `sync`, `check` |
| DX-02 | TypeScript DAG Builder API | `lib/dag-builder.ts` | ✅ | Fluent `DagBuilder` + `LaneBuilder`; `.lane()`, `.check()`, `.barrier()`, `.budget()`, `.build()` |
| DX-03 | Plugin system | `lib/plugin-api.ts` + `checks/check-handler-registry.ts` | ✅ | `register` + `manifest` exports contract; `CheckHandlerRegistry.discover()` scans `node_modules` for `ai-kit-plugin-*` packages |
| DX-04 | JSON Schema / IDE support | `schemas/dag.schema.json`, `schemas/agent.schema.json` | ✅ | IntelliSense for `*.dag.json` and `*.agent.json` via VS Code JSON schema association |
| DX-05 | MCP Integration | `packages/mcp/src/` | ✅ | `McpServer` with DAG run tools; SSE transport; OIDC middleware; VS Code LM tool wiring |
| DX-06 | 5-Phase Plan System | `lib/plan-orchestrator.ts`, `discovery-session.ts`, `plan-synthesizer.ts`, `sprint-planner.ts`, `backlog.ts` | ✅ | BA discovery → synthesis → decomposition → dependency wiring → DAG handoff |
| DX-07 | Prompt distillation | `lib/distillation.ts` | ✅ | `saveExample()` / `loadExamples()`; few-shot injection into `PromptRegistry.render()` |
| DX-08 | Code execution sandbox | `lib/code-sandbox.ts` | ✅ | `runInSandbox()`; JS/TS/Python/Bash; temp-file isolation; configurable timeout + kill signal |
| DX-09 | LLM-as-judge eval harness | `lib/eval-harness.ts` | ✅ | `runEval()`; concurrent case execution; 0–1 scoring; `EvalReport` JSON output |

---

## Observability & Analytics (P1)

| ID | Feature | Source file(s) | Status | Notes |
|----|---------|---------------|--------|-------|
| O-01 | OpenTelemetry | `lib/otel.ts` | ⚠️ | Opt-in; zero hard dep — no-op when `@opentelemetry/api` not installed; `createRunTracer()` produces `dag.run`, `dag.lane`, `llm.call`, `tool.call` spans; set `OTEL_EXPORTER_OTLP_ENDPOINT` to activate |
| O-02 | CLI dashboard (Markdown) | `mcp/src/dashboard/build-dashboard.ts` | ✅ | `buildDashboard(projectRoot)` renders active + recent runs table from `manifest.json` |
| O-03 | Cost analytics | `lib/cost-tracker.ts` + `dag-result-builder.ts` | ✅ | Per-run + per-lane USD breakdown written to `results/dag-<runId>.json`; `RunAdvisor` summarises across history |
| O-04 | Run history / advisor | `lib/run-advisor.ts` | ✅ | See E13 |

---

## Integrations (P1–P2)

| ID | Feature | Source file(s) | Status | Notes |
|----|---------|---------------|--------|-------|
| I-01 | GitHub webhook trigger | `lib/webhook-trigger.ts` | ✅ | HMAC-SHA256 signature verification; event→DAG route table; graceful shutdown; zero external deps |
| I-02 | MCP SSE live API | `mcp/src/sse/` | ✅ | Real-time event streaming to external systems via SSE; OIDC-protected `/events` endpoint |
| I-03 | Issue sync (Jira/Linear) | `lib/issue-sync.ts` | ✅ | See E11 |
| I-04 | Slack/Teams notifications | `lib/notification-sink.ts` | ✅ | See E12 |
| I-05 | Python MCP bridge | `lib/python-mcp-bridge.ts` | ✅ | See E9 |
| I-06 | GitHub issue/PR sync | `lib/issue-sync.ts` (+ `cli/src/commands/run-sync.ts`) | ✅ | `ai-kit sync` command |

---

## Memory & Learning (P1)

| ID | Feature | Source file(s) | Status | Notes |
|----|---------|---------------|--------|-------|
| M-01 | In-memory vector store | `lib/vector-memory.ts` | ✅ | `store()`, `search()` (cosine similarity), `delete()`, `clear()`; namespace-isolated |
| M-02 | SQLite vector memory | `lib/sqlite-vector-memory.ts` | 🔌 | Production-grade persistence; WAL mode; requires `better-sqlite3`; falls back to no-op when package not installed |
| M-03 | Context manager | `lib/context-manager.ts` | ✅ | Sliding window token budget management for long lane conversations |
| M-04 | Prompt distillation | `lib/distillation.ts` | ✅ | See DX-07 |

---

## Backlog / Not yet implemented

| ID | Feature | Priority | Notes |
|----|---------|---------|-------|
| B-01 | Workflow orchestrator | P2 | `workflow-orchestrator.ts` exists in dist but not in source — likely removed or not yet ported to src |
| B-02 | SOC2 compliance certs | P2 | Process work: Vanta/Drata onboarding, pen test, BCP doc, annual access review |

---

## Doc Discrepancies Found During Scan

The following issues were found between documentation and actual source code:

| Location | Issue |
|----------|-------|
| `docs/enterprise-readiness.md` → E9 | Marked as **backlog** but `python-mcp-bridge.ts` is fully implemented (324 lines, complete MCP JSON-RPC protocol, `PythonMcpProvider` adapter, test suite at `__tests__/python-mcp-bridge.test.ts`) |
| `docs/features/INDEX.md` | References G-xx roadmap IDs (e.g. G-06, G-28) but no G-series master roadmap document exists in the repo — consolidated above |
| `internal-strategy-docs/` | Referenced in workspace tree but directory does not exist on disk |
| `agent-executor/src/lib/workflow-orchestrator.ts` | Present in `dist/lib/` (compiled) but missing from `src/lib/` — source may have been deleted or never committed |
