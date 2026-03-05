# Quickies — Copy-Paste Recipes

**Task-first, command-first guides.** Each recipe is designed to get you a useful
result in under 5 minutes with zero boilerplate.

Jump to the one you need:

| # | Task | Time |
|---|------|------|
| [Q1](#q1) | Get started from zero | 2 min |
| [Q2](#q2) | Build an app from scratch with a full AI plan | 5 min |
| [Q3](#q3) | Add a feature to an existing app | 5 min |
| [Q4](#q4) | Create a custom agent | 5 min |
| [Q5](#q5) | Generate detailed documentation for an existing app | 3 min |
| [Q6](#q6) | Security audit your application | 3 min |
| [Q7](#q7) | Brainstorm performance improvements for a data flow | 4 min |
| [Q8](#q8) | Refactor a legacy module with AI guidance | 4 min |
| [Q9](#q9) | Generate a test suite for an existing module | 3 min |
| [Q10](#q10) | Migrate a codebase to a new stack | 5 min |
| [Q11](#q11) | Onboard a new developer onto an unfamiliar codebase | 3 min |
| [Q12](#q12) | Post-mortem a failed run / production incident | 3 min |

---

<a id="q1"></a>
## Q1 — Get started from zero

**Goal:** Install, build, and watch the engine run — in 2 minutes.

```sh
# 1. Clone and install
git clone https://github.com/binaryjack/ai-starter-kit.git
cd ai-starter-kit
pnpm install

# 2. Build all packages
pnpm build

# 3. Run the original 3-lane mock demo (zero API keys)
pnpm demo

# 4. browse the results
ls .agents/results/
```

**You get:** Real-time parallel lane output, supervisor checkpoints, a saved
JSON result with findings and recommendations.

**Next:** Pick a scenario in `pnpm demo:menu` to see retries, escalations,
barriers, and human-review gates.

---

<a id="q2"></a>
## Q2 — Build an app from scratch with a full AI plan

**Goal:** Take an idea → 5-phase AI plan (discover → synthesize → decompose →
wire → execute) → ready-to-build task breakdown.

```sh
# Interactive: the BA agent interviews you (Phase 0 Q&A → through Phase 4)
pnpm run:plan

# OR skip the Q&A with a pre-seeded discovery and watch Phases 1–4 only:
pnpm demo:plan:01    # App Boilerplate seed  (greenfield API + SPA)
pnpm demo:plan:02    # Enterprise Skeleton   (auth, RBAC, multi-tenancy)
pnpm demo:plan:05    # MVP Sprint seed       (2-week solo product)
```

**Interactive session covers:**
- Phase 0: BA asks you ~12 structured questions (problem, users, stories, stack)
- Phase 1: BA synthesises a plan skeleton → you approve
- Phase 2: Architecture, Backend, Frontend, Testing agents fill in their tasks
- Phase 3: Dependency graph wired; alignment gates injected
- Phase 4: Wired plan executed via the DAG engine

**You get:** `.agents/plan-state/plan.json` — a fully decomposed, wired,
executable plan with every task assigned to an agent.

**Pro tip:** Run with a real provider for richer output:
```sh
ANTHROPIC_API_KEY=sk-... pnpm run:plan
```

---

<a id="q3"></a>
## Q3 — Add a feature to an existing app quickly

**Goal:** Drop a feature request into a running codebase and get a detailed
plan that respects what's already there.

```sh
# Use the Feature-in-Context plan seed (billing on top of existing platform):
pnpm demo:plan:04

# OR start interactively — answer "no" to "is this greenfield?":
pnpm run:plan
# → Phase 0 will ask about your existing stack, constraints, and the feature scope
```

**For the DAG-only fast path** (design + implementation plan, no full planning):
```sh
pnpm run:dag agents/demos/04-feature-in-context/feature.dag.json --provider mock
# Replace --provider mock with --provider anthropic + API key for real output
```

**You get:** Context-aware API design, data-model changes, implementation steps,
and test plan — all respecting your existing code contracts.

**See:** [Demo Scenario 04](demo-scenarios.md#04--feature-in-context) for a
detailed walkthrough of `read-contract` + `soft-align` coordination.

---

<a id="q4"></a>
## Q4 — Create a custom agent in 5 minutes

**Goal:** Wire up a new specialised agent (e.g. a `data-pipeline-reviewer`) in
under 5 minutes.

### Step 1 — Create the agent definition

```json
// agents/my-agents/data-pipeline-reviewer.agent.json
{
  "id": "data-pipeline-reviewer",
  "name": "Data Pipeline Reviewer",
  "description": "Reviews ETL pipelines for correctness, efficiency, and fault tolerance",
  "principal": "engineering",
  "steps": [
    {
      "id": "step-0",
      "name": "Scan pipeline config",
      "checks": [
        {
          "type": "file-exists",
          "path": "pipelines/",
          "failMessage": "No pipelines/ directory found",
          "failSeverity": "warning"
        },
        {
          "type": "llm-review",
          "taskType": "code-review",
          "prompt": "Review this ETL pipeline for: idempotency, error handling, retry logic, and data lineage. List concrete issues as findings."
        }
      ]
    },
    {
      "id": "step-1",
      "name": "Generate recommendations",
      "checks": [
        {
          "type": "llm-generate",
          "taskType": "architecture-decision",
          "prompt": "Based on the pipeline review, generate a prioritised list of improvement recommendations with effort estimates."
        }
      ]
    }
  ]
}
```

### Step 2 — Create the supervisor

```json
// agents/my-agents/data-pipeline-reviewer.supervisor.json
{
  "agentId": "data-pipeline-reviewer",
  "retryBudget": 1,
  "checkpoints": [
    {
      "afterStep": "step-0",
      "mode": "self",
      "expect": {
        "minFindings": 1
      },
      "onFail": "RETRY",
      "retryInstructions": "Be more specific — list at least one concrete pipeline issue as a finding."
    },
    {
      "afterStep": "step-1",
      "mode": "self",
      "expect": {
        "minFindings": 1,
        "noErrorFindings": false
      },
      "onFail": "ESCALATE"
    }
  ]
}
```

### Step 3 — Wire it into a DAG

```json
// agents/my-agents/pipeline-audit.dag.json
{
  "id": "pipeline-audit",
  "name": "Pipeline Audit",
  "modelRouterFile": "../../agents/model-router.json",
  "lanes": [
    {
      "id": "reviewer",
      "agentFile": "data-pipeline-reviewer.agent.json",
      "supervisorFile": "data-pipeline-reviewer.supervisor.json"
    }
  ]
}
```

### Step 4 — Run it

```sh
pnpm run:dag agents/my-agents/pipeline-audit.dag.json --provider mock
# With a real LLM:
ANTHROPIC_API_KEY=sk-... pnpm run:dag agents/my-agents/pipeline-audit.dag.json
```

**Check types available:** `file-exists` · `llm-review` · `llm-generate` · `grep-check` · `shell-check` · `json-schema` · `plugin:<name>`

**Supervisor `onFail` options:** `RETRY` · `HANDOFF` · `ESCALATE`

**Checkpoint modes:** `self` · `read-contract` · `soft-align` · `hard-barrier` · `needs-human-review`

---

<a id="q5"></a>
## Q5 — Generate detailed documentation for an existing app

**Goal:** Get a comprehensive technical documentation package for a codebase
you didn't write (or forgot).

```sh
# Create a one-lane DAG that reads your project and generates docs
cat > /tmp/doc-gen.dag.json << 'EOF'
{
  "id": "doc-gen",
  "name": "Documentation Generator",
  "modelRouterFile": "agents/model-router.json",
  "lanes": [
    {
      "id": "doc-writer",
      "agentFile": "agents/03-backend.agent.json",
      "supervisorFile": "agents/backend.supervisor.json"
    }
  ]
}
EOF

pnpm run:dag /tmp/doc-gen.dag.json --provider mock
```

**For the best result, use the plan system:**
```sh
pnpm run:plan
# Phase 0 answers:
#   type    → "spike" (exploration)
#   stories → "Generate architecture doc, API reference, onboarding guide"
#   isGreenfield → "no"
#   stackConstraints → describe your existing stack
```

**You get:** Architecture overview, API contract catalogue, decision log,
onboarding checklist — all from static code analysis + LLM synthesis.

---

<a id="q6"></a>
## Q6 — Security audit your application

**Goal:** Run a structured security review across your codebase in minutes.

```sh
# Quick mock run to see the audit format:
pnpm run:dag agents/demo-security.agent.json --provider mock

# For a real audit against your code:
ANTHROPIC_API_KEY=sk-... pnpm run:dag agents/security-review.agent.json --verbose
```

**To create a project-specific audit DAG:**
```json
// agents/my-security-audit.dag.json
{
  "id": "security-audit",
  "name": "Security Audit",
  "modelRouterFile": "agents/model-router.json",
  "lanes": [
    {
      "id": "security",
      "agentFile": "agents/security-review.agent.json",
      "supervisorFile": "agents/security-review.supervisor.json"
    },
    {
      "id": "dependency-audit",
      "agentFile": "agents/dependency-audit.agent.json",
      "supervisorFile": "agents/dependency-audit.supervisor.json"
    }
  ]
}
```

```sh
pnpm run:dag agents/my-security-audit.dag.json --provider anthropic
```

**You get:** OWASP-aligned findings, dependency CVE summary, severity-ranked
recommendations, and escalation if critical issues are found.

**Pro tip:** Use `--verbose` to see each finding as it's emitted, not just the
final summary.

---

<a id="q7"></a>
## Q7 — Brainstorm performance improvements for a data flow

**Goal:** Get an AI-facilitated brainstorm session that produces prioritised,
actionable performance improvements.

```sh
# Use the plan system with a "spike" story type
pnpm run:plan

# Answer Phase 0 questions like this:
#   projectName       → "my-dataflow-perf"
#   type              → "spike"
#   problem           → "ETL pipeline takes 45 min, target is <5 min"
#   layers            → "backend", "database"
#   isGreenfield      → "no"
#   stories           → [
#     "Profile current bottlenecks",
#     "Identify parallelisation opportunities",
#     "Propose chunking / streaming strategy",
#     "Estimate effort for top 3 improvements"
#   ]
#   qualityGrade      → "mvp"    ← keeps the session focused
#   timelinePressure  → "medium"
```

**Or use a quick one-shot DAG:**
```sh
# Run the architecture agent on your pipeline files:
ANTHROPIC_API_KEY=sk-... \
  pnpm run:dag agents/02-architecture.agent.json \
  --verbose \
  --provider anthropic
```

**You get:** Bottleneck analysis, parallelisation proposals, streaming/chunking
strategies, and a ranked backlog of improvements with effort estimates.

---

<a id="q8"></a>
## Q8 — Refactor a legacy module with AI guidance

**Goal:** Get a step-by-step refactoring plan for a module you're afraid to
touch.

```sh
pnpm run:plan

# Phase 0 answers:
#   type              → "refactor"
#   isGreenfield      → "no"
#   stories           → [
#     "Identify all callers and side-effects of the legacy module",
#     "Design strangler-fig wrapper to decouple callers",
#     "Extract pure functions; eliminate global state",
#     "Add characterisation tests before touching anything"
#   ]
#   stackConstraints  → "must not break existing public API"
#   qualityGrade      → "enterprise"
```

**You get:** Strangler-fig migration plan, call-graph analysis, test surface
definition, and a sequenced task list ordered to keep CI green throughout.

**Pro tip:** Feed the agent the actual module path via a `file-exists` or
`grep-check` in your agent definition (see [Q4](#q4)) to ground it in real code.

---

<a id="q9"></a>
## Q9 — Generate a test suite for an existing module

**Goal:** Point the testing agent at a module and get a full test plan with
unit, integration, and edge-case coverage.

```sh
# Quick mock run (see test plan format):
pnpm run:dag agents/05-testing.agent.json --provider mock

# Real run against your module:
ANTHROPIC_API_KEY=sk-... pnpm run:dag agents/05-testing.agent.json --verbose

# Or run both testing + e2e agents in parallel:
cat > /tmp/test-suite.dag.json << 'EOF'
{
  "id": "test-suite",
  "name": "Test Suite Generator",
  "modelRouterFile": "agents/model-router.json",
  "lanes": [
    { "id": "unit-tests",  "agentFile": "agents/05-testing.agent.json",  "supervisorFile": "agents/testing.supervisor.json" },
    { "id": "e2e-tests",   "agentFile": "agents/06-e2e.agent.json",       "supervisorFile": "agents/e2e.supervisor.json" }
  ]
}
EOF

pnpm run:dag /tmp/test-suite.dag.json --provider anthropic
```

**You get:** Test file stubs, describe/it structure, mocking strategy,
edge-case inventory, and coverage target per file.

---

<a id="q10"></a>
## Q10 — Migrate a codebase to a new stack

**Goal:** Get a phased migration plan from your current stack to a target stack
— with parallel tracks for infrastructure, backend, and frontend.

```sh
pnpm run:plan

# Phase 0 answers:
#   type              → "migration"
#   isGreenfield      → "no"
#   problem           → "Migrate Express + Sequelize + Vue 2 → NestJS + Prisma + React 18"
#   stories           → [
#     "Migrate database layer to Prisma (schema-first)",
#     "Migrate Express routes to NestJS modules",
#     "Replace Vue 2 SPA with React 18 (feature-flagged dual-serve)",
#     "CI/CD migration pipeline with rollback gates"
#   ]
#   stackConstraints  → "zero downtime; keep old and new running in parallel per feature flag"
#   qualityGrade      → "enterprise"
#   timelinePressure  → "low"
```

**You get:** Strangler-fig migration DAG, per-layer task breakdown, alignment
gates between layers, rollback checkpoints, and a definition-of-done for each
phase.

---

<a id="q11"></a>
## Q11 — Onboard a new developer onto an unfamiliar codebase

**Goal:** Generate a structured codebase tour — architecture map, key files,
data flows, and a 3-day onboarding checklist.

```sh
# Visualise the existing agent DAG structure first:
pnpm run:dag agents/dag.json --provider mock --verbose

# Generate architecture diagram:
node packages/cli/dist/bin/ai-kit.js dag:visualize agents/dag.json --format mermaid

# Or run a dedicated onboarding plan:
pnpm run:plan

# Phase 0 answers:
#   type              → "spike"
#   stories           → [
#     "Generate architecture overview document",
#     "Map key data flows end-to-end",
#     "Identify top 10 files a new developer must read",
#     "Create 3-day onboarding checklist"
#   ]
#   qualityGrade      → "mvp"   ← keeps scope tight
```

**You get:** Architecture doc, annotated file map, data-flow diagrams in
Mermaid, and a day-by-day onboarding plan.

---

<a id="q12"></a>
## Q12 — Post-mortem a failed run / production incident

**Goal:** Take a failed DAG result JSON and produce a structured post-mortem
with root cause, timeline, and remediation steps.

```sh
# 1. Find the failed run result
ls .agents/results/

# 2. Pass it through the security/review agent as context:
ANTHROPIC_API_KEY=sk-... \
  node packages/cli/dist/bin/ai-kit.js agent:dag \
  agents/demo-summary.agent.json \
  --provider anthropic \
  --verbose

# 3. Or use the Resilience Showcase to study all failure types first:
pnpm demo:06
# Then inspect the saved result:
cat .agents/results/dag-$(ls -t .agents/results/ | head -1)
```

**For a real incident, create a one-shot summary DAG:**
```json
{
  "id": "post-mortem",
  "name": "Incident Post-Mortem",
  "modelRouterFile": "agents/model-router.json",
  "lanes": [
    {
      "id": "analysis",
      "agentFile": "agents/demo-summary.agent.json",
      "supervisorFile": "agents/demo-summary.supervisor.json"
    }
  ]
}
```

```sh
pnpm run:dag agents/post-mortem.dag.json --provider anthropic --verbose
```

**You get:** Timeline reconstruction, root-cause analysis, contributing factors,
and a remediation checklist with owner assignments.

---

## Cheat-sheet

```sh
# Zero-API-key demo
pnpm demo                          # 3-lane original demo
pnpm demo:menu                     # pick from 6 advanced scenarios
pnpm demo:06                       # all error types in parallel (best first run)

# Plan system
pnpm run:plan                      # full interactive 5-phase plan
pnpm demo:plan                     # seed Phase 0, start from SYNTHESIZE
pnpm demo:plan:01 … demo:plan:05   # specific project-type seeds

# DAG execution
pnpm run:dag <dag.json>                         # run any DAG (mock default)
pnpm run:dag <dag.json> --provider anthropic    # real LLM
pnpm run:dag <dag.json> --verbose               # show all findings live
pnpm run:dag <dag.json> --interactive           # pause at needs-human-review gates

# Visualise
node packages/cli/dist/bin/ai-kit.js dag:visualize <dag.json>             # Mermaid
node packages/cli/dist/bin/ai-kit.js dag:visualize <dag.json> --format dot  # Graphviz

# Results
ls .agents/results/                # browse run outputs
cat .agents/results/<run-id>.json  # full result JSON
```

---

**📖 Related:**
- [Advanced Demo Scenarios](demo-scenarios.md) — deep-dive on RETRY / HANDOFF / ESCALATE / barrier
- [DAG Orchestration](features/01-dag-orchestration.md) — full engine reference
- [Enterprise Readiness](enterprise-readiness.md) — auth, RBAC, audit, multi-tenancy
