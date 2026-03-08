import type { IContractRegistry } from './contract-registry/index.js';
import type { BarrierResolution, CheckpointPayload } from './dag-types.js';
import {
    _resolveHardBarrier,
    _resolveReadContract,
    _resolveSelf,
    _resolveSoftAlign,
    resolve,
    resolveGlobalBarrier,
} from './prototype/index.js';

export interface IBarrierCoordinator {
  new(registry: IContractRegistry): IBarrierCoordinator;
  // Private state
  _registry: IContractRegistry;
  // Public API
  resolve(checkpoint: CheckpointPayload): Promise<BarrierResolution>;
  resolveGlobalBarrier(participants: string[], timeoutMs: number): Promise<BarrierResolution>;
  // Private helpers
  _resolveSelf(): BarrierResolution;
  _resolveReadContract(laneIds: string[]): BarrierResolution;
  _resolveSoftAlign(laneIds: string[], timeoutMs: number): Promise<BarrierResolution>;
  _resolveHardBarrier(laneIds: string[], timeoutMs: number): Promise<BarrierResolution>;
}

export const BarrierCoordinator = function(
  this: IBarrierCoordinator,
  registry: IContractRegistry,
) {
  this._registry = registry;
} as unknown as IBarrierCoordinator;

/** Default timeout when a checkpoint does not specify one (ms) */
(BarrierCoordinator as Record<string, unknown>).DEFAULT_TIMEOUT_MS = 5_000;

Object.assign(BarrierCoordinator.prototype, {
  resolve,
  resolveGlobalBarrier,
  _resolveSelf,
  _resolveReadContract,
  _resolveSoftAlign,
  _resolveHardBarrier,
});
