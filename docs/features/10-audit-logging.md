# Audit Logging & Compliance

**Status**: ⏳ In Progress | **Priority**: P1 | **Roadmap**: G-07  
**Related**: Authentication & RBAC, Multi-Tenant Isolation

## Overview

Audit logging provides **immutable, tamper-evident records** of all system operations. Critical for compliance (SOC 2, HIPAA, GDPR), forensics, and accountability in multi-user environments.

### Key Capabilities

- **Immutable audit trail** — Hash-chained events prevent tampering
- **Comprehensive coverage** — Every agent call, decision, and approval logged
- **Structured events** — Queryable JSON-NDJSON format
- **Principal tracking** — Know who did what and when
- **Cost attribution** — Track expenses per user/team
- **Compliance reports** — Generate SOC 2/HIPAA documentation

---

## Core Concepts

### Audit Event

Each significant action generates an immutable event:

```typescript
interface AuditEvent {
  // Identity
  runId: string;
  eventId: string;
  principal?: {
    id: string;
    type: 'user' | 'service';
    role?: string;
  };
  
  // Event details
  eventType: AuditEventType;
  action: string;           // Specific operation
  resourceType: string;     // 'dag' | 'lane' | 'check' | etc
  resourceId: string;
  
  // Data
  changes?: {
    before?: unknown;
    after?: unknown;
  };
  
  // Metadata
  timestamp: string;        // ISO-8601
  durationMs: number;
  status: 'success' | 'failure' | 'denied';
  error?: string;
  
  // Financials
  costUSD?: number;
  budgetRemaining?: number;
  
  // Integrity
  previousHash: string;     // SHA256 of previous event
  eventHash: string;        // SHA256 of this event
}
```

### Hash Chaining

Each event includes SHA256 hash of previous event for tamper-evidence:

```
Event 1: { action: 'run:start', eventHash: abc123... }
Event 2: { action: 'lane:start', previousHash: abc123..., eventHash: def456... }
Event 3: { action: 'check:complete', previousHash: def456..., eventHash: ghi789... }

If someone modifies Event 2 offline:
Event 2-modified: { action: 'approve:tool', previousHash: abc123..., eventHash: NEW... }
                                                          ↑
                                            Still points to Event 1

Event 3 now fails validation:
Event 3 expects: previousHash = hash(Event 2)
Event 3 has:     previousHash = def456...
But Event 2-modified has: eventHash = NEW...
                                     ≠ def456...

INTEGRITY COMPROMISED ❌
```

---

## Quick Start

### 1. Enable Audit Logging

```json
{
  "name": "my-workflow",
  "budgetUSD": 5.00,
  "auditLogging": {
    "enabled": true,
    "format": "ndjson",
    "retention": "days:365",
    "hashChaining": true
  },
  "lanes": [ /* ... */ ]
}
```

### 2. Run DAG

```bash
ai-kit agent:dag agents/my-workflow.dag.json

# Audit log created at:
# .agents/audit/<runId>.ndjson
```

### 3. Review Audit Log

```bash
# View raw audit trail
cat .agents/audit/<runId>.ndjson | jq .

# Search for specific events
cat .agents/audit/<runId>.ndjson | jq 'select(.eventType == "check:complete")'

# Verify integrity
ai-kit audit:verify .agents/audit/<runId>.ndjson
```

---

## Audit Events Reference

### Execution Events

| Event | Details | Logged |
|-------|---------|--------|
| `run:start` | DAG execution began | Always |
| `dag:context` | Execution parameters | Always |
| `lane:start` | Lane began executing | Always |
| `lane:end` | Lane completed | Always |
| `check:start` | Individual check started | Always |
| `check:complete` | Check finished (pass/fail) | Always |
| `barrier:reach` | Barrier checkpoint reached | Always |
| `supervisor:verdict` | Checkpoint verdict (APPROVE/RETRY/ESCALATE) | Always |
| `run:end` | DAG execution complete | Always |

### Security Events

| Event | Details | Condition |
|-------|---------|-----------|
| `auth:success` | Principal authenticated | After auth |
| `auth:failure` | Authentication failed | On auth error |
| `permission:granted` | Action allowed | Action proceeds |
| `permission:denied` | Action blocked | RBAC denied |
| `tool:approved` | Tool call approved | Supervisor yes |
| `tool:rejected` | Tool call rejected | Supervisor no |
| `tool:escalated` | Tool call escalated | To human |

### Financial Events

| Event | Details | Logged |
|-------|---------|--------|
| `cost:estimate` | Pre-execution cost estimate | If estimated |
| `cost:accumulate` | Cost increase per check | Per LLM call |
| `budget:warning` | Approaching budget limit | At threshold |
| `budget:exceeded` | Over budget, execution stopped | If limit hit |

### Compliance Events

| Event | Details | Triggered |
|-------|---------|-----------|
| `data:pii_detected` | PII detected in input | If scanning enabled |
| `data:sanitized` | Sensitive data scrubbed | If sanitizer enabled |
| `config:changed` | Policy/config modified | On change |
| `access:granted` | Resource access permitted | Per-resource |
| `access:denied` | Resource access blocked | RBAC check |

---

## Configuration Reference

```typescript
interface AuditConfig {
  // Enable auditing
  enabled: boolean;
  
  // Storage
  storage: {
    path: string;              // Default .agents/audit/
    format: 'ndjson' | 'json'; // Line-delimited or single file
    retention: string;         // 'days:365' or 'unlimited'
  };
  
  // Integrity
  hashChaining: boolean;       // Enable tamper-detection
  compressionEnabled?: boolean; // Gzip audit files
  
  // Privacy
  redactPII?: boolean;
  redactSecrets?: boolean;
  allowedFields?: string[];    // Whitelist fields to log
  
  // Performance
  asyncWrite?: boolean;        // Non-blocking writes
  batchSize?: number;          // Events per batch
  flushIntervalMs?: number;    // Max wait between writes
  
  // Compliance
  compliance?: {
    soc2?: boolean;            // SOC 2 compliance mode
    hipaa?: boolean;           // HIPAA compliance mode
    gdpr?: boolean;            // GDPR compliance mode
  };
}
```

---

## Examples

### Example 1: Full Compliance Audit Trail

```json
{
  "name": "compliant-workflow",
  "auditLogging": {
    "enabled": true,
    "storage": {
      "path": ".agents/audit-logs/",
      "format": "ndjson",
      "retention": "days:2555"
    },
    "hashChaining": true,
    "redactPII": true,
    "redactSecrets": true,
    "compliance": {
      "soc2": true,
      "hipaa": true,
      "gdpr": true
    }
  }
}
```

Generated audit events:
```ndjson
{"runId":"run-001","eventId":"evt-001","eventType":"run:start","principal":{"id":"user@example.com","role":"developer"},"timestamp":"2026-03-05T10:00:00Z","status":"success","eventHash":"abc123...","previousHash":""}
{"runId":"run-001","eventId":"evt-002","eventType":"lane:start","laneId":"backend","timestamp":"2026-03-05T10:00:05Z","status":"success","eventHash":"def456...","previousHash":"abc123..."}
{"runId":"run-001","eventId":"evt-003","eventType":"check:complete","checkId":"api-review","status":"success","costUSD":0.036,"tokens":1247,"timestamp":"2026-03-05T10:00:45Z","eventHash":"ghi789...","previousHash":"def456..."}
```

### Example 2: Financial Audit Trail

Track costs by user and team:

```typescript
// Query audit log for cost tracking
const auditLog = fs.readFileSync('.agents/audit/<runId>.ndjson', 'utf-8');
const events = auditLog.split('\n').map(line => JSON.parse(line));

// Group costs by principal
const costsByUser = {};
events.forEach(event => {
  if (event.costUSD) {
    const userId = event.principal?.id || 'unknown';
    costsByUser[userId] = (costsByUser[userId] || 0) + event.costUSD;
  }
});

console.log('Costs by User:');
Object.entries(costsByUser).forEach(([user, cost]) => {
  console.log(`  ${user}: $${cost.toFixed(2)}`);
});
```

### Example 3: Security Event Detection

```typescript
// Monitor for suspicious patterns
const auditLog = fs.readFileSync('.agents/audit/<runId>.ndjson', 'utf-8');
const events = auditLog.split('\n').map(line => JSON.parse(line));

// Find multiple permission denials
const denials = events.filter(e => e.eventType === 'permission:denied');
if (denials.length > 5) {
  console.warn('⚠️ Multiple permission denials detected');
  denials.forEach(d => {
    console.log(`  ${d.principal?.id} denied: ${d.action}`);
  });
}

// Find cost spikes
const costs = events.filter(e => e.costUSD);
const avgCost = costs.reduce((sum, e) => sum + e.costUSD, 0) / costs.length;
costs.forEach(e => {
  if (e.costUSD > avgCost * 3) {
    console.warn(`⚠️ Unusual cost: ${e.checkId} = $${e.costUSD}`);
  }
});
```

---

## Querying Audit Logs

### Find All LLM Calls by Cost

```bash
cat .agents/audit/<runId>.ndjson | \
  jq 'select(.eventType == "check:complete" and .costUSD)' | \
  jq -s 'sort_by(.costUSD) | reverse[]' | \
  jq '{checkId, costUSD, tokens}'
```

### Timeline of Events

```bash
cat .agents/audit/<runId>.ndjson | \
  jq -r '[.timestamp, .eventType, .status, (.costUSD // "0")] | @tsv' | \
  column -t
```

### Audit Violations

```bash
cat .agents/audit/<runId>.ndjson | \
  jq 'select(.eventType == "permission:denied" or .status == "failure")'
```

---

## Compliance Reports

### Generate SOC 2 Report

```typescript
import { AuditReporter } from '@ai-agencee/ai-kit-executor';

const reporter = new AuditReporter('.agents/audit/');

const report = await reporter.generateSoc2Report({
  startDate: '2026-01-01',
  endDate: '2026-03-05',
  includeEvidence: true
});

// Report includes:
// - User access controls validated
// - All privileged operations logged
// - Failed access attempts documented
// - Encryption verification
// - Incident timeline
```

### Generate HIPAA Compliance Report

```typescript
const report = await reporter.generateHipaaReport({
  startDate: '2026-01-01',
  includeAuditTrail: true,
  verifyEncryption: true,
  validateAccessControls: true
});

// Report includes:
// - Protected health information (PHI) handling
// - Access logs for PHI
// - Encryption at rest/transit
// - User authentication audit
```

---

## Integrity Verification

### Verify Audit Chain

```typescript
import { AuditVerifier } from '@ai-agencee/ai-kit-executor';

const verifier = new AuditVerifier();

const result = await verifier.verify('.agents/audit/<runId>.ndjson');

if (!result.isValid) {
  console.error('❌ Audit trail has been tampered with!');
  result.violations.forEach(v => {
    console.error(`  Line ${v.line}: ${v.reason}`);
  });
} else {
  console.log('✅ Audit trail integrity verified');
  console.log(`Events: ${result.eventCount}`);
  console.log(`Span: ${result.startTime} → ${result.endTime}`);
}
```

### Calculate Audit Hash

```typescript
const fs = require('fs');
const crypto = require('crypto');

function verifyHash(eventLine, previousHash) {
  const event = JSON.parse(eventLine);
  const expectedPreviousHash = event.previousHash;
  
  if (previousHash !== expectedPreviousHash) {
    throw new Error('Hash chain broken!');
  }
  
  // Verify this event's hash
  const eventData = JSON.stringify(event, Object.keys(event).sort());
  const computed = crypto.createHash('sha256').update(eventData).digest('hex');
  
  if (computed !== event.eventHash) {
    throw new Error('Event has been modified!');
  }
  
  return event.eventHash;
}
```

---

## Retention & Archival

### Automatic Archival

```json
{
  "auditLogging": {
    "storage": {
      "retention": "days:90",
      "archiveAfter": "days:30",
      "archivePath": "s3://audit-archive/",
      "compression": "gzip"
    }
  }
}
```

Retention policy:
- Days 0-30: Hot storage (frequently accessed)
- Days 30-90: Archive (cold storage, slower access)
- Day 90+: Deleted

### Long-Term Compliance

```typescript
// Export audit logs for compliance
const exporter = new AuditExporter();

await exporter.exportToS3({
  bucket: 'audit-compliance-archive',
  prefix: `audits/${new Date().getFullYear()}/`,
  format: 'csv',    // CSV for compliance team
  signedUrl: true,  // Tamper-evident seal
  retention: 'years:7'  // 7-year compliance hold
});
```

---

## Related Features

- [Authentication & RBAC](./09-rbac-auth.md) — Principal tracking in audit logs
- [Multi-Tenant Isolation](./11-multi-tenant.md) — Tenant-scoped audit trails
- [Secrets Management](./27-secrets-management.md) — Secret access auditing

---

**Last Updated**: March 5, 2026 | **Version**: 1.0.0
