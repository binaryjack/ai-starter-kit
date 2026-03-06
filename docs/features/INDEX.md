# Features Documentation Index

Welcome to the comprehensive feature documentation for ai-agencee/ai-kit. This directory contains detailed guides, examples, and implementation references for all core and advanced features.

## Quick Navigation

### 🎯 Core Concepts
- [DAG Definition & Orchestration](./01-dag-orchestration.md) — JSON-declarative parallel execution model
- Agent Types & Roles — Business Analyst, Architecture, Backend, Frontend, Testing, E2E *(guide planned)*
- [Model Routing & Cost Tracking](./03-model-routing-cost.md) — Intelligent provider selection and budget management
- Check Handlers & Validators — File validation, grepping, LLM reviews, command execution *(guide planned)*

### ⚡ Execution Features
- [Streaming Output](./05-streaming-output.md) — Real-time token streaming from LLM providers
- [Tool-Use Integration](./06-tool-use.md) — Agents using file/shell/API tools within LLM turns
- [Retry Policies & Circuit Breakers](./07-resilience-patterns.md) — Exponential backoff and provider health management
- [Event Bus & Live Events](./08-event-bus.md) — Typed event emitter for real-time subscriptions

### 🔐 Enterprise & Security
- [Authentication & RBAC](./09-rbac-auth.md) — Role-based access control and identity management
- [Audit Logging & Compliance](./10-audit-logging.md) — Hash-chained immutable audit trails
- Multi-Tenant Isolation — Per-tenant run and data isolation *(guide planned)*
- PII Scrubbing & Injection Defense — Data sanitization and prompt injection prevention *(guide planned)*

### 👨‍💻 Developer Experience
- [TypeScript DAG Builder API](./13-dag-builder-api.md) — Type-safe, fluent DSL for DAG construction
- Plugin System & Custom Checks — Extend check types and handlers *(guide planned)*
- CLI Commands Reference — All CLI operations with examples *(guide planned)*
- MCP Integration — Claude Desktop and VS Code integration *(guide planned)*

### 📊 Observability & Analytics
- OpenTelemetry Integration — Distributed tracing and metrics collection *(guide planned)*
- Real-time Dashboard — Web UI for live lane status and cost visibility *(guide planned)*
- Cost Analytics & Reporting — Detailed cost breakdown and budget enforcement *(guide planned)*
- Vector Memory & Cross-Run Learning — Persistent embeddings for semantic recall *(guide planned)*

### 🔌 Integrations & Extensions
- Event-Driven Triggers — GitHub webhooks, file watchers, scheduled execution *(guide planned)*
- WebSocket/SSE Live API — Real-time event streaming for external systems *(guide planned)*
- Provider Configuration — Anthropic, OpenAI, Ollama, Gemini, Bedrock setup *(guide planned)*
- Slack/Teams Notifications — Run status and result routing to messaging platforms *(guide planned)*

### 🚀 Quick-Start Features
- Demo Mode & Getting Started — Zero-API-key introduction and pnpm demo *(guide planned)*
- JSON Schema & IDE Support — IntelliSense for DAG and agent files *(guide planned)*
- Secrets Management — Vault integration and scoped secrets *(guide planned)*

---

## Feature Documentation Status

| Feature | Guide | Status | Priority | Roadmap |
|---------|-------|--------|----------|---------|
| DAG Orchestration | [01](./01-dag-orchestration.md) | ✅ Documented | P0 | Core |
| Agent Types & Roles | [02](./02-agent-types-roles.md) | 🔜 Planned | P0 | Core |
| Model Routing & Cost | [03](./03-model-routing-cost.md) | ✅ Documented | P0 | Core |
| Check Handlers | [04](./04-check-handlers.md) | 🔜 Planned | P0 | Core |
| Streaming Output | [05](./05-streaming-output.md) | ✅ Documented | P0 | G-01 |
| Tool-Use Integration | [06](./06-tool-use.md) | ✅ Documented | P0 | G-02 |
| Resilience Patterns | [07](./07-resilience-patterns.md) | ✅ Documented | P1 | G-10/11/12 |
| Event Bus & Events | [08](./08-event-bus.md) | ✅ Documented | P1 | G-14/28 |
| Authentication/RBAC | [09](./09-rbac-auth.md) | ✅ Documented | P1 | G-06 |
| Audit Logging | [10](./10-audit-logging.md) | ✅ Documented | P1 | G-07 |
| Multi-Tenant Isolation | [11](./11-multi-tenant.md) | 🔜 Planned | P1 | G-27 |
| PII & Security | [12](./12-pii-security.md) | 🔜 Planned | P1 | G-30/31 |
| DAG Builder API | [13](./13-dag-builder-api.md) | ✅ Documented | P0 | G-22 |
| Plugin System | [14](./14-plugin-system.md) | 🔜 Planned | P2 | G-18 |
| CLI Commands | [15](./15-cli-commands.md) | 🔜 Planned | P0 | Core |
| MCP Integration | [16](./16-mcp-integration.md) | 🔜 Planned | P0 | Core |
| OpenTelemetry | [17](./17-opentelemetry.md) | 🔜 Planned | P1 | G-08 |
| Real-time Dashboard | [18](./18-dashboard.md) | 🔜 Planned | P1 | G-26 |
| Cost Analytics | [19](./19-cost-analytics.md) | 🔜 Planned | P1 | Core |
| Vector Memory | [20](./20-vector-memory.md) | 🔜 Planned | P1 | G-24/25 |
| Event-Driven Triggers | [21](./21-event-triggers.md) | 🔜 Planned | P2 | G-16 |
| WebSocket/SSE API | [22](./22-websocket-sse.md) | 🔜 Planned | P1 | G-28 |
| Provider Config | [23](./23-provider-config.md) | 🔜 Planned | P2 | Core |
| Notifications | [24](./24-notifications.md) | 🔜 Planned | P2 | G-43 |
| Demo Mode | [25](./25-demo-mode.md) | 🔜 Planned | P0 | G-21/04 |
| JSON Schema | [26](./26-json-schema.md) | 🔜 Planned | P0 | G-23 |
| Secrets Management | [27](./27-secrets-management.md) | 🔜 Planned | P1 | G-09 |

---

## By Roadmap Phase

### Phase 0: Foundation (Implemented ✅)
- JSON-declarative DAG execution
- Multi-provider model routing
- Per-run cost tracking
- File-based RBAC
- CLI integration
- MCP protocol support

### Phase 1: Production-Ready (In Progress ⏳)
- Streaming output (G-01)
- Tool-use integration (G-02)
- Authentication & RBAC (G-06)
- Audit trails (G-07)
- OpenTelemetry (G-08)
- Resilience patterns (G-10, G-11, G-12)

### Phase 2: Enterprise Scale (Planned 🔜)
- Vector memory (G-24, G-25)
- Real-time dashboard (G-26)
- Multi-tenant isolation (G-27)
- WebSocket/SSE events (G-28)
- Rate limiting (G-29)
- PII scrubbing (G-30)

### Phase 3: Competitive Moat (Planned 🔜)
- Additional providers (Ollama, Gemini, Bedrock)
- Model benchmarking
- Agent distillation
- Code execution sandbox
- Multimodal input

### Phase 4: Ecosystem (Planned 🔜)
- GitHub Marketplace Action
- Docker images
- Jira/Linear sync
- Slack/Teams notifications
- GitHub PR auto-commenting
- Python SDK

---

## Documentation Conventions

### Code Examples
All code examples are executable and tested against the current codebase. Language-specific examples are marked:

```typescript
// TypeScript example
const builder = new DagBuilder('my-dag');
```

```bash
# Shell command
pnpm run demo
```

### Configuration Examples
Configuration files reference actual schema locations:

- DAG files: `schemas/dag.schema.json`
- Agent files: `schemas/agent.schema.json`
- Model router: `agents/model-router.json`

### Cross-References
Features are cross-referenced where relevant. For example, streaming output references both the LLM provider interface and the check-runner integration.

---

## Getting Help

Each guide includes:
- **Overview** — Feature purpose and benefits
- **Quick Start** — Minimal working example
- **Configuration** — All available options
- **Examples** — Real-world use cases
- **Troubleshooting** — Common issues and solutions
- **Implementation Details** — Internal architecture
- **Related Features** — Links to dependent or related features

## Contributing Documentation

New features should include documentation following the same structure. See the [documentation template](#) for the standard format.

---

**Last Updated**: March 5, 2026  
**Version**: 1.0.0+  
**Maintainer**: ai-agencee team
