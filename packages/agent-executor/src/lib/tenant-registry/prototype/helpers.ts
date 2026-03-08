import * as path from 'path';
import type { ITenantRunRegistry } from '../tenant-registry.js';

export function _runDir(this: ITenantRunRegistry, runId: string): string {
  return path.join(this.runsRoot, runId);
}

export function _configPath(this: ITenantRunRegistry, runId: string): string {
  return path.join(this._runDir(runId), 'config.json');
}
