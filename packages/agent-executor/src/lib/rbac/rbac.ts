import * as fs   from 'fs/promises';
import * as os   from 'os';
import * as path from 'path';

import type { RbacPolicyFile, RbacPrincipalDefinition } from './rbac.types.js';
export  { RbacDeniedError }                             from './rbac.types.js';

import './prototype/index.js';

export interface IRbacPolicy {
  new(policyFile: RbacPolicyFile): IRbacPolicy;
  // static
  load(projectRoot: string): Promise<IRbacPolicy>;
  permissive(): IRbacPolicy;
  locked(): IRbacPolicy;
  resolvePrincipal(): string;
  // instance state
  _policyFile: RbacPolicyFile;
  // instance methods
  can(principal: string, action: string): boolean;
  canRunLane(principal: string, laneId: string): boolean;
  assertCan(principal: string, action: string, resource?: string): void;
  checkLanes(principal: string, laneIds: string[]): Record<string, boolean>;
  principalsWith(action: string): string[];
  getRateLimits(principal: string): RbacPrincipalDefinition['rateLimits'];
  summarize(): Record<string, unknown>;
  _permissions(principal: string): string[];
  _matches(permission: string, action: string): boolean;
}

export const RbacPolicy = function(
  this:       IRbacPolicy,
  policyFile: RbacPolicyFile,
) {
  this._policyFile = policyFile;
} as unknown as IRbacPolicy;

(RbacPolicy as Record<string, unknown>).load = async function(
  projectRoot: string,
): Promise<IRbacPolicy> {
  const filePath = path.join(projectRoot, '.agents', 'rbac.json');
  try {
    const raw    = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as RbacPolicyFile;
    return new RbacPolicy(parsed);
  } catch {
    return (RbacPolicy as unknown as { permissive(): IRbacPolicy }).permissive();
  }
};

(RbacPolicy as Record<string, unknown>).permissive = function(): IRbacPolicy {
  return new RbacPolicy({
    version:     1,
    defaultRole: 'admin',
    roles:       { admin: { permissions: ['*'] } },
    principals:  {},
  });
};

(RbacPolicy as Record<string, unknown>).locked = function(): IRbacPolicy {
  return new RbacPolicy({
    version:     1,
    defaultRole: 'observer',
    roles: {
      admin:    { permissions: ['*'] },
      observer: { permissions: [] },
    },
    principals: {},
  });
};

(RbacPolicy as Record<string, unknown>).resolvePrincipal = function(): string {
  return (
    process.env['AIKIT_PRINCIPAL'] ||
    process.env['GIT_AUTHOR_NAME'] ||
    process.env['USERNAME']        ||
    process.env['USER']            ||
    os.hostname()                  ||
    '<anonymous>'
  );
};
