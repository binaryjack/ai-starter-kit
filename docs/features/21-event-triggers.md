# Event-Driven Triggers

**Status**: ✅ Implemented | **Priority**: P2 | **Roadmap**: G-16  
**Related**: DAG Orchestration, WebSocket/SSE API

## Overview

The `GitHubWebhookTrigger` starts a lightweight HTTP server that listens for GitHub webhook events and fires DAG runs in response. No third-party SDK required — pure Node.js built-ins, HMAC-SHA256 signature verification, and a declarative route table.

---

## Supported Events

| GitHub event | Common use case |
|-------------|----------------|
| `push` | Run code review on every commit to `main` |
| `pull_request` | Run PR review when a PR is opened or updated |
| `workflow_dispatch` | Manually trigger a DAG from the GitHub UI |
| `*` (wildcard) | Catch all events and route based on DAG logic |

---

## Quick Start

```typescript
import { GitHubWebhookTrigger, DagOrchestrator } from '@ai-agencee/engine'

const trigger = new GitHubWebhookTrigger({
  port:        9000,
  secret:      process.env.GITHUB_WEBHOOK_SECRET!,
  projectRoot: process.cwd(),
  routes: [
    {
      event:   'push',
      ref:     'refs/heads/main',
      dagFile: 'agents/dag.json',
    },
    {
      event:   'pull_request',
      action:  'opened',
      dagFile: 'agents/pr-review.dag.json',
    },
  ],
  onTrigger: async (ctx) => {
    console.log(`Triggered by ${ctx.event} — running ${ctx.dagFile}`)
    const orchestrator = new DagOrchestrator(process.cwd())
    await orchestrator.runDag(ctx.dagFile)
  },
})

await trigger.start()
// Server listening on :9000

// Graceful shutdown
process.on('SIGTERM', () => trigger.stop())
```

---

## GitHub Setup

1. Go to your repository → **Settings → Webhooks → Add webhook**
2. Set **Payload URL** to your server (e.g. `https://myserver.com/webhook`)
3. Set **Content type** to `application/json`
4. Set **Secret** to the same value as `process.env.GITHUB_WEBHOOK_SECRET`
5. Select the events you want to trigger (push, pull_request, etc.)

---

## Configuration Reference

```typescript
interface GitHubWebhookTriggerOptions {
  /** TCP port to listen on. Default: 9000 */
  port?: number;
  /** Bind host. Default: '0.0.0.0' */
  host?: string;
  /**
   * Webhook secret for HMAC-SHA256 verification.
   * Set undefined to disable signature checks (insecure — dev only).
   */
  secret?: string;
  /** Route table: GitHub event → DAG file mapping */
  routes: WebhookRoute[];
  /** Project root for resolving relative dagFile paths */
  projectRoot: string;
  /** Called on each matched event. Run the DAG here. */
  onTrigger: (ctx: TriggerContext) => Promise<void>;
  /** Error handler. Default: console.error */
  onError?: (err: Error, ctx?: Partial<TriggerContext>) => void;
}

interface WebhookRoute {
  event:    string;        // e.g. 'push', 'pull_request', '*'
  ref?:     string;        // Filter by ref (push events)
  action?:  string;        // Filter by action (PR events)
  dagFile:  string;        // DAG to run when this route matches
}

interface TriggerContext {
  event:      string;
  dagFile:    string;
  payload:    GitHubWebhookPayload;
  deliveryId: string;
}
```

---

## Deploying with Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install -g @ai-agencee/cli
ENV GITHUB_WEBHOOK_SECRET=change-me
ENV ANTHROPIC_API_KEY=sk-ant-...
EXPOSE 9000
CMD ["node", "trigger-server.js"]
```

```yaml
# docker-compose.yml
services:
  ai-trigger:
    build: .
    ports:
      - "9000:9000"
    environment:
      GITHUB_WEBHOOK_SECRET: ${GITHUB_WEBHOOK_SECRET}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      AIKIT_TENANT_ID: ${DEPLOY_ENV:-staging}
```

---

## GitHub Actions Alternative

For simpler CI setups, you can trigger DAG runs directly inside a GitHub Actions workflow:

```yaml
name: AI Code Review
on:
  pull_request:
    branches: [main]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm run review:dag
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          AIKIT_TENANT_ID:   ${{ github.repository_owner }}
```

---

## Related Features

- [DAG Orchestration](./01-dag-orchestration.md) — The DAGs triggered
- [WebSocket/SSE API](./22-websocket-sse.md) — Stream trigger events to external systems
- [Multi-Tenant Isolation](./11-multi-tenant.md) — `AIKIT_TENANT_ID` per environment

---

**Last Updated**: March 7, 2026  
**Roadmap**: G-16 — Event-Driven Triggers  
**Implementation**: `packages/agent-executor/src/lib/webhook-trigger.ts`
