# Cost Analytics & Reporting

**Status**: ✅ Implemented | **Priority**: P1 | **Roadmap**: Core  
**Related**: DAG Orchestration, Model Routing, OpenTelemetry

## Overview

`CostTracker` records every LLM call made during a DAG run, calculates estimated USD cost, enforces budget caps, and generates detailed per-run and per-lane reports. Cost data is persisted to disk as JSON and can be queried or exported.

---

## How Costs Are Calculated

Cost is calculated from token counts returned by each provider using fixed per-token rates defined in the model router config. The formula is:

```
estimatedCostUSD = (inputTokens × inputRatePerToken) + (outputTokens × outputRatePerToken)
```

Rates are configured per-model in `agents/model-router.json`.

---

## Budget Cap Enforcement

Set `budgetUSD` in your DAG file to enforce a spend limit:

```json
{
  "name": "security-review",
  "budgetUSD": 0.50,
  "lanes": [ ... ]
}
```

When the cumulative cost across all lanes exceeds `budgetUSD`, the orchestrator fires `onBudgetExceeded()`, which aborts remaining lanes and emits a `budget:exceeded` event on the event bus.

Override the cap at runtime:

```bash
ai-kit run agents/dag.json --budget 1.00
```

---

## Programmatic API

```typescript
import { CostTracker } from '@ai-agencee/engine'

const tracker = new CostTracker(
  runId,
  0.50,                               // budgetCapUSD
  () => orchestrator.abort('Budget'), // onBudgetExceeded callback
)

// Record a completed LLM call
tracker.record('backend-lane', 'step-2', routedResponse)

// Print formatted report to console
console.log(tracker.formatReport())

// Save to disk
await tracker.save('.agents/results/')
```

---

## Report Format

### Console output

```
┌─────────────────────────────────────────────────────────┐
│  Run Cost Summary   runId: abc123                        │
├────────────────┬────────┬───────────┬──────────────────-┤
│ Lane           │ Calls  │ Tokens    │ Cost (USD)         │
├────────────────┼────────┼───────────┼────────────────────┤
│ backend-review │ 3      │ 4,200     │ $0.0084            │
│ frontend       │ 2      │ 2,800     │ $0.0056            │
│ testing        │ 1      │ 1,100     │ $0.0022            │
├────────────────┼────────┼───────────┼────────────────────┤
│ TOTAL          │ 6      │ 8,100     │ $0.0162            │
└────────────────┴────────┴───────────┴────────────────────┘
Budget: $0.50  Used: $0.0162 (3.2%)
```

### JSON report (`run-cost.json`)

```json
{
  "runId": "abc123",
  "startedAt": "2026-03-07T10:00:00.000Z",
  "completedAt": "2026-03-07T10:01:05.000Z",
  "totalCostUSD": 0.0162,
  "totalInputTokens": 5800,
  "totalOutputTokens": 2300,
  "budgetCapUSD": 0.50,
  "budgetExceeded": false,
  "byLane": {
    "backend-review": {
      "laneId": "backend-review",
      "callCount": 3,
      "totalCostUSD": 0.0084,
      "byModel": {
        "claude-sonnet-3-7": { "calls": 3, "costUSD": 0.0084 }
      }
    }
  },
  "byTaskType": {
    "code-generation": { "calls": 4, "costUSD": 0.0112 },
    "file-analysis":   { "calls": 2, "costUSD": 0.0050 }
  },
  "calls": [ ... ]
}
```

---

## Types Reference

```typescript
interface CallRecord {
  timestamp:        string;
  laneId:           string;
  checkpointId:     string;
  taskType:         TaskType;
  provider:         string;
  model:            string;
  inputTokens:      number;
  outputTokens:     number;
  estimatedCostUSD: number;
}

interface LaneCostSummary {
  laneId:             string;
  totalInputTokens:   number;
  totalOutputTokens:  number;
  totalCostUSD:       number;
  callCount:          number;
  byModel:            Record<string, { calls: number; costUSD: number }>;
}

interface RunCostSummary {
  runId:              string;
  startedAt:          string;
  completedAt?:       string;
  totalCostUSD:       number;
  totalInputTokens:   number;
  totalOutputTokens:  number;
  byLane:             Record<string, LaneCostSummary>;
  byTaskType:         Record<string, { calls: number; costUSD: number }>;
  budgetCapUSD?:      number;
  budgetExceeded:     boolean;
  calls:              CallRecord[];
}
```

---

## DAG-Level Budget Config

```json
{
  "name": "my-dag",
  "budgetUSD": 1.00,
  "budgetPolicy": "abort-on-exceed",
  "lanes": [
    {
      "id": "expensive-lane",
      "budgetUSD": 0.25
    }
  ]
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `budgetUSD` | unlimited | Total run budget cap |
| `budgetPolicy` | `"abort-on-exceed"` | `"abort-on-exceed"` or `"warn-only"` |
| `lanes[].budgetUSD` | inherited | Per-lane budget cap |

---

## Event Bus Integration

When the budget is exceeded, a `budget:exceeded` event fires:

```typescript
import { getGlobalEventBus } from '@ai-agencee/engine'

getGlobalEventBus().on('budget:exceeded', ({ runId, limitUSD, actualUSD, scope }) => {
  console.warn(`Budget exceeded: $${actualUSD.toFixed(4)} > $${limitUSD} (${scope})`)
})
```

---

## Related Features

- [Model Routing & Cost Tracking](./03-model-routing-cost.md) — Provider rate config
- [DAG Orchestration](./01-dag-orchestration.md) — Budget fields in DAG JSON
- [Event Bus](./08-event-bus.md) — `budget:exceeded` event
- [OpenTelemetry](./17-opentelemetry.md) — Cost attributes in LLM call spans

---

**Last Updated**: March 7, 2026  
**Roadmap**: Core  
**Implementation**: `packages/agent-executor/src/lib/cost-tracker.ts`
