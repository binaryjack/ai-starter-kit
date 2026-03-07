# WebSocket / SSE Live API

**Status**: 🔜 Planned | **Priority**: P1 | **Roadmap**: G-28  
**Related**: Event Bus, Real-Time Dashboard, Event-Driven Triggers

## Overview

The WebSocket/SSE API tunnels the in-process [Event Bus](./08-event-bus.md) over HTTP to browser clients and external consumers. Once implemented, any system that can make an HTTP request can subscribe to live DAG events: lane status, token deltas, cost updates, verdicts, and budget alerts.

---

## Planned Architecture

```
DagOrchestrator
    │  emits typed events
    ▼
DagEventBus (in-process)
    │  fanned out by EventBridgeServer
    ▼
GET /api/runs/:runId/events      ← Server-Sent Events (SSE)
    │  or
WS  ws://host/runs/:runId/events ← WebSocket
    ▼
Browser / External consumer
```

---

## Planned Endpoints

| Endpoint | Protocol | Description |
|----------|----------|-------------|
| `GET /api/runs/:runId/events` | SSE | Subscribe to all events for a run |
| `GET /api/runs` | JSON | List active and recent runs |
| `GET /api/runs/:runId` | JSON | Get run status snapshot |
| `WS /runs/:runId/events` | WebSocket | Bidirectional (for human-review responses) |

---

## SSE Event Format

Each event is a standard SSE message. The `event` field maps to the `DagEventMap` key:

```
event: lane:start
data: {"runId":"abc123","laneId":"backend-review","timestamp":"2026-03-07T10:00:00.000Z"}

event: token:delta
data: {"runId":"abc123","laneId":"backend-review","token":"const","totalTokens":42}

event: lane:end
data: {"runId":"abc123","laneId":"backend-review","status":"success","durationMs":4200}

event: budget:exceeded
data: {"runId":"abc123","limitUSD":0.50,"actualUSD":0.53,"scope":"run"}

event: dag:end
data: {"runId":"abc123","status":"success","durationMs":12500}
```

---

## Consuming SSE (Browser)

```javascript
const es = new EventSource(`/api/runs/${runId}/events`)

es.addEventListener('lane:start', (e) => {
  const { laneId } = JSON.parse(e.data)
  setLaneStatus(laneId, 'running')
})

es.addEventListener('token:delta', (e) => {
  const { token } = JSON.parse(e.data)
  appendToken(token)
})

es.addEventListener('dag:end', (e) => {
  const { status } = JSON.parse(e.data)
  es.close()
  showResult(status)
})
```

---

## Consuming SSE (Node.js)

```typescript
import { EventSource } from 'eventsource'  // npm: eventsource

const es = new EventSource(`http://localhost:3000/api/runs/${runId}/events`)

es.addEventListener('dag:end', (e) => {
  const summary = JSON.parse(e.data)
  es.close()
  process.exit(summary.status === 'success' ? 0 : 1)
})
```

---

## Current Workaround

While the HTTP server is not yet built, you can consume events in-process:

```typescript
import { getGlobalEventBus } from '@ai-agencee/engine'

const bus = getGlobalEventBus()

bus.on('token:delta', ({ laneId, token }) => {
  process.stdout.write(token)
})

bus.on('dag:end', ({ status, durationMs }) => {
  console.log(`\nDone: ${status} in ${durationMs}ms`)
})
```

See [Event Bus](./08-event-bus.md) for the full in-process API.

---

## Related Features

- [Event Bus](./08-event-bus.md) — In-process event source
- [Real-Time Dashboard](./18-dashboard.md) — Browser UI consuming this stream
- [Streaming Output](./05-streaming-output.md) — Token-level streaming
- [Event-Driven Triggers](./21-event-triggers.md) — Webhook to DAG trigger

---

**Last Updated**: March 7, 2026  
**Roadmap**: G-28 — WebSocket/SSE Live API  
**Implementation**: Planned — `packages/showcase-web/src/app/api/runs/`
