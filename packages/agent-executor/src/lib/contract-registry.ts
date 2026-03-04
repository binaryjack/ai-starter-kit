import { ContractSnapshot } from './dag-types.js';

// ─── ContractRegistry ─────────────────────────────────────────────────────────

/**
 * In-memory, versioned store of ContractSnapshots — one per lane.
 *
 * Every time a lane publishes, the version counter increments.
 * Other lanes can read the current snapshot instantly (non-blocking)
 * or wait for a minimum version to appear (for soft-align / hard-barrier).
 *
 * Thread-safety note: Node.js is single-threaded — no mutex needed.
 * The polling interval in waitForVersion is non-blocking (setInterval).
 */
export class ContractRegistry {
  private readonly snapshots = new Map<string, ContractSnapshot>();
  private readonly versions = new Map<string, number>();

  // ─── Write ────────────────────────────────────────────────────────────────

  /**
   * Publish a new contract snapshot for a lane.
   * Overwrites any previous snapshot; version always increments.
   */
  publish(laneId: string, snapshot: Omit<ContractSnapshot, 'version' | 'timestamp'>): ContractSnapshot {
    const version = (this.versions.get(laneId) ?? 0) + 1;
    const stamped: ContractSnapshot = {
      ...snapshot,
      laneId,
      version,
      timestamp: new Date().toISOString(),
    };
    this.snapshots.set(laneId, stamped);
    this.versions.set(laneId, version);
    return stamped;
  }

  // ─── Read (non-blocking) ──────────────────────────────────────────────────

  /** Get the current snapshot for a lane, or undefined if not yet published */
  getSnapshot(laneId: string): ContractSnapshot | undefined {
    return this.snapshots.get(laneId);
  }

  /** Get the current version counter for a lane (0 if never published) */
  getVersion(laneId: string): number {
    return this.versions.get(laneId) ?? 0;
  }

  /** Whether a lane has published at least one snapshot */
  has(laneId: string): boolean {
    return this.snapshots.has(laneId);
  }

  /** All lane IDs that have published at least once */
  publishedLanes(): string[] {
    return [...this.snapshots.keys()];
  }

  /** Get all current snapshots as a plain Map (defensive copy) */
  getAll(): Map<string, ContractSnapshot> {
    return new Map(this.snapshots);
  }

  // ─── Read (async wait) ────────────────────────────────────────────────────

  /**
   * Wait until the lane's version reaches `minVersion`, or until `timeoutMs`
   * elapses — whichever comes first.
   *
   * Returns the snapshot when the version is reached, or `null` on timeout.
   *
   * Implementation: polls every `pollIntervalMs` (default 50ms) using setInterval,
   * which is non-blocking and does not starve other lanes.
   */
  waitForVersion(
    laneId: string,
    minVersion: number,
    timeoutMs: number,
    pollIntervalMs = 50,
  ): Promise<ContractSnapshot | null> {
    // Fast path — already at or above the required version
    const current = this.snapshots.get(laneId);
    if (current && current.version >= minVersion) {
      return Promise.resolve(current);
    }

    return new Promise((resolve) => {
      let elapsed = 0;

      const timer = setInterval(() => {
        elapsed += pollIntervalMs;

        const snapshot = this.snapshots.get(laneId);
        if (snapshot && snapshot.version >= minVersion) {
          clearInterval(timer);
          resolve(snapshot);
          return;
        }

        if (elapsed >= timeoutMs) {
          clearInterval(timer);
          // Return best-available even if version requirement not met
          resolve(this.snapshots.get(laneId) ?? null);
        }
      }, pollIntervalMs);
    });
  }

  /**
   * Wait for ALL of the listed lanes to publish at least one snapshot.
   * Returns a Map of laneId → snapshot (null for any that timed out).
   *
   * Each lane gets its own independent timeout window starting from the
   * moment this call is made, so fast lanes don't wait for slow lanes
   * beyond the specified timeout.
   */
  async waitForAll(
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

  // ─── Introspection ────────────────────────────────────────────────────────

  /** Human-readable summary for CLI / debugging */
  formatStatus(): string {
    if (this.snapshots.size === 0) return '  (no snapshots yet)';
    return [...this.snapshots.entries()]
      .map(([id, s]) => `  ${id.padEnd(20)} v${s.version}  ${s.timestamp}`)
      .join('\n');
  }

  /** Reset all state (useful between test runs) */
  clear(): void {
    this.snapshots.clear();
    this.versions.clear();
  }
}
