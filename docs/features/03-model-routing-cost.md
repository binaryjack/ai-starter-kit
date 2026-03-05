# Model Routing & Cost Tracking

**Status**: ✅ Implemented | **Priority**: P0 | **Roadmap**: Core  
**Related**: DAG Orchestration, Agent Types, Streaming Output

## Overview

Smart model routing intelligently selects the optimal LLM provider and model family for each task based on **cost, capability, and task type**. Combined with real-time cost tracking, it enables **budget enforcement** and **total-cost-of-execution visibility**.

### Key Capabilities

- **Task-to-model routing** — Automatically select Haiku/Sonnet/Opus based on task complexity
- **Multi-provider support** — Anthropic, OpenAI, Ollama, VS Code Sampling, Mock
- **Per-call cost estimation** — Predict token consumption before execution
- **Budget enforcement** — Hard caps on total spend per run
- **Cost-aware selection** — Choose cheaper equivalent models when budget-constrained
- **Per-lane provider override** — Force specific provider per lane

---

## Core Concepts

### Model Families

Each provider offers models in tiers:

| Family | Purpose | Tokens/sec | Cost (1M in) | Use Cases |
|--------|---------|-----------|--------------|-----------|
| **Haiku** | Fast, cheap | 100+ | $0.80 | File analysis, validation |
| **Sonnet** | Balanced | 50 | $3.00 | Code review, generation |
| **Opus** | Powerful | 20 | $15.00 | Architecture, complex decisions |

### Task Types

Each task is classified for intelligent routing:

```typescript
type TaskType = 
  | 'validation'           // Haiku (fast, cheap)
  | 'code-analysis'        // Sonnet (balanced)
  | 'code-generation'      // Sonnet (larger context)
  | 'code-review'          // Sonnet (detail-oriented)
  | 'security-review'      // Opus (thorough)
  | 'architecture-decision'// Opus (high-level thinking)
  | 'complex-reasoning'    // Opus (multi-step logic)
```

### Routing Decision Tree

```
Task comes in → Check taskType
                    │
                    ├─ 'validation' → Haiku ($0.80/1M)
                    ├─ 'code-review' → Sonnet ($3.00/1M)
                    ├─ 'code-generation' → Sonnet
                    └─ 'architecture-decision' → Opus ($15.00/1M)
                         │
                         ├─ Budget has room? → Use Opus
                         └─ Low on budget? → Fall back to Sonnet
                              │
                              └─ Still over? → Fail with cost estimate
```

---

## Quick Start

### 1. Define Model Routing

Create `agents/model-router.json`:

```json
{
  "provider": "anthropic",
  "defaultModel": "sonnet",
  "fallbackProvider": "openai",
  
  "routingRules": [
    {
      "taskType": "validation",
      "model": "haiku",
      "provider": "anthropic"
    },
    {
      "taskType": "code-generation",
      "model": "sonnet",
      "provider": "anthropic"
    },
    {
      "taskType": "architecture-decision",
      "model": "opus",
      "provider": "anthropic"
    },
    {
      "taskType": "security-review",
      "model": "opus",
      "provider": "anthropic"
    }
  ],
  
  "costBudgets": {
    "haiku": 0.001,
    "sonnet": 0.003,
    "opus": 0.015
  }
}
```

### 2. Use in DAG

Reference models in checks:

```json
{
  "checks": [
    {
      "id": "quick-validation",
      "type": "llm-review",
      "taskType": "validation",
      "prompt": "Is this TypeScript valid?",
      "model": "haiku",
      "outputKey": "validation_result"
    },
    {
      "id": "code-generation",
      "type": "llm-generate",
      "taskType": "code-generation",
      "prompt": "Generate unit tests.",
      "model": "sonnet",
      "maxTokens": 4000,
      "outputKey": "tests"
    }
  ]
}
```

### 3. Monitor Costs

```bash
# Execute DAG and see cost summary
ai-kit agent:dag agents/my-workflow.dag.json

# Output includes:
# ┌─────────────────────────────────┐
# │ 💰 COST SUMMARY                 │
# ├─────────────────────────────────┤
# │ Total Cost: $2.47               │
# │ Tokens: prompt=4200, completion=2800 │
# │ Budget: $5.00 (✅ Within budget)│
# └─────────────────────────────────┘
```

---

## Configuration Reference

### Model Router Configuration

```typescript
interface ModelRouterConfig {
  // Default provider
  provider: 'anthropic' | 'openai' | 'mock' | 'ollama' | 'gemini' | 'bedrock';
  
  // Default model tier
  defaultModel: 'haiku' | 'sonnet' | 'opus';
  
  // Fallback for failed requests
  fallbackProvider?: 'openai' | 'anthropic' | 'mock';
  
  // Routing rules
  routingRules: RoutingRule[];
  
  // Cost budgets per model
  costBudgets?: Record<string, number>;
  
  // Behavioral options
  options?: {
    preferCheaper?: boolean;      // Downgrade models if budget-constrained
    allowFallback?: boolean;       // Try fallback provider on failure
    estimateBefore?: boolean;      // Dry-run to estimate costs
  };
}

interface RoutingRule {
  taskType: string;
  model: 'haiku' | 'sonnet' | 'opus';
  provider?: 'anthropic' | 'openai' | 'mock' | 'ollama';
  maxTokens?: number;
  temperature?: number;
  priority?: number;  // Higher = prefer this rule
}
```

### Per-Check Overrides

Override routing on specific checks:

```json
{
  "id": "custom-check",
  "type": "llm-review",
  "taskType": "architecture-decision",
  "model": "opus",                      // Override default
  "provider": "openai",                 // Use specific provider
  "temperature": 0.5,                   // Custom temperature
  "maxTokens": 8000,                    // Custom token limit
  "prompt": "..."
}
```

---

## Pricing Reference

### Anthropic Models

| Model | Input | Output | Batch Input | Batch Output |
|-------|-------|--------|-------------|--------------|
| Haiku | $0.80/1M | $4.00/1M | $0.24/1M | $1.20/1M |
| Sonnet | $3.00/1M | $15.00/1M | $0.90/1M | $4.50/1M |
| Opus | $15.00/1M | $75.00/1M | $4.50/1M | $22.50/1M |

### OpenAI Models

| Model | Input | Output |
|-------|-------|--------|
| GPT-4o mini | $0.15/1M | $0.60/1M |
| GPT-4o | $5.00/1M | $15.00/1M |
| GPT-4 Turbo | $10.00/1M | $30.00/1M |

### Cost Estimation Examples

**Validation task (Haiku)**:
- Input: 500 tokens → $0.0004
- Output: 100 tokens → $0.0004
- **Total: ~$0.0008**

**Code generation task (Sonnet)**:
- Input: 2,000 tokens → $0.006
- Output: 2,000 tokens → $0.030
- **Total: ~$0.036**

**Architecture decision (Opus)**:
- Input: 5,000 tokens → $0.075
- Output: 3,000 tokens → $0.225
- **Total: ~$0.30**

---

## Examples

### Example 1: Budget-Aware Routing

Automatically downgrade models when budget is tight:

```typescript
import { ModelRouter } from '@ai-agencee/ai-kit-agent-executor';

const router = new ModelRouter(projectRoot);

// Request for architecture decision
const routing = router.route('architecture-decision', {
  budgetRemaining: 0.50,  // Only $0.50 left
  preferCheaper: true      // Downgrade if needed
});

// Result: Falls back to Sonnet instead of Opus
// { model: 'sonnet', provider: 'anthropic', estimatedCostUSD: 0.036 }
```

### Example 2: Multi-Provider Failover

Automatically failover to OpenAI if Anthropic rate-limited:

```json
{
  "provider": "anthropic",
  "fallbackProvider": "openai",
  "routingRules": [
    {
      "taskType": "code-review",
      "model": "sonnet",
      "provider": "anthropic"
    }
  ]
}
```

**Execution**:
1. Try Anthropic Claude Sonnet
2. If 429 (rate limited): Retry with OpenAI GPT-4o
3. If both fail: Report error

### Example 3: Hybrid Provider Strategy

Use different providers for different task types:

```json
{
  "provider": "anthropic",
  "routingRules": [
    {
      "taskType": "validation",
      "model": "haiku",
      "provider": "anthropic"  // Cheap and fast
    },
    {
      "taskType": "code-review",
      "model": "sonnet",
      "provider": "openai"     // OpenAI Sonnet alternative
    },
    {
      "taskType": "architecture-decision",
      "model": "opus",
      "provider": "anthropic"  // Anthropic's best model
    }
  ]
}
```

---

## Cost Tracking in Detail

### Per-Run Cost Report

Every run generates a detailed cost breakdown:

```typescript
interface CostSummary {
  runId: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  
  // Total
  totalUSD: number;
  
  // Breakdown
  breakdown: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  
  // Per lane
  perLane: Record<string, {
    totalUSD: number;
    tasks: number;
    tokens: number;
    models: Record<string, number>;
  }>;
  
  // Per model
  perModel: Record<string, {
    totalUSD: number;
    tasks: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  
  // Per provider
  perProvider: Record<string, {
    totalUSD: number;
    tasks: number;
    failures: number;
    retries: number;
  }>;
  
  // Budget
  budgetUSD: number;
  budgetRemaining: number;
  budgetUtilization: number;  // 0-100%
}
```

### Accessing Cost Data

```typescript
const result = await orchestrator.execute(dagDefinition);

console.log(`Total: $${result.costSummary.totalUSD.toFixed(2)}`);
console.log(`Tokens: ${result.costSummary.breakdown.totalTokens}`);

result.costSummary.perLane.forEach(lane => {
  console.log(`${lane.id}: $${lane.totalUSD.toFixed(4)}`);
});
```

### Cost Report Files

After execution, find detailed reports:

```
.agents/runs/<runId>/
├── cost-summary.json          # Full cost details
├── cost-estimate.json          # Pre-execution estimate
└── budget-trace.ndjson        # Token-by-token spending log
```

---

## Budget Enforcement

### Hard Budget Cap

Once budget is exceeded, execution stops:

```typescript
const result = await orchestrator.execute(dagDefinition, {
  budgetUSD: 5.00
});

if (result.status === 'budget_exceeded') {
  console.log(`Over budget: spent $${result.costSummary.totalUSD}`);
  // Remaining lanes cancelled
  // Partial results returned
}
```

### Soft Budget Warnings

Log warnings at thresholds:

```json
{
  "budgetUSD": 5.00,
  "budgetWarnings": {
    "50%": "log",      // At 50% budget, log warning
    "75%": "warn",     // At 75%, warn prominently
    "90%": "escalate"  // At 90%, escalate to human
  }
}
```

---

## Token Counting

Accurate token counting for different models:

```typescript
import { TokenCounter } from '@ai-agencee/ai-kit-agent-executor';

const counter = new TokenCounter('claude-3-sonnet');
const encoded = counter.encode("Hello, world!");
console.log(encoded.length);  // 4 tokens

// For long prompts
const prompt = fs.readFileSync('long-prompt.md', 'utf-8');
const tokens = counter.encode(prompt).length;
console.log(`Prompt: ${tokens} tokens`);

// Cost calculation
const inputCost = tokens * (3.00 / 1_000_000);  // Sonnet input rate
const outputEstimate = tokens * 2 * (15.00 / 1_000_000);  // Assume 2x output
console.log(`Estimated: $${(inputCost + outputEstimate).toFixed(4)}`);
```

---

## Monitoring & Analytics

### Cost Timeline

View spending over execution:

```typescript
// Watch cost accumulate in real-time
orchestrator.on('cost:update', (event) => {
  console.log(`[${event.timestamp}] $${event.currentTotal} / $${event.budget}`);
  console.log(`  Lane: ${event.laneId} +$${event.incrementalCost}`);
});
```

### Cost Comparison

Compare costs between provider choices:

```typescript
import { DagOrchestrator } from '@ai-agencee/ai-kit-agent-executor';

const orchestrator = new DagOrchestrator(projectRoot);

// Estimate with Anthropic
const anthropicCost = await orchestrator.estimateCost(dag, {
  provider: 'anthropic'
});

// Estimate with OpenAI
const openaiCost = await orchestrator.estimateCost(dag, {
  provider: 'openai'
});

console.log(`Anthropic: $${anthropicCost.totalUSD}`);
console.log(`OpenAI: $${openaiCost.totalUSD}`);
console.log(`Savings with Anthropic: $${(openaiCost.totalUSD - anthropicCost.totalUSD).toFixed(2)}`);
```

---

## Troubleshooting

### "Budget exceeded before completion"
- **Increase** `budgetUSD` or reduce check count
- **Switch to cheaper models**: Try Haiku for validation tasks
- **Reduce** `maxTokens` on generate tasks
- **Enable** `preferCheaper: true` for automatic downgrades

### "Cost estimate doesn't match actual"
- Estimates use approximate token counts
- Actual token counts from provider may differ
- Re-run to get accurate numbers for next optimization

### "Model not available from provider"
- Check `model-router.json` for correct provider
- Verify API key is set for that provider
- Some models have limited availability (e.g., regions, accounts)

### "Provider failover not triggering"
- Ensure `fallbackProvider` is configured
- Verify fallback provider has working credentials
- Check circuit breaker isn't preventing failover

---

## Related Features

- [DAG Orchestration](./01-dag-orchestration.md) — Uses model routing
- [Streaming Output](./05-streaming-output.md) — Works with any routed model
- [Agent Types](./02-agent-types-roles.md) — Task types influence routing
- [Cost Analytics](./19-cost-analytics.md) — Detailed cost reporting

---

**Last Updated**: March 5, 2026 | **Version**: 1.0.0
