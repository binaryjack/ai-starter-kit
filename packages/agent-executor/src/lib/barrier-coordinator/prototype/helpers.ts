import type { IBarrierCoordinator } from '../barrier-coordinator.js';
import type { BarrierResolution, ContractSnapshot } from '../dag-types.js';

export function _resolveSelf(this: IBarrierCoordinator): BarrierResolution {
  return {
    resolved: true,
    snapshots: new Map(),
    timedOut: [],
  };
}

export function _resolveReadContract(
  this: IBarrierCoordinator,
  laneIds: string[],
): BarrierResolution {
  const snapshots = new Map<string, ContractSnapshot | null>();
  for (const id of laneIds) {
    snapshots.set(id, this._registry.getSnapshot(id) ?? null);
  }
  return {
    resolved: laneIds.every((id) => snapshots.get(id) !== null),
    snapshots,
    timedOut: [],
  };
}

export async function _resolveSoftAlign(
  this: IBarrierCoordinator,
  laneIds: string[],
  timeoutMs: number,
): Promise<BarrierResolution> {
  const entries = await Promise.all(
    laneIds.map(async (id): Promise<[string, ContractSnapshot | null]> => {
      const snapshot = await this._registry.waitForVersion(id, 1, timeoutMs);
      return [id, snapshot];
    }),
  );

  const snapshots = new Map(entries);
  const timedOut  = entries.filter(([, snap]) => snap === null).map(([id]) => id);

  return { resolved: timedOut.length === 0, snapshots, timedOut };
}

export async function _resolveHardBarrier(
  this: IBarrierCoordinator,
  laneIds: string[],
  timeoutMs: number,
): Promise<BarrierResolution> {
  const resolution = await this._resolveSoftAlign(laneIds, timeoutMs);
  return { ...resolution, resolved: resolution.timedOut.length === 0 };
}
