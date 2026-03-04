import {
  CheckpointPayload,
  CheckpointMode,
  BarrierResolution,
  ContractSnapshot,
} from './dag-types.js';
import { ContractRegistry } from './contract-registry.js';

// ─── BarrierCoordinator ───────────────────────────────────────────────────────

/**
 * Resolves cross-lane checkpoint modes by consulting the ContractRegistry.
 *
 * Mode behaviour:
 *   self          → no cross-lane work needed; resolves immediately with empty snapshots
 *   read-contract → reads the current best-available snapshot for each waitFor lane (non-blocking)
 *   soft-align    → waits up to timeoutMs for each waitFor lane to publish, returns best-available on timeout
 *   hard-barrier  → waits for ALL participant lanes to publish; marks stragglers as timed-out
 *
 * The coordinator never blocks indefinitely — every async path has a timeout ceiling.
 */
export class BarrierCoordinator {
  private readonly registry: ContractRegistry;

  /** Default timeout when a checkpoint does not specify one (ms) */
  static readonly DEFAULT_TIMEOUT_MS = 5_000;

  constructor(registry: ContractRegistry) {
    this.registry = registry;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  async resolve(checkpoint: CheckpointPayload): Promise<BarrierResolution> {
    switch (checkpoint.mode as CheckpointMode) {
      case 'self':
        return this.resolveSelf();

      case 'read-contract':
        return this.resolveReadContract(checkpoint.waitFor ?? []);

      case 'soft-align':
        return this.resolveSoftAlign(
          checkpoint.waitFor ?? [],
          checkpoint.timeoutMs ?? BarrierCoordinator.DEFAULT_TIMEOUT_MS,
        );

      case 'hard-barrier':
        return this.resolveHardBarrier(
          checkpoint.waitFor ?? [],
          checkpoint.timeoutMs ?? BarrierCoordinator.DEFAULT_TIMEOUT_MS,
        );

      default:
        // Unknown mode — treat as self, never block
        return this.resolveSelf();
    }
  }

  // ─── Mode Implementations ─────────────────────────────────────────────────

  /**
   * self — supervisor handles the validation entirely; no cross-lane data needed.
   * Resolves immediately with an empty snapshot map.
   */
  private resolveSelf(): BarrierResolution {
    return {
      resolved: true,
      snapshots: new Map(),
      timedOut: [],
    };
  }

  /**
   * read-contract — take the best-available snapshot right now for each lane.
   * Never waits. Returns null for lanes that haven't published yet.
   */
  private resolveReadContract(laneIds: string[]): BarrierResolution {
    const snapshots = new Map<string, ContractSnapshot | null>();
    for (const id of laneIds) {
      snapshots.set(id, this.registry.getSnapshot(id) ?? null);
    }
    return {
      resolved: laneIds.every((id) => snapshots.get(id) !== null),
      snapshots,
      timedOut: [],
    };
  }

  /**
   * soft-align — wait up to timeoutMs for each lane to publish at least one snapshot.
   * Returns the best-available snapshot for each lane (even null on timeout).
   * Lanes that timed out are listed in `timedOut` but do NOT fail the barrier.
   */
  private async resolveSoftAlign(
    laneIds: string[],
    timeoutMs: number,
  ): Promise<BarrierResolution> {
    const entries = await Promise.all(
      laneIds.map(async (id): Promise<[string, ContractSnapshot | null]> => {
        const snapshot = await this.registry.waitForVersion(id, 1, timeoutMs);
        return [id, snapshot];
      }),
    );

    const snapshots = new Map(entries);
    const timedOut = entries
      .filter(([, snap]) => snap === null)
      .map(([id]) => id);

    return {
      resolved: timedOut.length === 0,
      snapshots,
      timedOut,
    };
  }

  /**
   * hard-barrier — wait for ALL listed lanes to publish.
   * Unlike soft-align, a timed-out lane here means the barrier only partially resolved.
   * The requester can inspect `timedOut` and decide whether to proceed or escalate.
   */
  private async resolveHardBarrier(
    laneIds: string[],
    timeoutMs: number,
  ): Promise<BarrierResolution> {
    // Same implementation as soft-align under the hood —
    // the semantic difference is that the caller (LaneExecutor / IntraSupervisor)
    // treats a partial hard-barrier as a failure condition, not a graceful degradation.
    const resolution = await this.resolveSoftAlign(laneIds, timeoutMs);
    return {
      ...resolution,
      // hard-barrier is only fully resolved when EVERY participant published
      resolved: resolution.timedOut.length === 0,
    };
  }

  // ─── Named Global Barriers ────────────────────────────────────────────────

  /**
   * Resolve a named global barrier declared in dag.json.
   * All participant lanes must publish before any can continue.
   *
   * Called by DagOrchestrator when it detects that a lane is requesting
   * a barrier whose name matches a GlobalBarrier declaration.
   */
  async resolveGlobalBarrier(
    participants: string[],
    timeoutMs: number,
  ): Promise<BarrierResolution> {
    return this.resolveHardBarrier(participants, timeoutMs);
  }
}
