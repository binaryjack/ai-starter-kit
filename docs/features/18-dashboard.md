# Real-Time Dashboard

**Status**: 🔜 Planned | **Priority**: P1 | **Roadmap**: G-26  
**Related**: Event Bus, Cost Analytics, WebSocket/SSE API

## Overview

The Real-Time Dashboard is a web UI that visualises live DAG execution — lane status, token streaming, cost accumulation, and verdict delivery — as runs progress. It is built into the **showcase-web** package and will be made available as a standalone embeddable component.

---

## Planned Capabilities

- **Live lane grid** — Each lane shown as a card with status indicator (queued → running → passed/failed)
- **Token stream panel** — Real-time LLM output as tokens arrive
- **Cost meter** — Running USD total with per-lane breakdown, animated as each LLM call completes
- **Timeline view** — Gantt-style view of lane start/end times and durations
- **Verdict log** — Scrollable list of check results with pass/warn/error colouring
- **Budget progress bar** — Visual indicator of spend vs budget cap with alert at 80%
- **Human-review prompt** — Modal pause gate when a `needs-human-review` check fires

---

## Architecture

The dashboard consumes events from the [Event Bus](./08-event-bus.md) via a [WebSocket/SSE endpoint](./22-websocket-sse.md).

```
DagOrchestrator
    │  emits typed events
    ▼
DagEventBus (in-process)
    │  tunnelled via SSE
    ▼
GET /api/runs/:runId/events
    │  consumed by browser
    ▼
Dashboard React components
  <LaneGrid />  <CostMeter />  <TokenStream />
```

---

## Current Status

The event bus, SSE endpoint, and cost tracking are all implemented. The visual dashboard components are in development.

To monitor runs today, use:

- **Event Bus** — programmatic subscriptions via `getGlobalEventBus()`
- **Cost reports** — `CostTracker.formatReport()` and `.save()`
- **NDJSON event log** — `.agents/tenants/<id>/runs/<runId>/events.ndjson`

---

## Embedding (Planned)

```tsx
// Future API — not yet released
import { DagDashboard } from '@ai-agencee/ui'

<DagDashboard
  runId={runId}
  eventsUrl={`/api/runs/${runId}/events`}
  onComplete={(summary) => console.log(summary)}
/>
```

---

## Related Features

- [Event Bus](./08-event-bus.md) — Events the dashboard subscribes to
- [WebSocket/SSE API](./22-websocket-sse.md) — SSE endpoint for the dashboard
- [Cost Analytics](./19-cost-analytics.md) — Cost data displayed in the dashboard
- [Streaming Output](./05-streaming-output.md) — Token stream panel source

---

**Last Updated**: March 7, 2026  
**Roadmap**: G-26 — Real-Time Dashboard  
**Implementation**: `_private/saas/showcase-web/` (in progress), `_private/saas/ui/`
