import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  DagDefinition,
  DagResult,
  LaneDefinition,
  LaneResult,
} from './dag-types.js';
import { ContractRegistry } from './contract-registry.js';
import { BarrierCoordinator } from './barrier-coordinator.js';
import { runLane } from './lane-executor.js';

// ─── DagOrchestrator ──────────────────────────────────────────────────────────

/**
 * Top-level DAG execution engine.
 *
 * Responsibilities:
 *   1. Load + validate a dag.json (cycle detection via Kahn's algorithm)
 *   2. Topological sort → execution groups (lanes with no remaining deps per round)
 *   3. Promise.allSettled per group → fully parallel within a group
 *   4. Shared ContractRegistry + BarrierCoordinator across all lanes
 *   5. Merge LaneResults → DagResult and persist to .agents/results/
 *
 * Usage:
 *   const result = await DagOrchestrator.run('agents/dag.json', projectRoot);
 */
export class DagOrchestrator {
  private readonly projectRoot: string;
  private readonly resultsDir: string;
  private verbose: boolean;

  constructor(projectRoot: string, options?: { verbose?: boolean; resultsDir?: string }) {
    this.projectRoot = projectRoot;
    this.verbose = options?.verbose ?? false;
    this.resultsDir =
      options?.resultsDir ?? path.join(projectRoot, '.agents', 'results');
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Load a dag.json file, validate it, then execute all lanes */
  async run(dagFile: string): Promise<DagResult> {
    const dagPath = path.resolve(this.projectRoot, dagFile);
    const dag = await this.loadDag(dagPath);
    return this.execute(dag);
  }

  /** Execute a pre-loaded DagDefinition */
  async execute(dag: DagDefinition): Promise<DagResult> {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    this.log(`\n🚀  Starting DAG run: ${dag.name}  [${runId}]`);
    this.log(`   ${dag.description}\n`);

    // Shared infrastructure for all lanes
    const registry = new ContractRegistry();
    const coordinator = new BarrierCoordinator(registry);

    // Build capability registry: capability → laneIds[]
    const capabilityRegistry = this.buildCapabilityRegistry(dag);

    // Topological execution order
    const groups = this.topologicalSort(dag.lanes);
    this.log(`   Execution plan: ${groups.map((g, i) => `Group ${i + 1}: [${g.map((l) => l.id).join(', ')}]`).join(' → ')}\n`);

    const allLaneResults: LaneResult[] = [];

    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      this.log(`▶  Group ${gi + 1}/${groups.length}: ${group.map((l) => l.id).join(' + ')}`);

      const groupStartMs = Date.now();
      const settled = await Promise.allSettled(
        group.map((lane) =>
          runLane(lane, this.projectRoot, registry, coordinator, capabilityRegistry),
        ),
      );

      for (let li = 0; li < settled.length; li++) {
        const outcome = settled[li];
        const lane = group[li];

        if (outcome.status === 'fulfilled') {
          allLaneResults.push(outcome.value);
          const s = outcome.value.status;
          const icon = s === 'success' ? '✅' : s === 'escalated' ? '🚨' : '❌';
          this.log(
            `   ${icon} [${lane.id}] ${s} — ${outcome.value.checkpoints.length} checkpoints, ` +
            `${outcome.value.totalRetries} retries, ${outcome.value.durationMs}ms`,
          );
        } else {
          // Promise itself rejected (unexpected error, not EscalationError)
          allLaneResults.push({
            laneId: lane.id,
            status: 'failed',
            checkpoints: [],
            totalRetries: 0,
            handoffsReceived: 0,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - groupStartMs,
            error: String(outcome.reason),
          });
          this.log(`   ❌ [${lane.id}] failed — ${outcome.reason}`);
        }
      }

      // Handle global barriers that follow this group
      if (dag.globalBarriers) {
        for (const barrier of dag.globalBarriers) {
          const groupLaneIds = new Set(group.map((l) => l.id));
          const barrierParticipantsInGroup = barrier.participants.filter((p) =>
            groupLaneIds.has(p),
          );
          if (barrierParticipantsInGroup.length === barrier.participants.length) {
            this.log(`⏳  Global barrier "${barrier.name}" — waiting for all participants…`);
            const resolution = await coordinator.resolveGlobalBarrier(
              barrier.participants,
              barrier.timeoutMs,
            );
            if (!resolution.resolved) {
              this.log(
                `⚠️   Barrier "${barrier.name}" timed out for: ${resolution.timedOut.join(', ')}`,
              );
            } else {
              this.log(`✅  Barrier "${barrier.name}" resolved`);
            }
          }
        }
      }
    }

    const completedAt = new Date().toISOString();
    const totalDurationMs = Date.now() - startMs;

    const dagResult = this.buildDagResult(dag.name, runId, allLaneResults, startedAt, completedAt, totalDurationMs);

    this.log(`\n${dagResult.status === 'success' ? '✅' : dagResult.status === 'partial' ? '⚠️ ' : '❌'}  DAG complete: ${dagResult.status.toUpperCase()} in ${totalDurationMs}ms`);
    this.log(`   ${dagResult.findings.length} findings, ${dagResult.recommendations.length} recommendations\n`);

    await this.saveResult(runId, dagResult);

    return dagResult;
  }

  // ─── Load & Validate ────────────────────────────────────────────────────────

  async loadDag(dagFilePath: string): Promise<DagDefinition> {
    const raw = await fs.readFile(dagFilePath, 'utf-8');
    const dag: DagDefinition = JSON.parse(raw);

    this.validateDag(dag);
    return dag;
  }

  private validateDag(dag: DagDefinition): void {
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

    // Cycle detection (Kahn's algorithm)
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>(); // id → dependents

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

  // ─── Topological Sort → Execution Groups ────────────────────────────────────

  /**
   * Group lanes so that all dependencies in a group are satisfied by prior groups.
   * Lanes within the same group can run in parallel.
   */
  private topologicalSort(lanes: LaneDefinition[]): LaneDefinition[][] {
    const remaining = new Set(lanes.map((l) => l.id));
    const completed = new Set<string>();
    const groups: LaneDefinition[][] = [];

    const byId = new Map(lanes.map((l) => [l.id, l]));

    while (remaining.size > 0) {
      // Find all lanes whose dependencies are all completed
      const group: LaneDefinition[] = [];
      for (const id of remaining) {
        const lane = byId.get(id)!;
        const depsComplete = (lane.dependsOn ?? []).every((dep) => completed.has(dep));
        if (depsComplete) {
          group.push(lane);
        }
      }

      if (group.length === 0) {
        // Should not happen after validateDag passes, but guard anyway
        throw new Error('Unexpected cycle or dependency resolution failure');
      }

      for (const lane of group) {
        remaining.delete(lane.id);
        completed.add(lane.id);
      }

      groups.push(group);
    }

    return groups;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private buildCapabilityRegistry(dag: DagDefinition): Record<string, string[]> {
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

  private buildDagResult(
    dagName: string,
    runId: string,
    laneResults: LaneResult[],
    startedAt: string,
    completedAt: string,
    totalDurationMs: number,
  ): DagResult {
    const successCount = laneResults.filter((r) => r.status === 'success').length;
    const failCount = laneResults.filter(
      (r) => r.status === 'failed' || r.status === 'escalated',
    ).length;

    const status: DagResult['status'] =
      failCount === 0
        ? 'success'
        : successCount > 0
          ? 'partial'
          : 'failed';

    // Roll up findings and recommendations from all successful lanes
    const findings: string[] = [];
    const recommendations: string[] = [];
    for (const lane of laneResults) {
      if (lane.agentResult) {
        findings.push(...lane.agentResult.findings.map((f) => `[${lane.laneId}] ${f}`));
        recommendations.push(
          ...lane.agentResult.recommendations.map((r) => `[${lane.laneId}] ${r}`),
        );
      }
    }

    return {
      dagName,
      runId,
      status,
      lanes: laneResults,
      totalDurationMs,
      startedAt,
      completedAt,
      findings,
      recommendations,
    };
  }

  private async saveResult(runId: string, result: DagResult): Promise<void> {
    try {
      await fs.mkdir(this.resultsDir, { recursive: true });
      const filePath = path.join(this.resultsDir, `dag-${runId}.json`);

      // Make Maps JSON-serializable
      const serializable = JSON.parse(
        JSON.stringify(result, (_key, value) =>
          value instanceof Map ? Object.fromEntries(value) : value,
        ),
      );

      await fs.writeFile(filePath, JSON.stringify(serializable, null, 2), 'utf-8');
      this.log(`💾  Result saved → ${path.relative(this.projectRoot, filePath)}`);
    } catch {
      // Best-effort — don't fail the run because of persistence
    }
  }

  private log(msg: string): void {
    if (this.verbose) {
      process.stdout.write(msg + '\n');
    }
  }
}
