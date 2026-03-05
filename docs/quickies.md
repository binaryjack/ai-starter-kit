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
| **Enterprise** | | |
| [Q13](#q13) | Enterprise adoption — introduce it to your org | 5 min |
| [Q14](#q14) | Enterprise security hardening + compliance gate | 5 min |
| [Q15](#q15) | Enterprise onboarding at scale (multi-squad) | 5 min |
| [Q16](#q16) | Tips & hints — power-user techniques | 2 min |
| [Q17](#q17) | Large-scale projects — multi-squad coordination | 5 min |
| [Q18](#q18) | Avoid regressions — CI gate + supervisor as guard | 4 min |
| [Q19](#q19) | Data migration planning + validation | 5 min |

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
ai-kit plan

# OR skip the Q&A with a pre-seeded discovery and watch Phases 1–4 only
# (requires the monorepo — see README → Explore Without Code):
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
ANTHROPIC_API_KEY=sk-... ai-kit plan
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
ai-kit plan
# → Phase 0 will ask about your existing stack, constraints, and the feature scope
```

**For the DAG-only fast path** (design + implementation plan, no full planning):
```sh
ai-kit agent:dag agents/demos/04-feature-in-context/feature.dag.json --provider mock
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
ai-kit agent:dag agents/my-agents/pipeline-audit.dag.json --provider mock
# With a real LLM:
ANTHROPIC_API_KEY=sk-... ai-kit agent:dag agents/my-agents/pipeline-audit.dag.json
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

ai-kit agent:dag /tmp/doc-gen.dag.json --provider mock
```

**For the best result, use the plan system:**
```sh
ai-kit plan
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
ai-kit agent:dag agents/demo-security.agent.json --provider mock

# For a real audit against your code:
ANTHROPIC_API_KEY=sk-... ai-kit agent:dag agents/security-review.agent.json --verbose
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
ai-kit agent:dag agents/my-security-audit.dag.json --provider anthropic
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
ai-kit plan

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
  ai-kit agent:dag agents/02-architecture.agent.json \
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
ai-kit plan

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
ai-kit agent:dag agents/05-testing.agent.json --provider mock

# Real run against your module:
ANTHROPIC_API_KEY=sk-... ai-kit agent:dag agents/05-testing.agent.json --verbose

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

ai-kit agent:dag /tmp/test-suite.dag.json --provider anthropic
```

**You get:** Test file stubs, describe/it structure, mocking strategy,
edge-case inventory, and coverage target per file.

---

<a id="q10"></a>
## Q10 — Migrate a codebase to a new stack

**Goal:** Get a phased migration plan from your current stack to a target stack
— with parallel tracks for infrastructure, backend, and frontend.

```sh
ai-kit plan

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
ai-kit agent:dag agents/dag.json --provider mock --verbose

# Generate architecture diagram:
node packages/cli/dist/bin/ai-kit.js dag:visualize agents/dag.json --format mermaid

# Or run a dedicated onboarding plan:
ai-kit plan

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
ai-kit agent:dag agents/post-mortem.dag.json --provider anthropic --verbose
```

**You get:** Timeline reconstruction, root-cause analysis, contributing factors,
and a remediation checklist with owner assignments.

---

<a id="q13"></a>
## Q13 — Enterprise adoption: introduce it to your org

**Goal:** Prove value to stakeholders, clear the security review, and get the
first team running in production — without a 6-month rollout.

### Week 1 — Proof of concept (no API keys yet)

```sh
# Clone and run the resilience showcase — nothing to install beyond pnpm
pnpm install && pnpm build
pnpm demo:06   # all engine behaviours in one run; show logs to the team
```

This single command demonstrates: parallel execution, supervised retries,
handoffs, escalations, hard barriers, and human-review gates. Share the
`.agents/results/` JSON with stakeholders as evidence of audit trail.

### Week 1 — Security review checklist

```sh
# Run the built-in dependency CVE audit:
pnpm audit --audit-level=high

# Run the security-review DAG against your actual codebase:
ANTHROPIC_API_KEY=sk-... ai-kit agent:dag agents/security-review.agent.json --verbose

# Generate OIDC JWT auth tokens for the SSE endpoint:
# See docs/enterprise-readiness.md → E5 OIDC JWT Auth
```

**Key compliance properties to document for your security team:**
- All runs are append-only — results written to `.agents/results/<uuid>.json`, never overwritten
- RBAC via principal field on every run (E5 — OIDC JWT, E3 — multi-tenant isolation)
- PII scrubbing active by default for findings and logs (E1)
- Prompt injection detection on all LLM inputs (E8)
- Full audit log: every lane start/end/verdict is timestamped

### Week 2 — First real team run

```sh
# Seed a project discovery relevant to your team:
ai-kit plan
# or use a pre-built seed:
pnpm demo:plan:02   # Enterprise Skeleton — auth, RBAC, multi-tenancy
```

**Adoption path:** mock → anthropic on dev → anthropic on CI → production  
**You get:** A concrete output the team owns, audit evidence, and a reusable
`.dag.json` template for the next project.

**📖 See:** [Enterprise Readiness](enterprise-readiness.md)

---

<a id="q14"></a>
## Q14 — Enterprise security hardening + compliance gate

**Goal:** Add a security lane to any DAG as a mandatory compliance gate —
blocking progress until it passes or escalates for human review.

### Add a security gate to an existing DAG

```json
// In your existing dag.json, add this lane:
{
  "id": "security-gate",
  "agentFile": "agents/security-review.agent.json",
  "supervisorFile": "agents/security-review.supervisor.json"
}
```

To make a downstream lane **wait** for the security gate:
```json
{
  "id": "deploy",
  "dependsOn": ["security-gate"],
  "agentFile": "agents/deployment-config.agent.json",
  "supervisorFile": "agents/deployment-config.supervisor.json"
}
```

### Security supervisor with human-review fallback

```json
// agents/security-gate.supervisor.json
{
  "agentId": "security-review",
  "retryBudget": 1,
  "checkpoints": [
    {
      "afterStep": "step-0",
      "mode": "self",
      "expect": { "noErrorFindings": true },
      "onFail": "RETRY",
      "retryInstructions": "Re-examine all OWASP Top 10 categories. List every ❌ finding explicitly."
    },
    {
      "afterStep": "step-1",
      "mode": "needs-human-review",
      "expect": { "noErrorFindings": true },
      "onFail": "ESCALATE"
    }
  ]
}
```

With `mode: "needs-human-review"` the gate **pauses** when run with
`--interactive`, letting a security engineer approve or reject before the DAG
continues.

```sh
# Run with interactive security gate:
ai-kit agent:dag my-project.dag.json --provider anthropic --interactive
```

**Compliance properties enforced automatically:**
- E1 PII scrubbing on all findings
- E6 Rate limiting per principal (prevents runaway cost in CI)
- E8 Prompt injection detection on all LLM inputs
- E5 OIDC JWT — gate the SSE endpoint with `Authorization: Bearer <token>`

**📖 See:** [Enterprise Readiness](enterprise-readiness.md) · [Resilience Patterns](features/07-resilience-patterns.md)

---

<a id="q15"></a>
## Q15 — Enterprise onboarding at scale (multi-squad)

**Goal:** Get 5 squads running their first projects within one sprint — with a
shared model router, isolated tenant paths, and a common supervisor baseline.

### Step 1 — One shared model router for the org

```json
// agents/org/model-router.json
{
  "defaultProvider": "anthropic",
  "budgetUsd": 5.00,
  "profiles": {
    "file-analysis":          { "provider": "anthropic", "model": "claude-haiku-4-5" },
    "code-review":            { "provider": "anthropic", "model": "claude-sonnet-4-5" },
    "architecture-decision":  { "provider": "anthropic", "model": "claude-opus-4-5" },
    "security-review":        { "provider": "anthropic", "model": "claude-opus-4-5" }
  }
}
```

Each squad's DAG points to this central file:
```json
{ "modelRouterFile": "../../agents/org/model-router.json" }
```

### Step 2 — Multi-tenant isolation per squad

Every `agent:dag` run takes an optional `--principal` flag:
```sh
# Squad A run — results isolated under .agents/tenants/squad-a/
ai-kit agent:dag squad-a/sprint-01.dag.json --principal squad-a --provider anthropic

# Squad B run — fully isolated
ai-kit agent:dag squad-b/sprint-01.dag.json --principal squad-b --provider anthropic
```

Tenant paths are enforced at the engine level (E3) — squads cannot read each
other's results.

### Step 3 — Shared supervisor baseline

Create one `org-baseline.supervisor.json` that all squads extend:
```json
// agents/org/baseline.supervisor.json
{
  "retryBudget": 2,
  "checkpoints": [
    {
      "afterStep": "step-0",
      "mode": "self",
      "expect": { "minFindings": 1, "noErrorFindings": false },
      "onFail": "RETRY"
    }
  ]
}
```

Squad-specific supervisors can reference it and override only what differs.

### Step 4 — CI gate for every squad

```yaml
# .github/workflows/ai-review.yml
jobs:
  ai-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install && pnpm build
      - run: ai-kit agent:dag agents/security-review.agent.json --provider mock
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

**You get:** Isolated run roots, shared cost controls, a common security
baseline, and CI-enforced quality gates — all from day one.

---

<a id="q16"></a>
## Q16 — Tips & hints

**Power-user techniques that aren't obvious from the docs.**

### Always start with `demo:06`
Before building anything custom, run the resilience showcase once:
```sh
pnpm demo:06
```
Reading the log side-by-side with [demo-scenarios.md](demo-scenarios.md) teaches
you exactly what to expect from every verdict and checkpoint mode.

### Use `--dry-run` to validate DAG files without executing
```sh
# Validates JSON, checks agent/supervisor files exist, confirms model router resolves:
node packages/cli/dist/bin/ai-kit.js agent:dag my.dag.json --dry-run
```

### Use `dag:visualize` before every code review
```sh
node packages/cli/dist/bin/ai-kit.js dag:visualize agents/dag.json --format mermaid
# Paste output into GitHub PR description for instant architecture review
```

### `retryBudget: 0` is a strict gate
A supervisor with `retryBudget: 0` passes or immediately escalates — no second
chance. Use it for **must-pass** checks (e.g. licence scan, PII check) where a
retry would be meaningless.

### Parallel lanes are free — use them
Anything without a `dependsOn` runs in the same parallel group. Put slow lanes
(architecture, security) alongside fast ones for maximum throughput:
```json
"lanes": [
  { "id": "requirements" },
  { "id": "security-baseline" },  ← runs simultaneously with requirements
  { "id": "dependency-audit" }   ← same group
]
```

### `soft-align` is cheaper than `hard-barrier`
`hard-barrier` blocks all participants until all commit. `soft-align` just waits
up to `timeoutMs` then continues with a snapshot. Use hard-barrier only when
the downstream lane **must** see both contracts simultaneously.

### Use mock mode in CI, real LLM only on feature branches
```sh
# CI: fast, $0, catches structural issues
ai-kit agent:dag agents/dag.json --provider mock

# Feature branches: real output when you need it
ANTHROPIC_API_KEY=sk-... ai-kit agent:dag agents/dag.json
```

### Result JSON is machine-readable for downstream tooling
```sh
# Pipe findings into jq for alerting / dashboards:
cat .agents/results/dag-<id>.json \
  | jq '[.lanes[] | select(.status=="escalated") | {lane:.id, reason:.escalationReason}]'
```

### `--interactive` + `needs-human-review` = approval workflow
Any lane with `mode: "needs-human-review"` becomes a blocking approval gate
when `--interactive` is set. Wire this into a Slack/Teams webhook (E12) to
page the right person instead of waiting at a terminal.

---

<a id="q17"></a>
## Q17 — Large-scale projects: multi-squad coordination

**Goal:** Run a project where multiple squads own different parts of the DAG,
with hard synchronisation points between them.

### Pattern: Layered DAG with inter-squad barriers

```json
// agents/platform-v2.dag.json
{
  "id": "platform-v2",
  "name": "Platform v2 — Multi-squad",
  "modelRouterFile": "agents/org/model-router.json",
  "barriers": [
    { "id": "contracts-frozen", "participants": ["api-design", "data-model", "event-schema"] },
    { "id": "all-modules-ready", "participants": ["auth", "billing", "notifications", "search"] }
  ],
  "lanes": [
    { "id": "api-design",     "dependsOn": [] },
    { "id": "data-model",     "dependsOn": [] },
    { "id": "event-schema",   "dependsOn": [] },
    { "id": "auth",           "dependsOn": ["api-design", "data-model"] },
    { "id": "billing",        "dependsOn": ["api-design", "data-model"] },
    { "id": "notifications",  "dependsOn": ["event-schema"] },
    { "id": "search",         "dependsOn": ["data-model"] },
    { "id": "integration",    "dependsOn": ["auth", "billing", "notifications", "search"] }
  ]
}
```

**Execution flow:**
1. `api-design` + `data-model` + `event-schema` run **simultaneously**
2. `contracts-frozen` barrier releases when all 3 commit
3. `auth`, `billing`, `notifications`, `search` run **simultaneously** (4 squads in parallel)
4. `all-modules-ready` barrier releases when all 4 commit
5. `integration` runs — sees all contracts from both barriers

### Practical squad coordination rules

| Rule | Why |
|------|-----|
| Each squad owns exactly one lane (or one sub-DAG) | Avoids merge conflicts on JSON files |
| Use `hard-barrier` only at major milestones | Too many barriers kill parallelism |
| Publish explicit contracts at barriers | Downstream lanes must not read internal state |
| Set budget per squad via `principal` | Prevents one squad burning the org's cost limit |
| Run `dag:visualize` before every sprint review | Makes the dependency graph visible to everyone |

### Scaling checklist
- [ ] One central `model-router.json` with per-task profiles
- [ ] Per-principal `budgetUsd` in the router
- [ ] E3 multi-tenant isolation — one `basePath` per squad
- [ ] E12 Slack/Teams webhook on DAG end for squad notifications
- [ ] E11 Jira/Linear sync on lane escalation for automatic ticket creation
- [ ] CI runs mock mode; production runs real LLM gated by `needs-human-review`

**📖 See:** [DAG Orchestration](features/01-dag-orchestration.md) · [Enterprise Readiness](enterprise-readiness.md)

---

<a id="q18"></a>
## Q18 — Avoid regressions: CI gate + supervisor as guard-rail

**Goal:** Catch regressions automatically — before they reach main.

### Strategy 1 — Run the mock DAG on every PR

```yaml
# .github/workflows/ai-gate.yml
name: AI Quality Gate
on: [pull_request]
jobs:
  ai-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: '10' }
      - run: pnpm install && pnpm build
      - name: Run DAG quality gate (mock)
        run: ai-kit agent:dag agents/dag.json --provider mock
        # Exits non-zero if any lane ESCALATES → PR blocked
```

A non-zero exit from `agent:dag` means at least one lane escalated. GitHub
automatically blocks the PR merge.

### Strategy 2 — Supervisor `noErrorFindings` as a hard guard-rail

Add a `file-exists` check for critical artefacts in your supervisor:
```json
{
  "afterStep": "step-0",
  "mode": "self",
  "expect": {
    "noErrorFindings": true   ← any ❌ finding blocks this lane
  },
  "onFail": "ESCALATE"        ← no retry, no mercy
}
```

This turns missing files (Dockerfile, .env.example, prisma/schema.prisma,
tests/, openapi.yaml …) into hard PR blockers.

### Strategy 3 — Characterisation test DAG (run before refactors)

```sh
# Capture current behaviour as baseline:
ai-kit agent:dag agents/05-testing.agent.json --provider anthropic
cp .agents/results/dag-<id>.json .agents/baseline-$(date +%Y%m%d).json

# After refactor, diff findings against baseline:
node -e "
  const a = require('.agents/baseline-YYYYMMDD.json');
  const b = require('.agents/results/dag-NEW.json');
  const lost = a.findings.filter(f => !b.findings.includes(f));
  if (lost.length) { console.error('REGRESSION:', lost); process.exit(1); }
"
```

### Strategy 4 — `retryBudget: 0` + `onFail: ESCALATE` for zero-tolerance checks

```json
// In supervisor — no retry allowed on licence or PII checks:
{
  "afterStep": "licence-scan",
  "mode": "self",
  "expect": { "noErrorFindings": true },
  "retryBudget": 0,
  "onFail": "ESCALATE"
}
```

**You get:** Automatic regression detection in CI, hard artefact guards,
behavioural baselines, and zero-tolerance gates — all without additional tooling.

**📖 See:** [Resilience Patterns](features/07-resilience-patterns.md)

---

<a id="q19"></a>
## Q19 — Data migration planning + validation

**Goal:** Plan a safe, validated data migration with parallel preparation tracks,
a hard sync point before cutover, and automated rollback guidance.

### Step 1 — Use the plan system with `migration` story type

```sh
ai-kit plan

# Phase 0 answers:
#   type              → "migration"
#   isGreenfield      → "no"
#   problem           → "Migrate 50M rows from MySQL 5.7 to PostgreSQL 16
#                        with zero downtime and < 5 min RPO"
#   layers            → "database", "backend"
#   stories           → [
#     "Schema translation (MySQL → Postgres DDL)",
#     "Data type mapping and edge-case catalogue",
#     "Dual-write adapter (write to both DBs during cutover window)",
#     "Validation suite — row counts, checksums, FK integrity",
#     "Rollback runbook"
#   ]
#   qualityGrade      → "enterprise"
#   timelinePressure  → "low"
```

### Step 2 — Migration DAG with hard-barrier before cutover

```json
{
  "id": "data-migration",
  "name": "MySQL → PostgreSQL Migration",
  "modelRouterFile": "agents/org/model-router.json",
  "barriers": [
    {
      "id": "pre-cutover-gate",
      "participants": ["schema-translation", "validation-suite", "rollback-plan"]
    }
  ],
  "lanes": [
    {
      "id": "schema-translation",
      "agentFile": "agents/03-backend.agent.json",
      "supervisorFile": "agents/backend.supervisor.json"
    },
    {
      "id": "validation-suite",
      "agentFile": "agents/05-testing.agent.json",
      "supervisorFile": "agents/testing.supervisor.json"
    },
    {
      "id": "rollback-plan",
      "agentFile": "agents/02-architecture.agent.json",
      "supervisorFile": "agents/architecture.supervisor.json"
    },
    {
      "id": "cutover",
      "dependsOn": ["schema-translation", "validation-suite", "rollback-plan"],
      "agentFile": "agents/03-backend.agent.json",
      "supervisorFile": "agents/backend.supervisor.json"
    }
  ]
}
```

The `pre-cutover-gate` hard-barrier ensures `cutover` cannot start until all
three preparation lanes have committed their contracts.

### Step 3 — Add a `needs-human-review` checkpoint on the cutover lane

```json
// agents/cutover.supervisor.json
{
  "agentId": "backend",
  "retryBudget": 0,
  "checkpoints": [
    {
      "afterStep": "step-0",
      "mode": "needs-human-review",
      "expect": { "minFindings": 1 },
      "onFail": "ESCALATE"
    }
  ]
}
```

```sh
# Run with human gate active — DBA approves cutover interactively:
ai-kit agent:dag agents/data-migration.dag.json --provider anthropic --interactive
```

**You get:** Schema diff, type-mapping catalogue, validation suite with row-count
and checksum queries, dual-write adapter design, rollback runbook — and a
human gate that blocks cutover until a DBA approves.

**Pro tip:** Run the full DAG in mock first to verify the barrier and gate logic
before spending LLM budget:
```sh
ai-kit agent:dag agents/data-migration.dag.json --provider mock
```

---

## Cheat-sheet

```sh
# ── Install ────────────────────────────────────────────────────────────────
npm install @ai-agencee/ai-kit-agent-executor   # engine (programmatic API)
npm install -g @ai-agencee/ai-kit-cli           # CLI

# ── DAG execution ──────────────────────────────────────────────────────────
ai-kit agent:dag <dag.json>                         # run any DAG (mock default)
ai-kit agent:dag <dag.json> --provider anthropic    # real LLM
ai-kit agent:dag <dag.json> --verbose               # show all findings live
ai-kit agent:dag <dag.json> --interactive           # pause at needs-human-review gates
ai-kit agent:dag <dag.json> --principal <squad-id>  # isolate results per squad/tenant

# ── Plan system ────────────────────────────────────────────────────────────
ai-kit plan                                     # full interactive 5-phase plan

# ── Visualise ──────────────────────────────────────────────────────────────
ai-kit dag:visualize <dag.json>                 # Mermaid (paste into PR)
ai-kit dag:visualize <dag.json> --format dot    # Graphviz

# ── Results ────────────────────────────────────────────────────────────────
ls .agents/results/                             # browse run outputs
cat .agents/results/<run-id>.json               # full result JSON
cat .agents/results/dag-<id>.json \
  | jq '[.lanes[]|select(.status=="escalated")]' # list escalated lanes in CI

# ── Enterprise ─────────────────────────────────────────────────────────────
pnpm audit --audit-level=high                   # dependency CVE scan (in your project)

# ── Explore without code (requires monorepo clone) ─────────────────────────
pnpm demo                          # 3-lane original demo
pnpm demo:menu                     # pick from 6 advanced scenarios
pnpm demo:06                       # all error types in parallel (best first run)
pnpm demo:plan                     # seed Phase 0, start from SYNTHESIZE
pnpm demo:plan:01 … demo:plan:05   # specific project-type seeds
```

---

**📖 Related:**
- [Advanced Demo Scenarios](demo-scenarios.md) — deep-dive on RETRY / HANDOFF / ESCALATE / barrier
- [DAG Orchestration](features/01-dag-orchestration.md) — full engine reference
- [Enterprise Readiness](enterprise-readiness.md) — auth, RBAC, audit, multi-tenancy
