import type { ContractSnapshot } from '../../dag-types.js';
import type { IContractRegistry } from '../contract-registry.js';

export function waitForVersion(
  this: IContractRegistry,
  laneId: string,
  minVersion: number,
  timeoutMs: number,
  pollIntervalMs = 50,
): Promise<ContractSnapshot | null> {
  const current = this._snapshots.get(laneId);
  if (current && current.version >= minVersion) {
    return Promise.resolve(current);
  }

  return new Promise((resolve) => {
    let elapsed = 0;

    const timer = setInterval(() => {
      elapsed += pollIntervalMs;

      const snapshot = this._snapshots.get(laneId);
      if (snapshot && snapshot.version >= minVersion) {
        clearInterval(timer);
        resolve(snapshot);
        return;
      }

      if (elapsed >= timeoutMs) {
        clearInterval(timer);
        resolve(this._snapshots.get(laneId) ?? null);
      }
    }, pollIntervalMs);
  });
}

export async function waitForAll(
  this: IContractRegistry,
  laneIds: string[],
  timeoutMs: number,
): Promise<Map<string, ContractSnapshot | null>> {
  const results = await Promise.all(
    laneIds.map(async (id) => {
      const snapshot = await this.waitForVersion(id, 1, timeoutMs);
      return [id, snapshot] as [string, ContractSnapshot | null];
    }),
  );
  return new Map(results);
}
