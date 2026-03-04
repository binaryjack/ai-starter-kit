import * as fs from 'fs/promises'
import * as path from 'path'
import * as readline from 'readline'
import { AgentResult } from './agent-types.js'
import { BarrierCoordinator } from './barrier-coordinator.js'
import { ContractRegistry } from './contract-registry.js'
import { CostTracker } from './cost-tracker.js'
import {
  BarrierResolution,
  CheckpointPayload,
  CheckpointRecord,
  ContractExports,
  ContractSnapshot,
  LaneDefinition,
  LaneResult,
  SupervisorVerdict,
} from './dag-types.js'
import { IntraSupervisor } from './intra-supervisor.js'
import { ModelRouter, RoutedResponse } from './model-router.js'
import { EscalationError, SupervisedAgent } from './supervised-agent.js'
// ─── Interactive approval prompt ───────────────────────────────────────────────────

async function promptHumanApproval(
  payload: CheckpointPayload,
  verdict: SupervisorVerdict,
): Promise<SupervisorVerdict> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const findings = payload.partialResult.findings ?? [];
  process.stdout.write('\n');
  process.stdout.write('  🔔  HUMAN REVIEW CHECKPOINT\n');
  process.stdout.write(`  Checkpoint : ${payload.checkpointId}\n`);
  process.stdout.write(`  Supervisor : ${verdict.type}`);
  if (verdict.type === 'RETRY') process.stdout.write(` (“${verdict.instructions ?? ''}”)`);
  process.stdout.write('\n');
  if (findings.length > 0) {
    process.stdout.write('  Findings   :\n');
    findings.slice(-5).forEach((f) => process.stdout.write(`    ${f}\n`));
  }
  process.stdout.write('\n  [a] Approve  [r] Retry  [e] Escalate  (Enter = accept verdict)\n> ');

  return new Promise((resolve) => {
    rl.once('line', (input) => {
      rl.close();
      const ch = input.trim().toLowerCase();
      if (ch === 'a') return resolve({ type: 'APPROVE' });
      if (ch === 'r') return resolve({ type: 'RETRY', instructions: 'Human-requested retry' });
      if (ch === 'e')
        return resolve({ type: 'ESCALATE', reason: 'Human escalated at review checkpoint' });
      resolve(verdict); // accept supervisor verdict
    });
  });
}
// ─── LaneExecutor ─────────────────────────────────────────────────────────────

/**
 * Runs a single lane end-to-end:
 *   1. Loads the agent JSON + optional supervisor JSON
 *   2. Drives the SupervisedAgent generator
 *   3. At each checkpoint: resolves barriers → calls IntraSupervisor → routes verdict
 *   4. On RETRY: increments counter, re-drives generator with instructions
 *   5. On HANDOFF: recursively runs a specialist lane and merges its result
 *   6. On ESCALATE: records failure and terminates
 *   7. Saves checkpoint records to .agents/checkpoints/<laneId>/
 *   8. Returns a complete LaneResult
 */
export class LaneExecutor {
  private readonly registry: ContractRegistry;
  private readonly coordinator: BarrierCoordinator;
  private readonly projectRoot: string;
  private readonly checkpointBaseDir: string;

  /** Optional: capability registry from the DagDefinition (laneId → capability names) */
  private readonly capabilityRegistry: Record<string, string[]>;

  private readonly modelRouter: ModelRouter | undefined;
  private readonly costTracker: CostTracker | undefined;
  private readonly interactive: boolean;
  /**
   * Base directory for resolving agent/supervisor JSON files.
   * Defaults to projectRoot when not supplied (backward-compatible).
   * Set to the DAG file's directory when running agents against a
   * different project root (--project flag).
   */
  private readonly agentsBaseDir: string;

  constructor(options: {
    registry: ContractRegistry;
    coordinator: BarrierCoordinator;
    projectRoot: string;
    /** Directory that contains agent/supervisor JSON files (default: projectRoot) */
    agentsBaseDir?: string;
    capabilityRegistry?: Record<string, string[]>;
    checkpointBaseDir?: string;
    modelRouter?: ModelRouter;
    costTracker?: CostTracker;
    interactive?: boolean;
  }) {
    this.registry = options.registry;
    this.coordinator = options.coordinator;
    this.projectRoot = options.projectRoot;
    this.agentsBaseDir = options.agentsBaseDir ?? options.projectRoot;
    this.capabilityRegistry = options.capabilityRegistry ?? {};
    this.checkpointBaseDir =
      options.checkpointBaseDir ?? path.join(options.projectRoot, '.agents', 'checkpoints');
    this.modelRouter = options.modelRouter;
    this.costTracker = options.costTracker;
    this.interactive = options.interactive ?? false;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  async runLane(lane: LaneDefinition): Promise<LaneResult> {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    const checkpoints: CheckpointRecord[] = [];
    let totalRetries = 0;
    let handoffsReceived = 0;

    let agentResult: AgentResult | null = null;
    let laneStatus: LaneResult['status'] = 'success';
    let errorMsg: string | undefined;

    try {
      const result = await this.driveLane(lane, checkpoints, {
        retries: { count: 0 },
        handoffsRef: { count: 0 },
      });
      agentResult = result;
      totalRetries = checkpoints.reduce((sum, cp) => sum + cp.retryCount, 0);
      handoffsReceived = checkpoints.filter((cp) => cp.verdict.type === 'HANDOFF').length;
    } catch (err) {
      if (err instanceof EscalationError) {
        laneStatus = 'escalated';
        errorMsg = err.message;
      } else {
        laneStatus = 'failed';
        errorMsg = String(err);
      }
      totalRetries = checkpoints.reduce((sum, cp) => sum + cp.retryCount, 0);
      handoffsReceived = checkpoints.filter((cp) => cp.verdict.type === 'HANDOFF').length;
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    const laneResult: LaneResult = {
      laneId: lane.id,
      status: agentResult ? 'success' : laneStatus,
      agentResult: agentResult ?? undefined,
      checkpoints,
      totalRetries,
      handoffsReceived,
      startedAt,
      completedAt,
      durationMs,
      error: errorMsg,
    };

    // Persist checkpoint records
    await this.saveCheckpoints(lane.id, checkpoints);

    return laneResult;
  }

  // ─── Private: Core Drive Loop ───────────────────────────────────────────────

  private async driveLane(
    lane: LaneDefinition,
    checkpoints: CheckpointRecord[],
    counters: { retries: { count: number }; handoffsRef: { count: number } },
  ): Promise<AgentResult | null> {
    const agentFilePath = path.resolve(this.agentsBaseDir, lane.agentFile);

    // Load agent
    const agent = await SupervisedAgent.fromFile(agentFilePath);

    // Load supervisor (no-op if no supervisorFile)
    let supervisor: IntraSupervisor;
    if (lane.supervisorFile) {
      const supPath = path.resolve(this.agentsBaseDir, lane.supervisorFile);
      supervisor = await IntraSupervisor.fromFile(supPath);
    } else {
      supervisor = IntraSupervisor.noOp(lane.id);
    }

    // Build a lazy contract publisher so the agent can publish contracts at each step
    const publishContract = (): ContractSnapshot => {
      return this.registry.getSnapshot(lane.id) ?? {
        laneId: lane.id,
        version: 0,
        timestamp: new Date().toISOString(),
        exports: {} as ContractExports,
        pending: [],
      };
    };

    // Cost tracking: collect LLM responses fired inside the generator,
    // then attribute them to each checkpoint when the payload yields.
    const pendingCosts: RoutedResponse[] = [];
    const onLlmResponse = this.costTracker
      ? (resp: RoutedResponse) => { pendingCosts.push(resp); }
      : undefined;

    // Start the generator
    const generator = agent.run(this.projectRoot, 'self', publishContract, this.modelRouter, onLlmResponse);

    // Drive the generator
    let currentVerdict: SupervisorVerdict = { type: 'APPROVE' };
    let iteration = await generator.next(currentVerdict);

    while (!iteration.done) {
      const payload: CheckpointPayload = iteration.value;
      const checkpointStartMs = Date.now();

      // Attribute any LLM costs fired while computing this checkpoint
      for (const resp of pendingCosts.splice(0)) {
        this.costTracker?.record(lane.id, payload.checkpointId, resp);
      }

      // Publish any contracts the agent declared at this checkpoint
      if (payload.contracts) {
        this.registry.publish(lane.id, payload.contracts);
      }

      // Merge supervisor rule's mode/waitFor/timeoutMs into the payload so the
      // BarrierCoordinator uses the declarative config rather than the agent's
      // defaultMode ('self'). The agent generator doesn't know about supervisor rules.
      const supervisorRule = supervisor.getRuleFor(payload.checkpointId);
      const effectivePayload: CheckpointPayload = supervisorRule
        ? {
            ...payload,
            mode: supervisorRule.mode,
            waitFor: supervisorRule.waitFor ?? payload.waitFor,
            timeoutMs: supervisorRule.timeoutMs ?? payload.timeoutMs,
          }
        : payload;

      // needs-human-review: BarrierCoordinator uses 'self' for resolution;
      // the human interaction happens after the supervisor verdict below.
      const barrierPayload: CheckpointPayload =
        effectivePayload.mode === 'needs-human-review'
          ? { ...effectivePayload, mode: 'self' }
          : effectivePayload;

      // Resolve barriers / read contracts from other lanes
      const barrierResolution: BarrierResolution = await this.coordinator.resolve(barrierPayload);

      // Get verdict from supervisor
      let verdict: SupervisorVerdict = supervisor.evaluate(
        payload.checkpointId,
        payload.partialResult,
        barrierResolution,
      );

      // Interactive human review: pause and let the human override the supervisor verdict
      if (this.interactive && effectivePayload.mode === 'needs-human-review') {
        verdict = await promptHumanApproval(effectivePayload, verdict);
      }

      // Track retry count for this checkpoint
      let retryCount = 0;

      if (verdict.type === 'RETRY') {
        // Check budget before committing to retry
        if (supervisor.isExhausted(payload.checkpointId)) {
          verdict = {
            type: 'ESCALATE',
            reason: `Retry budget exhausted for checkpoint "${payload.checkpointId}"`,
            evidence: { checkpointId: payload.checkpointId, laneId: lane.id },
          };
        } else {
          retryCount = supervisor.incrementRetry(payload.checkpointId);
          counters.retries.count++;
        }
      }

      if (verdict.type === 'HANDOFF') {
        // Resolve target lane from capability registry
        verdict = this.resolveHandoffTarget(verdict, lane.id);

        if (verdict.type === 'HANDOFF' && verdict.targetLaneId) {
          // Recursively run the specialist lane
          const specialistLaneId = verdict.targetLaneId;
          const specialistLane = await this.findHandoffLane(specialistLaneId, lane);

          if (specialistLane) {
            counters.handoffsRef.count++;
            const handoffResult = await this.runLane(specialistLane);

            // Record the handoff checkpoint
            checkpoints.push(
              this.buildRecord(effectivePayload, verdict, retryCount, barrierResolution, checkpointStartMs),
            );

            // Merge specialist result into generator and advance with APPROVE
            // Carry forward the specialist's findings via APPROVE with merged context
            if (handoffResult.agentResult) {
              // Continue the original lane as APPROVE — specialist handled this checkpoint
              currentVerdict = { type: 'APPROVE' };
              iteration = await generator.next(currentVerdict);
              continue;
            }
          }

          // Specialist not found or failed → escalate
          verdict = {
            type: 'ESCALATE',
            reason: `HANDOFF target lane "${specialistLaneId}" not found or failed`,
            evidence: { originalVerdict: verdict, laneId: lane.id },
          };
        }
      }

      // Record the checkpoint
      checkpoints.push(
        this.buildRecord(effectivePayload, verdict, retryCount, barrierResolution, checkpointStartMs),
      );

      if (verdict.type === 'ESCALATE') {
        // Terminate the generator cleanly before throwing
        await generator.return(null);
        throw new EscalationError(verdict.reason ?? 'Escalated', verdict);
      }

      // Feed verdict back to generator
      iteration = await generator.next(verdict);
    }

    // Generator completed — iteration.value is the final AgentResult | null
    return iteration.value as AgentResult | null;
  }

  // ─── Private: Helpers ────────────────────────────────────────────────────────

  /**
   * If verdict.targetLaneId is a capability name rather than a direct lane ID,
   * look it up in the capability registry and resolve to a concrete lane ID.
   */
  private resolveHandoffTarget(verdict: SupervisorVerdict, sourceLaneId: string): SupervisorVerdict {
    if (verdict.type !== 'HANDOFF') return verdict;
    if (!verdict.targetLaneId) return verdict;

    const targetId = verdict.targetLaneId;

    // Already a concrete lane ID (not a capability name)
    if (!this.capabilityRegistry[targetId]) {
      return verdict;
    }

    // It's a capability name → pick the first lane that has it (excluding self)
    const candidates = this.capabilityRegistry[targetId].filter((id) => id !== sourceLaneId);
    if (candidates.length === 0) {
      return {
        type: 'ESCALATE',
        reason: `No lane with capability "${targetId}" found (excluding self "${sourceLaneId}")`,
        evidence: { capabilityRegistry: this.capabilityRegistry },
      };
    }

    return { ...verdict, targetLaneId: candidates[0] };
  }

  /**
   * Find a LaneDefinition for a handoff target by looking up the agent file path.
   * Creates a minimal ephemeral LaneDefinition if only the laneId is known.
   */
  private async findHandoffLane(
    targetLaneId: string,
    _sourceLane: LaneDefinition,
  ): Promise<LaneDefinition | null> {
    // The DagOrchestrator will pass the full lane map; for now we build a minimal one
    // by convention: agents/<laneId>.agent.json + agents/<laneId>.supervisor.json
    const agentFile = `${targetLaneId}.agent.json`;
    const supervisorFile = `${targetLaneId}.supervisor.json`;

    const agentFilePath = path.resolve(this.agentsBaseDir, agentFile);
    try {
      await fs.access(agentFilePath);
    } catch {
      return null; // Agent file doesn't exist
    }

    const supPath = path.resolve(this.agentsBaseDir, supervisorFile);
    let hasSupervisor = false;
    try {
      await fs.access(supPath);
      hasSupervisor = true;
    } catch {
      // No supervisor file — OK
    }

    return {
      id: targetLaneId,
      agentFile,
      supervisorFile: hasSupervisor ? supervisorFile : undefined,
    };
  }

  private buildRecord(
    payload: CheckpointPayload,
    verdict: SupervisorVerdict,
    retryCount: number,
    barrier: BarrierResolution,
    startMs: number,
  ): CheckpointRecord {
    return {
      checkpointId: payload.checkpointId,
      stepIndex: payload.stepIndex,
      mode: payload.mode,
      payload,
      verdict,
      retryCount,
      timestamp: new Date().toISOString(),
      contractsReceived: barrier.snapshots,
      durationMs: Date.now() - startMs,
    };
  }

  private async saveCheckpoints(laneId: string, records: CheckpointRecord[]): Promise<void> {
    if (records.length === 0) return;

    const laneDir = path.join(this.checkpointBaseDir, laneId);
    try {
      await fs.mkdir(laneDir, { recursive: true });
      for (const record of records) {
        const filePath = path.join(laneDir, `${record.checkpointId}.json`);
        // ContractSnapshot Maps aren't JSON-serializable directly; convert
        const serializable = {
          ...record,
          contractsReceived: record.contractsReceived
            ? Object.fromEntries(record.contractsReceived)
            : undefined,
        };
        await fs.writeFile(filePath, JSON.stringify(serializable, null, 2), 'utf-8');
      }
    } catch {
      // Best-effort — don't fail the run because of checkpoint persistence issues
    }
  }
}

// ─── Standalone helper for DagOrchestrator ────────────────────────────────────

/**
 * Convenience factory that creates a LaneExecutor and immediately runs one lane.
 * Used by the DagOrchestrator so it doesn't need to construct executor instances.
 */
export async function runLane(
  lane: LaneDefinition,
  projectRoot: string,
  registry: ContractRegistry,
  coordinator: BarrierCoordinator,
  capabilityRegistry?: Record<string, string[]>,
  modelRouter?: ModelRouter,
  costTracker?: CostTracker,
  interactive?: boolean,
  agentsBaseDir?: string,
): Promise<LaneResult> {
  const executor = new LaneExecutor({
    registry,
    coordinator,
    projectRoot,
    agentsBaseDir,
    capabilityRegistry,
    modelRouter,
    costTracker,
    interactive,
  });
  return executor.runLane(lane);
}
