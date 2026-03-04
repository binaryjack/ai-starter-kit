/**
 * DagPlanner — stateless DAG validation and scheduling utilities.
 *
 * Extracted from DagOrchestrator.execute() to separate concerns:
 *   - validateDag()          → structural + cycle detection
 *   - topologicalSort()      → execution groups (parallel within each group)
 *   - buildCapabilityRegistry() → capability-name → laneId[] map
 *
 * DagOrchestrator delegates to these helpers so its execute() method
 * can focus exclusively on coordination and lane dispatch.
 */

import type { DagDefinition, LaneDefinition } from './dag-types.js';

export class DagPlanner {
  // ─── Validation ───────────────────────────────────────────────────────────

  /**
   * Validate a parsed DagDefinition.
   * Throws a descriptive Error on the first structural violation or cycle.
   */
  static validateDag(dag: DagDefinition): void {
    if (!dag.name) throw new Error('dag.json: missing "name"');
    if (!Array.isArray(dag.lanes) || dag.lanes.length === 0) {
      throw new Error('dag.json: "lanes" must be a non-empty array');
    }

    const laneIds = new Set(dag.lanes.map((l) => l.id));

    // Validate all dependsOn references exist
    for (const lane of dag.lanes) {
      for (const dep of lane.dependsOn ?? []) {
        if (!laneIds.has(dep)) {
          throw new Error(
            `dag.json: lane "${lane.id}" depends on unknown lane "${dep}"`,
          );
        }
      }
    }

    // Cycle detection via Kahn's algorithm
    const inDegree = new Map<string, number>();
    const adj      = new Map<string, string[]>(); // id → dependents

    for (const lane of dag.lanes) {
      inDegree.set(lane.id, 0);
      adj.set(lane.id, []);
    }
    for (const lane of dag.lanes) {
      for (const dep of lane.dependsOn ?? []) {
        adj.get(dep)!.push(lane.id);
        inDegree.set(lane.id, (inDegree.get(lane.id) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    let visited = 0;
    while (queue.length > 0) {
      const id = queue.shift()!;
      visited++;
      for (const dependent of adj.get(id) ?? []) {
        const newDeg = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) queue.push(dependent);
      }
    }

    if (visited !== dag.lanes.length) {
      throw new Error('dag.json: cycle detected in lane dependencies');
    }
  }

  // ─── Topological sort → execution groups ─────────────────────────────────

  /**
   * Group lanes so that all dependencies in a group are satisfied by prior groups.
   * Lanes within the same group can run in parallel.
   *
   * @returns Ordered array of execution groups.
   */
  static topologicalSort(lanes: LaneDefinition[]): LaneDefinition[][] {
    const remaining = new Set(lanes.map((l) => l.id));
    const completed = new Set<string>();
    const groups:    LaneDefinition[][] = [];
    const byId       = new Map(lanes.map((l) => [l.id, l]));

    while (remaining.size > 0) {
      // Find all lanes whose dependencies are all completed
      const group: LaneDefinition[] = [];
      for (const id of remaining) {
        const lane = byId.get(id)!;
        const depsComplete = (lane.dependsOn ?? []).every((dep) => completed.has(dep));
        if (depsComplete) group.push(lane);
      }

      if (group.length === 0) {
        // Should not happen after validateDag() passes, but guard anyway
        throw new Error('Unexpected cycle or dependency resolution failure during sort');
      }

      for (const lane of group) {
        remaining.delete(lane.id);
        completed.add(lane.id);
      }

      groups.push(group);
    }

    return groups;
  }

  // ─── Capability registry ──────────────────────────────────────────────────

  /**
   * Build the capability → laneIds[] registry from a DagDefinition.
   *
   * Merges the explicit `dag.capabilityRegistry` map with auto-registered
   * capabilities declared in `lane.capabilities[]`.
   */
  static buildCapabilityRegistry(dag: DagDefinition): Record<string, string[]> {
    // Start with the explicit registry from dag.json
    const result: Record<string, string[]> = { ...(dag.capabilityRegistry ?? {}) };

    // Also auto-register from lane.capabilities[] → lane.id
    for (const lane of dag.lanes) {
      for (const cap of lane.capabilities ?? []) {
        if (!result[cap]) result[cap] = [];
        if (!result[cap].includes(lane.id)) result[cap].push(lane.id);
      }
    }

    return result;
  }
}
