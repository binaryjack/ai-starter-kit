# Multi-Tenant Isolation

**Status**: ✅ Implemented | **Priority**: P1 | **Roadmap**: G-27  
**Related**: Authentication & RBAC, Audit Logging, DAG Orchestration

## Overview

Multi-tenant isolation ensures that **each tenant's run data is physically separated** on disk and can never be accessed, overwritten, or leaked to another tenant. The `TenantRunRegistry` class is the authoritative storage layer for all agent runs — every read and write goes through a tenant-scoped path.

### Key Capabilities

- **Path isolation** — All run artefacts written under `.agents/tenants/<tenantId>/runs/`
- **GDPR Art. 17** — `deleteTenant()` purges the entire tenant tree irreversibly
- **GDPR Art. 20** — `exportTenant()` copies all run data to a portable directory
- **Zero-config local dev** — Falls back to `"default"` tenant when no ID is set
- **Env-driven in CI** — Set `AIKIT_TENANT_ID` for container/pipeline isolation
- **Append-only event log** — Structured NDJSON event log per run for compliance

---

## Storage Layout

```
.agents/
  tenants/
    <tenantId>/
      runs/
        <runId>/
          config.json       # RunMeta — status, timestamps, dagFile
          events.ndjson     # Append-only structured event log
          result.json       # Final run result (written on completion)
```

Tenant roots never overlap. A run under `acme-corp` is completely invisible to `beta-org`.

---

## Quick Start

### 1. Basic Usage

```typescript
import { TenantRunRegistry } from '@ai-agencee/engine'

// Resolve tenant from AIKIT_TENANT_ID env var, or fall back to "default"
const registry = new TenantRunRegistry(process.cwd())

console.log(registry.tenantId)   // 'default' (or value of AIKIT_TENANT_ID)
console.log(registry.tenantRoot) // '<cwd>/.agents/tenants/default'
```

### 2. Explicit Tenant ID

```typescript
const registry = new TenantRunRegistry(process.cwd(), 'acme-corp')
// All paths scoped to .agents/tenants/acme-corp/
```

### 3. Run Lifecycle

```typescript
// Create a run record
const meta = await registry.create(runId, 'dag.json')
// → { runId, tenantId: 'acme-corp', dagFile: 'dag.json', status: 'running', startedAt: '...' }

// Append a structured event
await registry.appendEvent(runId, { type: 'lane:complete', laneId: 'review', verdict: 'pass' })

// Mark completed with optional result payload
await registry.complete(runId, 'completed', { summary: 'All checks passed' })
// → { ...meta, status: 'completed', completedAt: '...' }
```

---

## Tenant Resolution Priority

`tenantId` is resolved at construction time in this order:

| Priority | Source | Example |
|----------|--------|---------|
| 1 | Constructor argument | `new TenantRunRegistry(root, 'acme-corp')` |
| 2 | `AIKIT_TENANT_ID` env var | `AIKIT_TENANT_ID=acme-corp ai-kit run dag.json` |
| 3 | Hardcoded fallback | `"default"` |

In single-tenant or local development setups, the fallback means you never need to configure anything.

---

## API Reference

### `TenantRunRegistry`

```typescript
class TenantRunRegistry {
  readonly tenantId: string;
  readonly tenantsRoot: string;   // <projectRoot>/.agents/tenants
  readonly tenantRoot: string;    // <tenantsRoot>/<tenantId>
  readonly runsRoot: string;      // <tenantRoot>/runs

  constructor(projectRoot: string, tenantId?: string)

  // Run lifecycle
  create(runId: string, dagFile: string): Promise<RunMeta>
  get(runId: string): Promise<RunMeta>
  complete(runId: string, status?: 'completed' | 'failed' | 'cancelled', result?: unknown): Promise<RunMeta>
  list(): Promise<RunMeta[]>
  appendEvent(runId: string, event: Record<string, unknown>): Promise<void>

  // GDPR operations
  exportTenant(tenantId: string, destDir: string): Promise<TenantExportSummary>
  deleteTenant(tenantId: string): Promise<TenantDeleteSummary>
  listTenants(): Promise<string[]>
}
```

### Types

```typescript
interface RunMeta {
  runId: string;
  tenantId: string;
  dagFile: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;   // ISO-8601
  completedAt?: string; // ISO-8601
}

interface TenantExportSummary {
  tenantId: string;
  destDir: string;
  runCount: number;
  totalBytes: number;
  exportedAt: string;
}

interface TenantDeleteSummary {
  tenantId: string;
  runCount: number;
  totalBytesFreed: number;
  deletedAt: string;
}
```

---

## GDPR Operations

### Export (Art. 20 — Data Portability)

Copies the entire tenant tree to `destDir`:

```typescript
const summary = await registry.exportTenant('acme-corp', '/tmp/acme-export')
console.log(`Exported ${summary.runCount} runs (${summary.totalBytes} bytes)`)
```

Via CLI:

```bash
ai-kit data:export --tenant acme-corp --out ./exports/acme-corp
```

### Delete (Art. 17 — Right to Erasure)

Permanently purges all data for a tenant. This is **irreversible**:

```typescript
const result = await registry.deleteTenant('acme-corp')
console.log(`Deleted ${result.runCount} runs, freed ${result.totalBytesFreed} bytes`)
```

Via CLI:

```bash
ai-kit data:delete --tenant acme-corp
```

### List Tenants

```typescript
const tenants = await registry.listTenants()
// → ['default', 'acme-corp', 'beta-org']
```

Via CLI:

```bash
ai-kit data:list-tenants
```

---

## Multi-Tenant in CI / Containers

Set `AIKIT_TENANT_ID` in your environment to scope all runs automatically:

```yaml
# GitHub Actions
- name: Run AI review
  env:
    AIKIT_TENANT_ID: ${{ github.repository_owner }}
  run: ai-kit run security-review.dag.json
```

```dockerfile
# Dockerfile
ENV AIKIT_TENANT_ID=production
```

```bash
# docker-compose
environment:
  AIKIT_TENANT_ID: ${DEPLOY_ENV:-staging}
```

---

## Events NDJSON Format

Each call to `appendEvent()` appends a JSON line with a `_ts` timestamp:

```ndjson
{"type":"lane:start","laneId":"review","_ts":"2026-03-07T10:00:00.000Z"}
{"type":"check:pass","checkId":"lint","_ts":"2026-03-07T10:00:01.234Z"}
{"type":"lane:complete","laneId":"review","verdict":"pass","_ts":"2026-03-07T10:00:05.678Z"}
```

The file is append-only — it can be tailed in real time:

```bash
tail -f .agents/tenants/acme-corp/runs/<runId>/events.ndjson | jq .
```

---

## Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Cross-tenant path traversal | `tenantId` validated — no `..` segments allowed |
| Concurrent writes to the same run | `appendEvent` uses atomic `fs.appendFile` |
| Orphaned run directories | `list()` returns all runs including `running` → detect stale runs |
| Backup / disaster recovery | `exportTenant` output is a plain directory tree — standard backup tools apply |

---

## Related Features

- [Authentication & RBAC](./09-rbac-auth.md) — Identity and permission enforcement
- [Audit Logging](./10-audit-logging.md) — Hash-chained immutable audit trails
- [DAG Orchestration](./01-dag-orchestration.md) — Run execution model
- [PII Scrubbing & Security](./12-pii-security.md) — Prevent credential leakage in prompts

---

**Last Updated**: March 7, 2026  
**Roadmap**: G-27 — Multi-Tenant Isolation  
**Implementation**: `packages/agent-executor/src/lib/tenant-registry.ts`
