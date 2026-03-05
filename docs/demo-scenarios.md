# Advanced Demo Scenarios

A guided tour of the DAG engine's full behaviour surface — failures, retries,
handoffs, escalations, barriers, and human-review gates — all runnable **without
any API keys** using the built-in `MockProvider`.

---

## Quick start

```bash
# Build once (compiles TypeScript packages)
pnpm build

# Interactive scenario picker
pnpm demo:menu

# Run a specific scenario directly
pnpm demo:01     # App Boilerplate    — RETRY × 2, hard-barrier
pnpm demo:02     # Enterprise Skeleton — HANDOFF, needs-human-review
pnpm demo:03     # Website Build       — ESCALATE terminal
pnpm demo:04     # Feature in Context  — soft-align, read-contract
pnpm demo:05     # MVP Sprint          — flaky lane, mixed results
pnpm demo:06     # Resilience Showcase — every error type at once

# Run all scenarios back-to-back
pnpm demo:all
```

---

## The 5-Phase Plan Demo

Before the DAG engine runs, every real project goes through a **5-phase
structured planning process**.  The `pnpm demo:plan` suite seeds pre-answered
discovery data so you can watch Phases 1–4 without typing answers interactively.

```bash
# Interactive seed picker → then plan from Phase 1
pnpm demo:plan

# Jump straight to a seed
pnpm demo:plan:01   # App Boilerplate discovery seed
pnpm demo:plan:02   # Enterprise Skeleton seed
pnpm demo:plan:03   # Website Build seed
pnpm demo:plan:04   # Feature-in-Context seed (billing added to existing platform)
pnpm demo:plan:05   # MVP Sprint seed (2-week solo sprint)

# Install seed only, do not run
node scripts/plan-demo.js 1 --dry-run

# Run with real LLM (requires configured provider)
node scripts/plan-demo.js 1 --live
```

### The 5 phases explained

| # | Name | What happens | Key output |
|---|------|-------------|-----------|
| 0 | **DISCOVER** | BA interviews the Product Owner via structured Q&A blocks | `discovery.json` |
| 1 | **SYNTHESIZE** | BA produces plan skeleton (Steps + rough Tasks), PO approves | `plan.json` |
| 2 | **DECOMPOSE** | Each agent expands their Steps into detailed Tasks in parallel | fully populated `plan.json` |
| 3 | **WIRE** | Dependency graph computed; alignment gates injected at conflict points | wired `plan.json` |
| 4 | **EXECUTE** | `PlanOrchestrator` feeds wired plan into `DagOrchestrator` lane by lane | execution artifacts |

> **Phase 0 is skipped by seeding.**  The plan seeds in
> `agents/demos/plan-seeds/` are pre-filled `discovery.json` files that carry
> complete, realistic answers — so the runner jumps straight to Phase 1.

---

## Scenario index

### 01 — App Boilerplate

**Project type:** From-scratch full-stack app  
**Run:** `pnpm demo:01`  
**DAG:** `agents/demos/01-app-boilerplate/boilerplate.dag.json`

| Lane | Behaviour | What to watch |
|------|-----------|---------------|
| `requirements` | APPROVE immediately | Baseline APPROVE path |
| `scaffold` | `retryBudget: 2` — checks Dockerfile (missing) → `noErrorFindings` FAILS | RETRY loop: *"Retry 1/2 … Retry 2/2 … budget exhausted → ESCALATE"* |
| `backend` | APPROVE; publishes api-spec contract; joins hard-barrier | Hard-barrier participant |
| `frontend` | APPROVE; publishes component-tree contract; joins hard-barrier | Hard-barrier participant |
| `integrate` | Reads both contracts after barrier releases | Contract field validation via `contractFields` |

**Key concepts demonstrated:**
- `retryBudget` exhaust → automatic ESCALATE
- Parallel lanes (`backend` + `frontend`) running simultaneously
- `hard-barrier` blocking `integrate` until *both* participants commit
- `read-contract` / `contractFields` expect rule

**Log events to spot:**
```
[scaffold] RETRY 1/2 — Dockerfile not found
[scaffold] RETRY 2/2 — Dockerfile not found
[scaffold] Budget exhausted → ESCALATE
[barrier] backend committed barrier-checkpoint
[barrier] frontend committed barrier-checkpoint
[barrier] hard-barrier "backend-frontend-ready" released — 2/2 participants
[integrate] Reading contracts from barrier snapshot
```

---

### 02 — Enterprise Skeleton

**Project type:** Enterprise app with auth, multi-tenancy, and features  
**Run:** `pnpm demo:02` (add `--interactive` flag for human-review gate)  
**DAG:** `agents/demos/02-enterprise-skeleton/enterprise.dag.json`

| Lane | Behaviour | What to watch |
|------|-----------|---------------|
| `requirements` | APPROVE | Fast baseline with `requiredKeys` check |
| `security-baseline` | `retryBudget: 2` — checks `.env.example` (missing) | RETRY × 2 visual |
| `architecture` | APPROVE; reads security + requirements contracts | `read-contract` from two waitFor lanes |
| `auth-module` | APPROVE; publishes `user-roles` contract | Upstream for HANDOFF |
| `db-schema` | `onFail: "HANDOFF"` — checks `prisma/schema.prisma` (missing) → hands off to `auth-module` | HANDOFF verdict + `handoffContext` payload |
| `human-review` | `mode: "needs-human-review"` | PAUSES if `--interactive`; auto-proceeds otherwise |
| `deployment-config` | APPROVE | Post-review deployment configuration |

**Key concepts demonstrated:**
- HANDOFF with `handoffContext` (carries problem description + partial result)
- `needs-human-review` gate — the engine pauses and prints a prompt when `--interactive`
- Parallel first group (`requirements` + `security-baseline`)
- Multi-dependency `architecture` lane (`dependsOn: ["requirements","security-baseline"]`)

**Run with human-review gate active:**
```bash
node scripts/run-scenarios.js 2 --interactive
# or
node packages/cli/dist/bin/ai-kit.js agent:dag \
  agents/demos/02-enterprise-skeleton/enterprise.dag.json \
  --provider mock --verbose --interactive
```

**Log events to spot:**
```
[db-schema] prisma/schema.prisma not found → HANDOFF to auth-module
[db-schema] Handoff context: { reason: "Schema dependency...", ... }
[human-review] ⏸  Needs human review — waiting for operator input
[human-review] Operator approved — proceeding
```

---

### 03 — Website Build

**Project type:** Marketing/portfolio website  
**Run:** `pnpm demo:03`  
**DAG:** `agents/demos/03-website-build/website.dag.json`

| Lane | Behaviour | What to watch |
|------|-----------|---------------|
| `content` | APPROVE immediately | Baseline |
| `design` | `retryBudget: 2` — checks `src/styles/tokens.css` (missing) | RETRY × 2 |
| `seo` | `retryBudget: 1` — checks `sitemap.xml` + `robots.txt` (both missing) → step-0 RETRY × 1 → step-1 **ESCALATE** 🚨 | Terminal escalation |
| `publish-readiness` | Still runs despite SEO escalation | Partial DAG behaviour |

**Key concepts demonstrated:**
- ESCALATE as a **terminal** lane state — the engine records it and continues other lanes
- Partial DAG result: `publish-readiness` has no `dependsOn: ["seo"]`, so it runs regardless
- Multiple `file-exists` checks in one step; both failing amplifies the signal

**What "terminal escalation" means:**
The `seo` lane's `EscalationError` is caught by `LaneExecutor`; `laneStatus` is set
to `'escalated'` and the lane result is included in the final `DagResult` with
`status: 'escalated'`.  Downstream lanes that do **not** depend on `seo` continue
normally — only lanes with `dependsOn: ["seo"]` would be blocked.

**Log events to spot:**
```
[design]  RETRY 1/2 — tokens.css not found
[design]  RETRY 2/2 — tokens.css not found
[seo]     RETRY 1/1 — sitemap.xml not found
[seo]     🚨 ESCALATE — sitemap.xml and robots.txt both missing; human intervention required
[publish-readiness]  Running (seo lane escalated but dependency not declared)
```

---

### 04 — Feature in Context

**Project type:** Adding a feature to an existing codebase  
**Run:** `pnpm demo:04`  
**DAG:** `agents/demos/04-feature-in-context/feature.dag.json`

| Lane | Behaviour | What to watch |
|------|-----------|---------------|
| `context-scan` | APPROVE; publishes codebase-context contract | Single upstream producer |
| `api-design` | step-0: `read-contract` from `context-scan`; step-1: `soft-align` with `data-model` (8 s timeout) | Contract consumption + cross-lane sync |
| `data-model` | step-0: `read-contract` from `context-scan`; step-1: `soft-align` with `api-design` (8 s timeout) | Cross-lane sync, may fallback |
| `implementation` | APPROVE; depends on both api-design + data-model | Fan-in after alignment |
| `tests` | APPROVE; depends on implementation | Final step |

**Key concepts demonstrated:**
- `read-contract` — a lane waits for another lane's contract before proceeding (soft read, no blocking)
- `soft-align` — two lanes synchronise at a rendezvous point with a configurable `timeoutMs`
- `fallback: "proceed-with-snapshot"` — if the partner hasn't arrived in time, the lane uses the last known snapshot and continues; no escalation
- Fan-in dependency pattern: `implementation` depends on both `api-design` and `data-model`

**Log events to spot:**
```
[context-scan]    APPROVE — codebase context contract published
[api-design]      Checkpoint read-contract: waiting for context-scan snapshot
[data-model]      Checkpoint read-contract: waiting for context-scan snapshot
[api-design]      Checkpoint soft-align: synchronising with data-model (timeout 8000ms)
[data-model]      Checkpoint soft-align: synchronising with api-design (timeout 8000ms)
[api-design]      soft-align resolved — partner arrived within timeout
```

---

### 05 — MVP Sprint

**Project type:** Minimum Viable Product, 2-week timeline  
**Run:** `pnpm demo:05`  
**DAG:** `agents/demos/05-mvp-sprint/mvp.dag.json`

| Lane | Behaviour | What to watch |
|------|-----------|---------------|
| `idea-validation` | `retryBudget: 0` — immediate APPROVE | Fast-path baseline |
| `market-scan` | `retryBudget: 1` — checks `docs/market-research.md` (missing) → RETRY × 1 | Single retry |
| `mvp-spec` | APPROVE; reads both upstream contracts | Synthesises both inputs |
| `rapid-backend` | APPROVE — API skeleton, no blocking files | Clean path |
| `rapid-frontend` | `retryBudget: 2` — checks `src/styles/tokens.css` (missing) → **FLAKY** RETRY × 2 | Flaky lane behaviour |
| `ship-checklist` | APPROVE; launch readiness + tech-debt register | Final summary |

**Key concepts demonstrated:**
- Mixed-result sprint: some lanes succeed, some exhaust retry budgets
- `retryBudget: 0` for lanes that must pass first time (no retry allowed in MVP pressure)
- A "flaky" lane (rapidly-frontend) that consistently fails in mock mode demonstrates what happens when a lane can't recover — exhausts budget, escalates, and the surrounding lanes continue

**Log events to spot:**
```
[idea-validation] APPROVE (retryBudget: 0 — no retry allowed)
[market-scan]     RETRY 1/1 — docs/market-research.md not found
[rapid-frontend]  🔁 RETRY 1/2 — [FLAKY] tokens.css not found
[rapid-frontend]  🔁 RETRY 2/2 — [FLAKY] tokens.css still not found
[rapid-frontend]  Budget exhausted → ESCALATE
[ship-checklist]  Running despite rapid-frontend escalation (no hard dependency)
```

---

### 06 — Resilience Showcase

**Project type:** Engine test harness — all error types in a single run  
**Run:** `pnpm demo:06` (add `--interactive` to trigger human-review gate)  
**DAG:** `agents/demos/06-resilience-showcase/resilience.dag.json`

All 8 lanes are **independent** (no `dependsOn`) — they all run in parallel,
giving you side-by-side log output of every engine behaviour simultaneously.

| Lane | Behaviour |
|------|-----------|
| `lane-success` | ✅ Checks `package.json` (exists) → APPROVE immediately |
| `lane-retry-ok` | 🔁 Checks `Dockerfile` (missing) → RETRY × 2 → budget exhausted → ESCALATE |
| `lane-handoff` | 🤝 Checks `prisma/schema.prisma` (missing) → HANDOFF to `specialist-lane` |
| `specialist-lane` | ✅ Receives handoff context → provides DB expertise → APPROVE |
| `lane-escalate` | 🚨 Checks `sitemap.xml` + `robots.txt` (both missing) → RETRY × 1 → **ESCALATE** terminal |
| `lane-human-gate` | ⏸  `needs-human-review` — pauses when `--interactive`, auto-proceeds otherwise |
| `lane-barrier-a` | 🔒 Joins hard-barrier `barrier-demo-sync`; waits for `lane-barrier-b` |
| `lane-barrier-b` | 🔒 Joins hard-barrier `barrier-demo-sync`; has extra step (slower partner) |

**This is the ideal scenario to run first** when evaluating the engine — every
log line maps directly to a documented engine behaviour.

**Run with all features active:**
```bash
node scripts/run-scenarios.js 6 --interactive
```

---

## Verdict reference

| Verdict | Trigger condition | Engine action |
|---------|------------------|---------------|
| `APPROVE` | All expect rules pass | Lane marked `completed`; contracts published |
| `RETRY` | Expect rule fails; `retryBudget > 0` | Lane re-executes with `retryInstructions` injected |
| `HANDOFF` | `onFail: "HANDOFF"` rule; budget exhausted | Partial result + context forwarded to `targetLaneId` |
| `ESCALATE` | Budget exhausted or explicit rule | `EscalationError` thrown; lane marked `escalated`; DAG continues |

## Checkpoint mode reference

| Mode | Description |
|------|-------------|
| `self` | Standard single-lane checkpoint; no cross-lane coordination |
| `read-contract` | Waits for a named lane's contract snapshot before evaluating |
| `soft-align` | Rendezvous with a partner lane; `timeoutMs` + `fallback` if partner is late |
| `hard-barrier` | Blocking sync — all `waitFor` participants must commit before any can proceed |
| `needs-human-review` | Pauses execution; operator input required when `--interactive` flag is set |

---

## Mock mode vs real LLM mode

| Behaviour | Mock mode | Real LLM mode |
|-----------|-----------|---------------|
| `llm-generate` / `llm-review` | Always returns 1+ finding | Returns model-generated content |
| `file-exists` (missing file) | Finding `❌ …` — consistently fails | Same — file system check is not LLM-dependent |
| RETRY recovery | **Cannot recover** — file system doesn't change | Model receives `retryInstructions`; may produce correct output |
| `minFindings: 1` | Always PASSES | Passes unless model returns empty |
| Cost | **$0.00** | Depends on model + token count |

> In mock mode, every RETRY on a `file-exists` check will exhaust its `retryBudget`
> and ESCALATE.  This is **by design** — it demonstrates the retry + escalation
> mechanism clearly without needing a live codebase.  The supervisor comments in each
> file explain what a real LLM would do differently.

---

## File layout

```
agents/demos/
├── model-router.json                  ← Shared mock-only router (zero cost)
├── plan-seeds/
│   ├── app-boilerplate/discovery.json ← Pre-answered Phase 0 for plan demo 01
│   ├── enterprise-skeleton/           ← Plan demo 02
│   ├── website/                       ← Plan demo 03
│   ├── feature-in-context/            ← Plan demo 04
│   └── mvp-sprint/                    ← Plan demo 05
├── 01-app-boilerplate/
│   ├── boilerplate.dag.json
│   ├── requirements.agent.json + .supervisor.json
│   ├── scaffold.agent.json + .supervisor.json
│   ├── backend.agent.json + .supervisor.json
│   ├── frontend.agent.json + .supervisor.json
│   └── integrate.agent.json + .supervisor.json
├── 02-enterprise-skeleton/            ← 7 lanes
├── 03-website-build/                  ← 4 lanes
├── 04-feature-in-context/             ← 5 lanes
├── 05-mvp-sprint/                     ← 6 lanes
└── 06-resilience-showcase/            ← 8 lanes (all independent)

scripts/
├── demo.js                            ← Original 3-lane demo
├── run-scenarios.js                   ← Advanced scenario runner (this guide)
└── plan-demo.js                       ← 5-phase plan demo runner
```
