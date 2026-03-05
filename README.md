# @tadeo/ai-starter-kit

> **Enterprise-grade multi-agent orchestration engine** — DAG-supervised parallel agents with streaming LLM output, retry back-off, circuit breakers, cost tracking, and a zero-API-key demo mode.

---

## What this is

`ai-starter-kit` is a TypeScript monorepo that turns JSON-defined agent graphs into production-ready AI workflows.  
It ships two separate execution paths that compose seamlessly:

| Path | Entry | When to use |
|---|---|---|
| **DAG Engine** | `agent:dag <dag.json>` | Parallel multi-lane analysis / review / generation |
| **Plan System** | `plan` interactive CLI | Discovery → Sprint planning → Architecture decisions → DAG hand-off |

---

## Packages

| Package | Description |
|---|---|
| `packages/agent-executor` | Core engine: DAG orchestrator, supervised agents, check handlers, model router, retry, circuit-breaker |
| `packages/cli` | `ai-kit` CLI — `init`, `sync`, `check`, `agent:dag`, `plan` |
| `packages/core` | Shared filesystem utilities and template scaffolding |
| `packages/mcp` | VS Code MCP bridge — zero-cost routing through GitHub Copilot |

---

## Quick start

```sh
pnpm install
pnpm build

# Run the 3-lane demo — NO API keys required
pnpm demo
```

The demo spins up three parallel lanes (code-review, security-scan, summary) using the mock provider and prints streaming token output to the console.

---

## Running a real DAG

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

---

## Model routing

Costs and model families are configured in [`agents/model-router.json`](agents/model-router.json):

| Task type | Family | Anthropic model | OpenAI model |
|---|---|---|---|
| `file-analysis` | haiku | claude-haiku-4-5 | gpt-4o-mini |
| `code-generation` | sonnet | claude-sonnet-4-5 | gpt-4o |
| `code-review` | sonnet | claude-sonnet-4-5 | gpt-4o |
| `architecture-decision` | opus | claude-opus-4-5 | gpt-4o |
| `security-review` | opus | claude-opus-4-5 | gpt-4o |

---

## Check handler types

Agents compose any mix of these typed checks:

| Type | Description |
|---|---|
| `file-exists` | Assert a file path is present |
| `dir-exists` | Assert a directory exists |
| `count-files` / `count-dirs` | Count files matching a glob |
| `grep` | Regex search inside text files |
| `json-field` / `json-has-key` | JSON schema / value assertions |
| `run-command` | Execute a shell command, inspect stdout/exit code |
| `llm-generate` | LLM generation with streaming output |
| `llm-review` | LLM review / critique with streaming output |

---

## Resilience (Sprint 3)

All LLM provider calls are protected by:

- **`RetryPolicy`** — exponential back-off with jitter; `RetryPolicy.forLLM()` preset (4 attempts, 1 s → 32 s max, 429/500/503 transient errors)
- **`CircuitBreaker`** — CLOSED → OPEN → HALF-OPEN state machine per provider; 5-failure threshold, 60 s cooldown; `stats()` method for observability dashboard

---

## Streaming

Every `llm-generate` and `llm-review` check streams tokens directly to `process.stdout` as they arrive.  
Providers: Anthropic (SSE), OpenAI (SSE + `stream_options`), VS Code Copilot (fallback to complete), Mock (word-level simulation).

---

## Plan System (5-phase)

```
Phase 0  Discovery       — BA questionnaire, persisted to .agents/plan-state/discovery.json
Phase 1  Synthesize       — LLM produces PlanDefinition   → plan.json
Phase 2  Decompose/Backlog — Sprint planning board         → backlog.json
Phase 3  Wire/Arbiter     — Cross-agent decisions          → decisions.json
Phase 4  DAG Hand-off     — Auto-generates dag.json + runs the DAG engine
```

Start the interactive plan session:

```sh
pnpm run:plan
```

---

## Development

```sh
pnpm install          # install all workspace deps
pnpm build            # compile all packages (tsc)
pnpm test             # run all Jest suites
pnpm demo             # build + run the mock demo
```

---

## License

MIT — see [LICENSE](LICENSE).
