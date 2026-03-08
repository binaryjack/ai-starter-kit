import type { IRbacPolicy } from '../rbac.js';
import type { RbacPrincipalDefinition } from '../rbac.types.js';
import { RbacDeniedError } from '../rbac.types.js';

export function can(this: IRbacPolicy, principal: string, action: string): boolean {
  const perms = this._permissions(principal);
  return perms.some((p) => this._matches(p, action));
}

export function canRunLane(this: IRbacPolicy, principal: string, laneId: string): boolean {
  const pd = this._policyFile.principals[principal] ??
    { role: this._policyFile.defaultRole ?? 'observer' };

  const restriction = pd.laneRestrictions?.[laneId];
  if (restriction === 'deny')  return false;
  if (restriction === 'allow') return true;

  return this.can(principal, 'run') || this.can(principal, `run:${laneId}`);
}

export function assertCan(
  this:      IRbacPolicy,
  principal: string,
  action:    string,
  resource?: string,
): void {
  const allowed = resource
    ? (action === 'run' ? this.canRunLane(principal, resource) : this.can(principal, action))
    : this.can(principal, action);

  if (!allowed) {
    throw new RbacDeniedError(principal, action, resource);
  }
}

export function checkLanes(
  this:     IRbacPolicy,
  principal: string,
  laneIds:   string[],
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const id of laneIds) {
    result[id] = this.canRunLane(principal, id);
  }
  return result;
}

export function principalsWith(this: IRbacPolicy, action: string): string[] {
  return Object.keys(this._policyFile.principals).filter((p) => this.can(p, action));
}

export function getRateLimits(
  this:      IRbacPolicy,
  principal: string,
): RbacPrincipalDefinition['rateLimits'] {
  return this._policyFile.principals[principal]?.rateLimits;
}

export function summarize(this: IRbacPolicy): Record<string, unknown> {
  return {
    version:        this._policyFile.version,
    defaultRole:    this._policyFile.defaultRole,
    roleCount:      Object.keys(this._policyFile.roles).length,
    principalCount: Object.keys(this._policyFile.principals).length,
    roles:          Object.keys(this._policyFile.roles),
  };
}

export function _permissions(this: IRbacPolicy, principal: string): string[] {
  const pd       = this._policyFile.principals[principal];
  const roleName = pd?.role ?? this._policyFile.defaultRole ?? 'observer';
  const role     = this._policyFile.roles[roleName];
  return role?.permissions ?? [];
}

export function _matches(this: IRbacPolicy, permission: string, action: string): boolean {
  if (permission === '*')    return true;
  if (permission === action) return true;
  if (permission.endsWith(':*')) {
    const prefix = permission.slice(0, -2);
    return action === prefix || action.startsWith(`${prefix}:`);
  }
  return false;
}
