import type { IBarrierCoordinator } from '../barrier-coordinator.js';
import type {
  CheckpointPayload,
  CheckpointMode,
  BarrierResolution,
} from '../dag-types.js';

const DEFAULT_TIMEOUT_MS = 5_000;

export async function resolve(
  this: IBarrierCoordinator,
  checkpoint: CheckpointPayload,
): Promise<BarrierResolution> {
  switch (checkpoint.mode as CheckpointMode) {
    case 'self':
      return this._resolveSelf();

    case 'read-contract':
      return this._resolveReadContract(checkpoint.waitFor ?? []);

    case 'soft-align':
      return this._resolveSoftAlign(
        checkpoint.waitFor ?? [],
        checkpoint.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );

    case 'hard-barrier':
      return this._resolveHardBarrier(
        checkpoint.waitFor ?? [],
        checkpoint.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );

    default:
      return this._resolveSelf();
  }
}

export async function resolveGlobalBarrier(
  this: IBarrierCoordinator,
  participants: string[],
  timeoutMs: number,
): Promise<BarrierResolution> {
  return this._resolveHardBarrier(participants, timeoutMs);
}
