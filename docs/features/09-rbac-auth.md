# Authentication & RBAC (Role-Based Access Control)

**Status**: ⏳ In Progress | **Priority**: P1 | **Roadmap**: G-06  
**Related**: Multi-Tenant Isolation, Audit Logging

## Overview

Role-Based Access Control (RBAC) enables **fine-grained permission management** for DAG execution, lane access, and sensitive operations. Combined with identity management, it provides **multi-user and multi-team support** with least-privilege principles.

### Key Capabilities

- **Role-based permissions** — Define custom roles with specific capabilities
- **Lane-level restrictions** — Different teams access different lanes
- **Run isolation** — Users see only their own runs
- **Operation gating** — Approve write/shell operations
- **Service principal support** — CI/CD pipeline identities
- **Audit integration** — Record who did what

---

## Core Concepts

### Identity Model

```typescript
interface Principal {
  // Identity
  id: string;              // Unique identifier
  type: 'user' | 'service' | 'team';
  
  // Authentication
  authProvider: 'oidc' | 'service-principal' | 'api-key';
  
  // Authorization
  role: string;            // e.g., 'developer', 'security-lead'
  
  // Multi-tenancy
  tenantId?: string;       // Scoped to tenant if set
  
  // Constraints
  laneRestrictions?: Record<string, LaneAccess>;
}

interface LaneAccess {
  canRead: boolean;
  canExecute: boolean;
  canApprove: boolean;
}
```

### Role Definitions

```typescript
interface Role {
  name: string;
  permissions: Permission[];
  description?: string;
}

type Permission =
  | 'run:create'      // Initiate DAG runs
  | 'run:read'        // View run results
  | 'run:cancel'      // Stop running DAGs
  | 'lane:execute'    // Execute checks in specific lane
  | 'tool:write'      // Approve write operations
  | 'tool:shell'      // Approve shell operations
  | 'audit:read'      // Access audit logs
  | 'config:modify'   // Change DAG/agent configs;
```

---

## Quick Start

### 1. Define Roles

Create `agents/rbac-policy.json`:

```json
{
  "roles": [
    {
      "name": "developer",
      "description": "Can run DAGs and view results",
      "permissions": [
        "run:create",
        "run:read",
        "lane:execute",
        "tool:write",
        "tool:shell"
      ]
    },
    {
      "name": "security-lead",
      "description": "Can approve security operations",
      "permissions": [
        "run:create",
        "run:read",
        "lane:execute",
        "tool:write",
        "tool:shell",
        "audit:read"
      ]
    },
    {
      "name": "viewer",
      "description": "Read-only access",
      "permissions": ["run:read"]
    }
  ],
  
  "laneRestrictions": {
    "security": {
      "developer": { "canRead": false, "canExecute": false },
      "security-lead": { "canRead": true, "canExecute": true }
    },
    "backend": {
      "developer": { "canRead": true, "canExecute": true },
      "frontend-team": { "canRead": false, "canExecute": false }
    }
  }
}
```

### 2. Authenticate Principal

```typescript
import { AuthenticationManager } from '@ai-agencee/engine';

const authManager = new AuthenticationManager();

// Authenticate user (from token, cookie, etc.)
const principal = await authManager.authenticate({
  token: bearerToken,
  provider: 'oidc'
});

// principal = {
//   id: 'user@example.com',
//   type: 'user',
//   role: 'developer',
//   authProvider: 'oidc'
// }
```

### 3. Enforce Permissions

```typescript
const orchestrator = new DagOrchestrator(projectRoot, { principal });

// Orchestrator checks permissions before allowing:
// - Can user create runs? (run:create)
// - Can user execute backend lane? (lane:execute + laneRestrictions)
// - Can user approve writes? (tool:write)

const result = await orchestrator.execute(dagDefinition, {
  principal  // Passed through entire execution
});
```

---

## Configuration Reference

### RBAC Policy

```typescript
interface RbacPolicy {
  // Role definitions
  roles: RoleDefinition[];
  
  // Lane-level access control
  laneRestrictions: Record<string, LaneRestriction>;
  
  // Global settings
  settings?: {
    defaultRole?: string;
    enforceApproval?: boolean;  // All operations need approval?
    auditLogging?: boolean;
  };
}

interface RoleDefinition {
  name: string;
  permissions: Permission[];
  description?: string;
  inherits?: string[];  // Role inheritance
}

interface LaneRestriction {
  [roleName: string]: {
    canRead: boolean;
    canExecute: boolean;
    canApprove?: boolean;
    maxCostUSD?: number;
  };
}
```

### Principal Context

Pass principal through execution:

```typescript
interface ExecutionContext {
  principal: Principal;
  requestId: string;
  timestamp: string;
  sourceSystem?: string;  // 'cli' | 'api' | 'mcp' | 'github-action'
}

const result = await orchestrator.execute(dagDefinition, {
  context: {
    principal,
    requestId: 'req-12345',
    sourceSystem: 'ci-pipeline'
  }
});
```

---

## Authentication Flows

### OAuth 2.0 / OIDC

Authenticate users with identity provider:

```typescript
import { OidcAuthProvider } from '@ai-agencee/ai-kit-executor';

const oidc = new OidcAuthProvider({
  discoveryUrl: 'https://your-idp.example.com/.well-known/openid-configuration',
  clientId: process.env.OIDC_CLIENT_ID,
  clientSecret: process.env.OIDC_CLIENT_SECRET
});

const principal = await oidc.authenticate(bearerToken);
// Returns: { id, type: 'user', authProvider: 'oidc', role: 'developer' }
```

### Service Principal (API Key)

For CI/CD pipelines:

```typescript
import { ServicePrincipalAuth } from '@ai-agencee/ai-kit-executor';

const spAuth = new ServicePrincipalAuth({
  keyVaultUrl: 'https://vault.azure.net',
  keyName: 'ai-kit-ci-service-principal'
});

const principal = await spAuth.authenticate(apiKey);
// Returns: { id: 'ci-pipeline', type: 'service', role: 'ci-executor' }
```

### API Token

Direct token-based authentication:

```typescript
const apiKey = req.headers['x-api-key'];
const principal = {
  id: `api-${crypto.randomUUID()}`,
  type: 'service',
  authProvider: 'api-key',
  role: 'developer',
  tenantId: extractTenantFromKey(apiKey)
};
```

---

## Examples

### Example 1: Team-Based Lane Restrictions

```json
{
  "roles": [
    { "name": "backend-team", "permissions": ["run:create", "run:read", "lane:execute"] },
    { "name": "frontend-team", "permissions": ["run:create", "run:read", "lane:execute"] },
    { "name": "security-team", "permissions": ["run:create", "run:read", "audit:read"] }
  ],
  
  "laneRestrictions": {
    "backend": {
      "backend-team": { "canRead": true, "canExecute": true },
      "frontend-team": { "canRead": true, "canExecute": false },
      "security-team": { "canRead": true, "canExecute": false }
    },
    "frontend": {
      "frontend-team": { "canRead": true, "canExecute": true },
      "backend-team": { "canRead": true, "canExecute": false },
      "security-team": { "canRead": true, "canExecute": false }
    },
    "security": {
      "security-team": { "canRead": true, "canExecute": true },
      "backend-team": { "canRead": false, "canExecute": false },
      "frontend-team": { "canRead": false, "canExecute": false }
    }
  }
}
```

### Example 2: CI/CD Pipeline Principal

```typescript
// GitHub Actions workflow
const principal: Principal = {
  id: `github-${process.env.GITHUB_RUN_ID}`,
  type: 'service',
  authProvider: 'service-principal',
  role: 'ci-executor',
  tenantId: 'github-actions'
};

const orchestrator = new DagOrchestrator(projectRoot, { principal });

// CI can only:
// - Execute specific lanes (e.g., 'testing', 'security')
// - Auto-approve certain tools
// - Cannot access sensitive data
```

### Example 3: Hierarchical Roles

```json
{
  "roles": [
    {
      "name": "viewer",
      "permissions": ["run:read"]
    },
    {
      "name": "developer",
      "inherits": ["viewer"],
      "permissions": [
        "run:create",
        "lane:execute",
        "tool:write"
      ]
    },
    {
      "name": "security-lead",
      "inherits": ["developer"],
      "permissions": [
        "tool:shell",
        "audit:read",
        "config:modify"
      ]
    },
    {
      "name": "admin",
      "inherits": ["security-lead"],
      "permissions": ["*"]  // Full access
    }
  ]
}
```

---

## Permission Checks

### At DAG Start

```typescript
// Check before creating run
if (!principal.permissions.includes('run:create')) {
  throw new PermissionError('User cannot create runs');
}
```

### Per-Lane Execution

```typescript
// Check before executing lane
const laneRestriction = policy.laneRestrictions[lane.id]?.[principal.role];

if (!laneRestriction?.canExecute) {
  throw new PermissionError(`User cannot execute lane: ${lane.id}`);
}
```

### Before Tool Operations

```typescript
// Check before approving write
if (!principal.permissions.includes('tool:write')) {
  return 'ESCALATE';  // Wait for human approval
}

// Check before approving shell
if (!principal.permissions.includes('tool:shell')) {
  return 'REJECT';    // Don't allow shell execution
}
```

---

## Multi-Tenancy

### Tenant-Scoped Runs

```typescript
// Principal has tenantId
const principal = {
  id: 'user@example.com',
  tenantId: 'acme-corp',
  role: 'developer'
};

// All runs automatically scoped to tenant
// .agents/tenants/acme-corp/runs/<runId>/
```

### Tenant Isolation

```typescript
// Query only returns runs for principal's tenant
const myRuns = await runRegistry.listRuns({
  principal  // Automatically filters by tenantId
});

// Audit logs also tenant-scoped
// .agents/tenants/acme-corp/audit/<runId>.ndjson
```

---

## Monitoring & Audit

### Permission Denied Events

```typescript
orchestrator.on('auth:denied', (event) => {
  console.log(`Permission denied: ${event.principal.id}`);
  console.log(`  Action: ${event.action}`);
  console.log(`  Required: ${event.requiredPermission}`);
  console.log(`  Reason: ${event.reason}`);
  
  // Log for compliance
  auditLog.record({
    action: 'auth:denied',
    principal: event.principal,
    details: event
  });
});
```

### Access Logs

```typescript
orchestrator.on('operation:complete', (event) => {
  auditLog.record({
    action: 'operation:complete',
    principal: event.principal,
    operation: event.operationType,
    result: event.status,
    costUSD: event.cost,
    timestamp: new Date()
  });
});
```

---

## Troubleshooting

### "Access denied" for lane execution
- **Check**: User's role has permission
- **Verify**: `laneRestrictions` has entry for lane + role
- **Confirm**: `canExecute: true` set for that combination

### "Cannot approve tool operations"
- **Ensure**: Principal has `tool:write` or `tool:shell` permission
- **Check**: If `enforceApproval: true`, only specific roles can approve

### "Different permissions for same user in CI vs local"
- **Verify**: Same role assigned in both contexts
- **Check**: Service principal has correct role
- **Compare**: RBAC policies match between environments

---

## Related Features

- [Audit Logging](./10-audit-logging.md) — Records all permission checks
- [Multi-Tenant Isolation](./11-multi-tenant.md) — Enforces tenant boundaries
- [Secrets Management](./27-secrets-management.md) — Secret access control

---

**Last Updated**: March 5, 2026 | **Version**: 1.0.0
