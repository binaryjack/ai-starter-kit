# Slack & Teams Notifications

**Status**: ✅ Implemented | **Priority**: P2 | **Roadmap**: G-43  
**Related**: Event Bus, DAG Orchestration

## Overview

`NotificationSink` subscribes to DAG lifecycle events and sends rich messages to **Slack** and/or **Microsoft Teams** incoming webhooks. Both integrations use zero external SDK dependencies — pure HTTP `fetch`. Configure both simultaneously or independently.

---

## Quick Start

```typescript
import { NotificationSink, getGlobalEventBus } from '@ai-agencee/engine'

const sink = new NotificationSink({
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL!,
    channel:    '#ci-alerts',
  },
})

sink.attach(getGlobalEventBus())
```

Now every time a DAG run ends, a message is posted to `#ci-alerts`.

---

## Environment-Based Setup

The recommended pattern for CI/CD — reads URLs from environment variables automatically:

```typescript
const sink = NotificationSink.fromEnv()
if (sink) {
  sink.attach(getGlobalEventBus())
}
```

`fromEnv()` reads:

| Env var | Description |
|---------|-------------|
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL |
| `TEAMS_WEBHOOK_URL` | Microsoft Teams incoming webhook URL |

Returns `null` when neither is set, so no error if notifications are not configured.

---

## Configuration Reference

```typescript
const sink = new NotificationSink({
  // Slack
  slack: {
    webhookUrl: 'https://hooks.slack.com/services/...',
    channel:    '#ai-alerts',    // Override webhook default channel
    username:   'AI Agent',      // Bot display name
    iconEmoji:  ':robot_face:',  // Bot icon
  },

  // Teams
  teams: {
    webhookUrl: 'https://...webhook.office.com/...',
  },

  // Filtering
  failuresOnly:  false,  // Only notify on failure/partial (suppress success)
  notifyLaneEnd: false,  // Also send on lane:end (can be noisy for large DAGs)
  notifyBudget:  true,   // Send when budget is exceeded
})
```

---

## Notification Layout

### Slack — DAG success

```
✅ DAG Run Complete
*full-review* · 12.5s · $0.0162
Status: success
```

### Slack — DAG failure

```
❌ DAG Run Failed
*security-review* · 8.2s · $0.0098
Status: failed
Lane `backend-review` failed after 2 retries
```

### Slack — Budget exceeded

```
⚠️ Budget Exceeded
*full-review* · Limit: $0.50 · Actual: $0.53
Remaining lanes cancelled
```

### Teams — Adaptive Card

Teams notifications use the Adaptive Card format with colour-coded headers: green for success, red for failure, yellow for partial/budget.

---

## Event Subscriptions

| Event | Triggered when | Notification type |
|-------|---------------|------------------|
| `dag:end` | Run completes (any status) | Always sent |
| `lane:end` | A lane completes | Only if `notifyLaneEnd: true` |
| `budget:exceeded` | Budget cap hit | Always sent (if `notifyBudget: true`) |

---

## Getting Webhook URLs

### Slack

1. Go to **api.slack.com/apps** → Create new app → **Incoming Webhooks**
2. Enable Incoming Webhooks and click **Add New Webhook to Workspace**
3. Choose the channel and copy the webhook URL

### Microsoft Teams

1. In Teams, right-click the channel → **Connectors**
2. Search **Incoming Webhook** → Configure
3. Name the webhook and copy the URL

---

## Using with GitHub Actions

```yaml
- name: Run AI Review
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
  run: ai-kit run agents/dag.json
```

The CLI picks up `SLACK_WEBHOOK_URL` automatically and posts results on completion.

---

## Related Features

- [Event Bus](./08-event-bus.md) — Events that trigger notifications
- [DAG Orchestration](./01-dag-orchestration.md) — DAG run lifecycle
- [Cost Analytics](./19-cost-analytics.md) — Cost data included in notifications

---

**Last Updated**: March 7, 2026  
**Roadmap**: G-43 — Slack/Teams Notifications  
**Implementation**: `packages/agent-executor/src/lib/notification-sink.ts`
