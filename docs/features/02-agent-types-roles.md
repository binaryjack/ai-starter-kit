# Agent Types & Roles

**Status**: ✅ Implemented | **Priority**: P0 | **Roadmap**: Core  
**Related**: DAG Orchestration, Check Handlers, Model Routing

## Overview

ai-agencee ships **six specialist agent roles**, each with a configured model tier, a dedicated supervisor prompt, and a JSON agent definition. You can compose them freely in a DAG or define your own roles by adding a JSON agent file.

---

## Built-in Agent Roles

| # | Role | File | Model | Primary responsibility |
|---|------|------|-------|----------------------|
| 01 | Business Analyst | `agents/01-business-analyst.agent.json` | Sonnet | Requirements analysis, user-story extraction, acceptance criteria |
| 02 | Architecture | `agents/02-architecture.agent.json` | Opus | System design, ADRs, tech-stack decisions |
| 03 | Backend | `agents/03-backend.agent.json` | Sonnet | API design, data models, service implementation |
| 04 | Frontend | `agents/04-frontend.agent.json` | Sonnet | Component design, routing, state management review |
| 05 | Testing | `agents/05-testing.agent.json` | Sonnet | Unit/integration test coverage analysis |
| 06 | E2E | `agents/06-e2e.agent.json` | Sonnet | End-to-end flow verification and Playwright scaffolding |

---

## Agent JSON Structure

Each agent is a JSON file that describes what the agent checks and how it reports. No TypeScript is needed.

```json
{
  "name": "backend-agent",
  "description": "Backend implementation quality checks",
  "taskType": "code-generation",
  "checks": [
    {
      "id": "api-routes",
      "type": "file-exists",
      "path": "src/routes",
      "pass": "API route directory present",
      "fail": "Missing src/routes — API layer not scaffolded",
      "failSeverity": "error"
    },
    {
      "id": "review-services",
      "type": "llm-review",
      "path": "src/services",
      "taskType": "code-generation",
      "prompt": "Review the service layer for SOLID principles and error handling. List specific issues.",
      "pass": "Service layer reviewed",
      "fail": "Service layer review failed"
    }
  ]
}
```

---

## Agent File Schema

```typescript
interface AgentDefinition {
  /** Human-readable agent name */
  name: string;
  /** Optional description shown in CLI output */
  description?: string;
  /**
   * Default task type for LLM checks in this agent.
   * Overridden per-check by check.taskType.
   */
  taskType?: TaskType;
  /** Ordered array of checks to run */
  checks: CheckDefinition[];
}
```

See [Check Handlers](./04-check-handlers.md) for the full `CheckDefinition` reference.

---

## Supervisor Files

Each agent can have an optional supervisor prompt file (`.supervisor.json`) that wraps the agent's output with an Opus-tier meta-review. Supervisors catch issues the main agent missed and assign a final verdict.

```
agents/
  03-backend.agent.json        # Agent definition
  backend.supervisor.json      # Supervisor prompt config
  prompts/
    backend-agent.sonnet.prompt.md  # Prompt template
```

### Supervisor JSON

```json
{
  "model": "opus",
  "system": "You are a senior engineer reviewing backend agent output. Identify gaps, false positives, and missing recommendations.",
  "outputKey": "supervisor_review"
}
```

---

## Model Tier Mapping

Agent task types are automatically mapped to the right model tier:

| Task type | Model tier | Used by |
|-----------|-----------|---------|
| `file-analysis`, `validation`, `contract-extraction` | Haiku | File presence, JSON checks |
| `code-generation`, `refactoring`, `api-design` | Sonnet | Backend, Frontend, Testing agents |
| `architecture-decision`, `security-review` | Opus | Architecture agent |
| `hard-barrier-resolution` | Opus | Barrier coordinators, supervisors |

Tiers map to the cheapest model in the configured provider (e.g. `claude-haiku-3-5` → `claude-sonnet-3-7` → `claude-opus-4`).

---

## Custom Agents

### Minimal custom agent

```json
{
  "name": "security-agent",
  "description": "Checks for common security misconfigurations",
  "taskType": "security-review",
  "checks": [
    {
      "id": "no-hardcoded-secrets",
      "type": "grep",
      "path": "src",
      "pattern": "password\\s*=\\s*[\"'][^\"']+[\"']",
      "pass": "No hardcoded passwords found",
      "fail": "Hardcoded password detected",
      "failSeverity": "error"
    },
    {
      "id": "llm-security-review",
      "type": "llm-review",
      "path": "src",
      "taskType": "security-review",
      "prompt": "Review this codebase for OWASP Top 10 vulnerabilities. Be specific about file paths and line numbers.",
      "pass": "Security review complete",
      "fail": "Security issues detected"
    }
  ]
}
```

### Adding the agent to a DAG

```json
{
  "name": "full-review",
  "lanes": [
    {
      "id": "security",
      "agentFile": "agents/security-agent.json"
    }
  ]
}
```

---

## Agent Coordination Patterns

For complex workflows, multiple agents run in parallel lanes with cross-lane dependencies. See [AGENTS-COORDINATION.md](../../agents/AGENTS-COORDINATION.md) for orchestration patterns including:

- **Sequential hand-off**: BA → Architecture → Backend → Frontend
- **Parallel review**: Backend + Frontend + Testing run concurrently
- **Barrier**: Architecture agent must pass before code agents start
- **Supervisor escalation**: Any lane failure triggers Opus supervisor review

---

## Related Features

- [DAG Orchestration](./01-dag-orchestration.md) — Lane-based parallel execution
- [Check Handlers](./04-check-handlers.md) — All available check types
- [Model Routing & Cost Tracking](./03-model-routing-cost.md) — Task-type → model mapping
- [Resilience Patterns](./07-resilience-patterns.md) — Retry and circuit-breaker per lane

---

**Last Updated**: March 7, 2026  
**Roadmap**: Core  
**Definitions**: `agents/*.agent.json`, `packages/agent-executor/src/lib/agent-types.ts`
