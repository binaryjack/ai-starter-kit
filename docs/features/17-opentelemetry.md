# OpenTelemetry Integration

**Status**: ✅ Implemented | **Priority**: P1 | **Roadmap**: G-08  
**Related**: DAG Orchestration, Cost Analytics, Event Bus

## Overview

The engine provides **opt-in OpenTelemetry tracing** via a zero-dependency facade. When `@opentelemetry/api` and an exporter are installed, every DAG run produces a structured trace hierarchy. When those packages are absent, the facade silently no-ops — no errors, no performance overhead.

---

## Trace Hierarchy

```
dag.run                      (root span — runId, dagName)
  └─ dag.lane                (one per lane — laneId, status)
       ├─ llm.call           (one per LLM completion — model, inputTokens, outputTokens, costUSD)
       └─ tool.call          (one per tool invocation — toolName)
```

---

## Quick Start

### 1. Install packages

```bash
pnpm add @opentelemetry/api @opentelemetry/sdk-node \
         @opentelemetry/exporter-trace-otlp-grpc
```

### 2. Set environment variable

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 ai-kit run agents/dag.json
```

That's it — the engine detects the endpoint and activates tracing automatically.

### 3. Or initialise programmatically

```typescript
import { initOtel, createRunTracer } from '@ai-agencee/engine'

// Call before any DAG runs
initOtel({
  serviceName: 'my-ai-pipeline',
  endpoint:    'http://otel-collector:4317',
})
```

---

## Programmatic API

```typescript
import { createRunTracer } from '@ai-agencee/engine'

const tracer = createRunTracer()

// ── Root run span ──────────────────────────────────────────────────────────
const runSpan = tracer.startDagRun(runId, 'security-review')
runSpan.setAttribute('environment', 'production')

// ── Lane span ──────────────────────────────────────────────────────────────
const laneSpan = tracer.startLane(runId, 'backend-review', runSpan)

// ── LLM call span ──────────────────────────────────────────────────────────
const llmSpan = tracer.startLlmCall('backend-review', 'claude-sonnet-3-7', laneSpan)
llmSpan.setAttribute('input_tokens',  1200)
llmSpan.setAttribute('output_tokens', 400)
llmSpan.setAttribute('cost_usd',      0.0048)
llmSpan.end()

laneSpan.setStatus('ok').end()
runSpan.setStatus('ok').end()
```

---

## API Reference

### `DagTracer`

```typescript
interface DagTracer {
  startDagRun(runId: string, dagName: string): OtelSpanHandle
  startLane(runId: string, laneId: string, parentSpan?: OtelSpanHandle): OtelSpanHandle
  startLlmCall(laneId: string, model: string, parentSpan?: OtelSpanHandle): OtelSpanHandle
  startToolCall(laneId: string, toolName: string, parentSpan?: OtelSpanHandle): OtelSpanHandle
}
```

### `OtelSpanHandle`

```typescript
interface OtelSpanHandle {
  setAttribute(key: string, value: string | number | boolean): this
  recordException(err: Error): this
  setStatus(status: 'ok' | 'error', message?: string): this
  end(): void
  readonly active: boolean   // true when backed by a real OTEL span
}
```

---

## Standard Span Attributes

| Span | Attribute | Type | Description |
|------|-----------|------|-------------|
| `dag.run` | `run.id` | string | Unique run ID |
| `dag.run` | `dag.name` | string | DAG name |
| `dag.lane` | `lane.id` | string | Lane identifier |
| `dag.lane` | `lane.status` | string | `success`, `failed`, `escalated` |
| `llm.call` | `llm.model` | string | Model name (e.g. `claude-sonnet-3-7`) |
| `llm.call` | `llm.input_tokens` | number | Input token count |
| `llm.call` | `llm.output_tokens` | number | Output token count |
| `llm.call` | `llm.cost_usd` | number | Estimated USD cost |
| `tool.call` | `tool.name` | string | Tool identifier |

---

## Sending to Jaeger / Grafana Tempo

```bash
# Jaeger all-in-one
docker run -p 4317:4317 -p 16686:16686 jaegertracing/all-in-one

OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 ai-kit run agents/dag.json

# Open Jaeger UI
open http://localhost:16686
```

```bash
# Grafana Tempo via docker-compose
docker-compose up tempo grafana
# Traces appear in Grafana Explore → Tempo data source
```

---

## No-Op Guarantee

When `@opentelemetry/api` is **not** installed:

- `createRunTracer()` returns the `NO_OP_TRACER`
- All span methods return immediately
- No try/catch or conditional code needed in calling code
- Zero performance impact

---

## Related Features

- [DAG Orchestration](./01-dag-orchestration.md) — Run and lane lifecycle
- [Event Bus](./08-event-bus.md) — Alternative real-time event stream
- [Cost Analytics](./19-cost-analytics.md) — Per-run cost tracking

---

**Last Updated**: March 7, 2026  
**Roadmap**: G-08 — OpenTelemetry  
**Implementation**: `packages/agent-executor/src/lib/otel.ts`
