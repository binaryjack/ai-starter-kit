/**
 * rbac.ts — File-based Role-Based Access Control for AI-Kit DAG runs.
 *
 * ## Policy file: .agents/rbac.json
 * ```json
 * {
 *   "version": 1,
 *   "defaultRole": "observer",
 *   "roles": {
 *     "admin":     { "permissions": ["*"] },
 *     "developer": { "permissions": ["run:*", "audit:read"] },
 *     "reviewer":  { "permissions": ["audit:read", "verdict:override"] },
 *     "observer":  { "permissions": ["audit:read"] }
 *   },
 *   "principals": {
 *     "alice":   { "role": "admin" },
 *     "bob":     { "role": "developer" },
 *     "ci-bot":  { "role": "developer", "laneRestrictions": { "security-review": "deny" } },
 *     "auditor": { "role": "reviewer" }
 *   }
 * }
 * ```
 *
 * ## Identity resolution (first match wins)
 *   1. `AIKIT_PRINCIPAL` environment variable
 *   2. `GIT_AUTHOR_NAME` environment variable
 *   3. `USERNAME` / `USER` environment variable
 *   4. Hostname
 *   5. Falls back to `<anonymous>` — gets the `defaultRole`
 *
 * ## Usage
 * ```typescript
 * const policy = await RbacPolicy.load(projectRoot);
 * policy.assertCan('alice', 'run', 'backend');   // throws if denied
 * const ok = policy.can('bob', 'audit:read');
 * const who = RbacPolicy.resolvePrincipal();
 * ```
 */

import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RbacAction =
  | 'run'
  | 'audit:read'
  | 'audit:verify'
  | 'verdict:override'
  | 'budget:override'
  | 'interactive:pause'
  | '*';

export type LaneRestriction = 'allow' | 'deny';

export interface RbacRoleDefinition {
  /**
   * Flat list of permission strings.
   * - `'*'`          = all permissions (admin)
   * - `'run:*'`      = run any lane
   * - `'run:<laneId>'` = run a specific lane
   * - `'audit:read'` = read audit logs
   * - etc.
   */
  permissions: string[];
}

export interface RbacPrincipalDefinition {
  /** Role name — must match a key in `roles` */
  role: string;
  /** Per-lane overrides: { "<laneId>": "allow" | "deny" } */
  laneRestrictions?: Record<string, LaneRestriction>;
}

export interface RbacPolicyFile {
  version: 1;
  /** Role assigned to principals not listed in `principals` */
  defaultRole?: string;
  roles:      Record<string, RbacRoleDefinition>;
  principals: Record<string, RbacPrincipalDefinition>;
}

// ─── RbacDeniedError ─────────────────────────────────────────────────────────

export class RbacDeniedError extends Error {
  constructor(
    public readonly principal: string,
    public readonly action:    string,
    public readonly resource?: string,
  ) {
    const target = resource ? ` on "${resource}"` : '';
    super(`RBAC: principal "${principal}" is denied action "${action}"${target}`);
    this.name = 'RbacDeniedError';
  }
}

// ─── RbacPolicy ──────────────────────────────────────────────────────────────

export class RbacPolicy {
  private readonly policyFile: RbacPolicyFile;

  private constructor(policyFile: RbacPolicyFile) {
    this.policyFile = policyFile;
  }

  // ─── Loaders ───────────────────────────────────────────────────────────────

  /**
   * Load the RBAC policy from `<projectRoot>/.agents/rbac.json`.
   * Returns a permissive policy (all actions allowed) if the file is absent —
   * i.e. projects that don't configure RBAC are not locked out.
   */
  static async load(projectRoot: string): Promise<RbacPolicy> {
    const filePath = path.join(projectRoot, '.agents', 'rbac.json');
    try {
      const raw     = await fs.readFile(filePath, 'utf-8');
      const parsed  = JSON.parse(raw) as RbacPolicyFile;
      return new RbacPolicy(parsed);
    } catch {
      // No RBAC file — open policy
      return RbacPolicy.permissive();
    }
  }

  /** Create an open policy that allows everything. Useful as default. */
  static permissive(): RbacPolicy {
    return new RbacPolicy({
      version:     1,
      defaultRole: 'admin',
      roles:       { admin: { permissions: ['*'] } },
      principals:  {},
    });
  }

  /** Create a locked-down policy that denies everything by default. */
  static locked(): RbacPolicy {
    return new RbacPolicy({
      version:     1,
      defaultRole: 'observer',
      roles: {
        admin:    { permissions: ['*'] },
        observer: { permissions: [] },
      },
      principals: {},
    });
  }

  // ─── Identity resolution ──────────────────────────────────────────────────

  /**
   * Resolve the current principal from environment variables.
   * Override with `AIKIT_PRINCIPAL` for CI / service accounts.
   */
  static resolvePrincipal(): string {
    return (
      process.env['AIKIT_PRINCIPAL']  ||
      process.env['GIT_AUTHOR_NAME']  ||
      process.env['USERNAME']         ||
      process.env['USER']             ||
      os.hostname()                   ||
      '<anonymous>'
    );
  }

  // ─── Permission checks ────────────────────────────────────────────────────

  /**
   * Resolve the effective permissions for a principal.
   * Falls back to `defaultRole` if the principal is not in the policy.
   */
  private _permissions(principal: string): string[] {
    const pd = this.policyFile.principals[principal];
    const roleName = pd?.role ?? this.policyFile.defaultRole ?? 'observer';
    const role = this.policyFile.roles[roleName];
    return role?.permissions ?? [];
  }

  /**
   * Check whether a permission string matches an action.
   * Supports wildcards: `'*'` and `'run:*'`.
   */
  private _matches(permission: string, action: string): boolean {
    if (permission === '*') return true;
    if (permission === action) return true;
    // Prefix wildcard: 'run:*' matches 'run' and 'run:backend'
    if (permission.endsWith(':*')) {
      const prefix = permission.slice(0, -2);
      return action === prefix || action.startsWith(`${prefix}:`);
    }
    return false;
  }

  /**
   * Returns `true` if `principal` has the given `action` permission.
   * Does NOT throw — use `assertCan()` if you want an exception on denial.
   */
  can(principal: string, action: string): boolean {
    const perms = this._permissions(principal);
    return perms.some((p) => this._matches(p, action));
  }

  /**
   * Check whether `principal` can run a specific lane.
   * Checks `run` (or `run:<laneId>`) permission, then applies per-principal
   * `laneRestrictions` overrides.
   */
  canRunLane(principal: string, laneId: string): boolean {
    const pd = this.policyFile.principals[principal] ??
      { role: this.policyFile.defaultRole ?? 'observer' };

    // Check lane-level override first
    const restriction = pd.laneRestrictions?.[laneId];
    if (restriction === 'deny')  return false;
    if (restriction === 'allow') return true;

    // Fall back to role permissions
    return this.can(principal, 'run') || this.can(principal, `run:${laneId}`);
  }

  /**
   * Assert that `principal` can perform `action` (optionally on `resource`).
   * Throws `RbacDeniedError` if denied.
   */
  assertCan(principal: string, action: string, resource?: string): void {
    const allowed = resource
      ? (action === 'run' ? this.canRunLane(principal, resource) : this.can(principal, action))
      : this.can(principal, action);

    if (!allowed) {
      throw new RbacDeniedError(principal, action, resource);
    }
  }

  /**
   * Validate that `principal` can run all lanes in the given set.
   * Returns a map of laneId → allowed.
   */
  checkLanes(principal: string, laneIds: string[]): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const id of laneIds) {
      result[id] = this.canRunLane(principal, id);
    }
    return result;
  }

  /**
   * List all principals that have a specific permission.
   * Useful for UI/config introspection.
   */
  principalsWith(action: string): string[] {
    return Object.keys(this.policyFile.principals).filter((p) => this.can(p, action));
  }

  /** Return a summary of the loaded policy for logging / audit. */
  summarize(): Record<string, unknown> {
    return {
      version:      this.policyFile.version,
      defaultRole:  this.policyFile.defaultRole,
      roleCount:    Object.keys(this.policyFile.roles).length,
      principalCount: Object.keys(this.policyFile.principals).length,
      roles:        Object.keys(this.policyFile.roles),
    };
  }
}
