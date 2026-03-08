import type { ContractSnapshot } from '../../dag-types.js';
import type { IContractRegistry } from '../contract-registry.js';

export function publish(
  this: IContractRegistry,
  laneId: string,
  snapshot: Omit<ContractSnapshot, 'version' | 'timestamp'>,
): ContractSnapshot {
  const version  = (this._versions.get(laneId) ?? 0) + 1;
  const stamped: ContractSnapshot = {
    ...snapshot,
    laneId,
    version,
    timestamp: new Date().toISOString(),
  };
  this._snapshots.set(laneId, stamped);
  this._versions.set(laneId, version);
  return stamped;
}

export function getSnapshot(this: IContractRegistry, laneId: string): ContractSnapshot | undefined {
  return this._snapshots.get(laneId);
}

export function getVersion(this: IContractRegistry, laneId: string): number {
  return this._versions.get(laneId) ?? 0;
}

export function has(this: IContractRegistry, laneId: string): boolean {
  return this._snapshots.has(laneId);
}

export function publishedLanes(this: IContractRegistry): string[] {
  return [...this._snapshots.keys()];
}

export function getAll(this: IContractRegistry): Map<string, ContractSnapshot> {
  return new Map(this._snapshots);
}

export function formatStatus(this: IContractRegistry): string {
  if (this._snapshots.size === 0) return '  (no snapshots yet)';
  return [...this._snapshots.entries()]
    .map(([id, s]) => `  ${id.padEnd(20)} v${s.version}  ${s.timestamp}`)
    .join('\n');
}

export function clear(this: IContractRegistry): void {
  this._snapshots.clear();
  this._versions.clear();
}
