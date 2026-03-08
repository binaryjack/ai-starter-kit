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
  permissions: string[];
}

export interface RbacPrincipalDefinition {
  role: string;
  laneRestrictions?: Record<string, LaneRestriction>;
  rateLimits?: {
    tokenBudgetPerDay?:  number;
    maxConcurrentRuns?:  number;
    maxRunsPerHour?:     number;
  };
}

export interface RbacPolicyFile {
  version:      1;
  defaultRole?: string;
  roles:        Record<string, RbacRoleDefinition>;
  principals:   Record<string, RbacPrincipalDefinition>;
}

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
