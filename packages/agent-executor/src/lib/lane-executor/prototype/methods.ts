import * as fs from 'fs/promises';
import * as path from 'path';
import type { AgentResult } from '../../agent-types.js';
import type { AuditLog } from '../../audit-log.js';
import type { BarrierCoordinator } from '../../barrier-coordinator.js';
import type { ContractRegistry } from '../../contract-registry.js';
import type { CostTracker } from '../../cost-tracker.js';
import { getGlobalEventBus } from '../../dag-events.js';
import type {
    BarrierResolution,
    CheckpointPayload,
    CheckpointRecord,
    ContractExports,
    ContractSnapshot,
    LaneDefinition,
    LaneResult,
    SupervisorVerdict,
} from '../../dag-types.js';
import { IntraSupervisor } from '../../intra-supervisor.js';
import type { ModelRouter, RoutedResponse } from '../../model-router.js';
import { getGlobalTracer } from '../../otel.js';
import { EscalationError, SupervisedAgent } from '../../supervised-agent.js';
import { ILaneExecutor, LaneExecutor } from '../lane-executor.js';

// ─── runLane ──────────────────────────────────────────────────────────────────

export async function runLane(this: ILaneExecutor, lane: LaneDefinition): Promise<LaneResult> {
  const startedAt = new Date().toISOString();
  const startMs   = Date.now();
  const checkpoints: CheckpointRecord[] = [];

  const laneSpan = getGlobalTracer().startLane('', lane.id);
  void this._auditLog?.laneStart(lane.id, lane.id);
  getGlobalEventBus().emitLaneStart({
    runId:            this._runId,
    laneId:           lane.id,
    providerOverride: lane.providerOverride,
    timestamp:        startedAt,
  });

  let agentResult: AgentResult | null = null;
  let laneStatus: LaneResult['status'] = 'success';
  let errorMsg: string | undefined;

  try {
    agentResult = await this.driveLane(lane, checkpoints, {
      retries:      { count: 0 },
      handoffsRef:  { count: 0 },
    });
  } catch (err) {
    if (err instanceof EscalationError) {
      laneStatus = 'escalated';
      errorMsg   = (err as Error).message;
    } else {
      laneStatus = 'failed';
      errorMsg   = String(err);
    }
    laneSpan.recordException(err instanceof Error ? err : new Error(String(err)));
    laneSpan.setStatus('error', String(err));
  }

  const completedAt  = new Date().toISOString();
  const durationMs   = Date.now() - startMs;
  const totalRetries = checkpoints.reduce((sum, cp) => sum + cp.retryCount, 0);
  const handoffsRecv = checkpoints.filter((cp) => cp.verdict.type === 'HANDOFF').length;
  const finalStatus  = agentResult ? 'success' : laneStatus;

  laneSpan
    .setAttribute('lane.id',          lane.id)
    .setAttribute('lane.status',      finalStatus)
    .setAttribute('lane.retries',     totalRetries)
    .setAttribute('lane.checkpoints', checkpoints.length)
    .setStatus(finalStatus === 'failed' || finalStatus === 'escalated' ? 'error' : 'ok')
    .end();
  void this._auditLog?.laneEnd(lane.id, lane.id, durationMs, finalStatus);
  getGlobalEventBus().emitLaneEnd({
    runId:      this._runId,
    laneId:     lane.id,
    durationMs,
    status:     finalStatus as 'success' | 'failed' | 'escalated',
    retries:    totalRetries,
    timestamp:  new Date().toISOString(),
  });

  const laneResult: LaneResult = {
    laneId:           lane.id,
    status:           finalStatus,
    agentResult:      agentResult ?? undefined,
    checkpoints,
    totalRetries,
    handoffsReceived: handoffsRecv,
    startedAt,
    completedAt,
    durationMs,
    error:            errorMsg,
  };

  await this.saveCheckpoints(lane.id, checkpoints);
  return laneResult;
}

// ─── driveLane ────────────────────────────────────────────────────────────────

export async function driveLane(
  this: ILaneExecutor,
  lane:        LaneDefinition,
  checkpoints: CheckpointRecord[],
  counters:    { retries: { count: number }; handoffsRef: { count: number } },
): Promise<AgentResult | null> {
  const agentFilePath = path.resolve(this._agentsBaseDir, lane.agentFile);
  const agent         = await SupervisedAgent.fromFile(agentFilePath);

  let supervisor: IntraSupervisor;
  if (lane.supervisorFile) {
    const supPath = path.resolve(this._agentsBaseDir, lane.supervisorFile);
    supervisor = await IntraSupervisor.fromFile(supPath);
  } else {
    supervisor = IntraSupervisor.noOp(lane.id);
  }

  const publishContract = (): ContractSnapshot => {
    return this._registry.getSnapshot(lane.id) ?? {
      laneId:    lane.id,
      version:   0,
      timestamp: new Date().toISOString(),
      exports:   {} as ContractExports,
      pending:   [],
    };
  };

  const pendingCosts: RoutedResponse[] = [];
  const onLlmResponse = (resp: RoutedResponse): void => {
    if (this._costTracker) pendingCosts.push(resp);
    if (this._auditLog) {
      const costUSD  = resp.usage
        ? (resp.usage.inputTokens * 0.000003 + resp.usage.outputTokens * 0.000015) : 0;
      const llmSpan  = getGlobalTracer().startLlmCall(lane.id, resp.model ?? 'unknown');
      llmSpan.setAttribute('llm.model',         resp.model ?? 'unknown')
             .setAttribute('llm.input_tokens',  resp.usage?.inputTokens ?? 0)
             .setAttribute('llm.output_tokens', resp.usage?.outputTokens ?? 0)
             .setAttribute('llm.cost_usd',      costUSD)
             .end();
      void this._auditLog.llmCall(lane.id, lane.id, resp.model ?? 'unknown', costUSD);
    }
    const llmCostUSD = resp.usage
      ? (resp.usage.inputTokens * 0.000003 + resp.usage.outputTokens * 0.000015) : 0;
    getGlobalEventBus().emitLlmCall({
      runId:            this._runId,
      laneId:           lane.id,
      model:            resp.model ?? 'unknown',
      provider:         resp.provider,
      inputTokens:      resp.usage?.inputTokens ?? 0,
      outputTokens:     resp.usage?.outputTokens ?? 0,
      estimatedCostUSD: llmCostUSD,
      timestamp:        new Date().toISOString(),
    });
  };

  const onLlmStream = (token: string): void => {
    process.stdout.write(token);
    getGlobalEventBus().emitTokenStream({
      runId:     this._runId,
      laneId:    lane.id,
      token,
      timestamp: new Date().toISOString(),
    });
  };

  const effectiveRouter: ModelRouter | undefined = lane.providerOverride && this._modelRouter
    ? this._modelRouter.withProviderOverride(lane.providerOverride)
    : this._modelRouter;

  const generator = agent.run(
    this._projectRoot, 'self', publishContract, effectiveRouter, onLlmResponse, onLlmStream,
  );

  let currentVerdict: SupervisorVerdict = { type: 'APPROVE' };
  let iteration = await generator.next(currentVerdict);

  while (!iteration.done) {
    const payload: CheckpointPayload = iteration.value;
    const checkpointStartMs = Date.now();

    for (const resp of pendingCosts.splice(0)) {
      this._costTracker?.record(lane.id, payload.checkpointId, resp);
    }

    if (payload.contracts) {
      this._registry.publish(lane.id, payload.contracts);
    }

    const supervisorRule   = supervisor.getRuleFor(payload.checkpointId);
    const effectivePayload: CheckpointPayload = supervisorRule
      ? {
          ...payload,
          mode:      supervisorRule.mode,
          waitFor:   supervisorRule.waitFor   ?? payload.waitFor,
          timeoutMs: supervisorRule.timeoutMs ?? payload.timeoutMs,
        }
      : payload;

    const barrierPayload: CheckpointPayload =
      effectivePayload.mode === 'needs-human-review'
        ? { ...effectivePayload, mode: 'self' }
        : effectivePayload;

    const barrierResolution: BarrierResolution = await this._coordinator.resolve(barrierPayload);

    let verdict: SupervisorVerdict = supervisor.evaluate(
      payload.checkpointId,
      payload.partialResult,
      barrierResolution,
    );

    if (this._interactive && effectivePayload.mode === 'needs-human-review') {
      verdict = await this._humanReviewGate.prompt(effectivePayload, verdict);
    }

    let retryCount = 0;

    if (verdict.type === 'RETRY') {
      if (supervisor.isExhausted(payload.checkpointId)) {
        verdict = {
          type:     'ESCALATE',
          reason:   `Retry budget exhausted for checkpoint "${payload.checkpointId}"`,
          evidence: { checkpointId: payload.checkpointId, laneId: lane.id },
        };
      } else {
        retryCount = supervisor.incrementRetry(payload.checkpointId);
        counters.retries.count++;
      }
    }

    if (verdict.type === 'HANDOFF') {
      verdict = this.resolveHandoffTarget(verdict, lane.id);

      if (verdict.type === 'HANDOFF' && verdict.targetLaneId) {
        const specialistLaneId = verdict.targetLaneId;
        const specialistLane   = await this.findHandoffLane(specialistLaneId, lane);

        if (specialistLane) {
          counters.handoffsRef.count++;
          const handoffResult = await this.runLane(specialistLane);
          checkpoints.push(
            this.buildRecord(effectivePayload, verdict, retryCount, barrierResolution, checkpointStartMs),
          );

          if (handoffResult.agentResult) {
            currentVerdict = { type: 'APPROVE' };
            iteration      = await generator.next(currentVerdict);
            continue;
          }
        }

        verdict = {
          type:     'ESCALATE',
          reason:   `HANDOFF target lane "${specialistLaneId}" not found or failed`,
          evidence: { originalVerdict: verdict, laneId: lane.id },
        };
      }
    }

    checkpoints.push(
      this.buildRecord(effectivePayload, verdict, retryCount, barrierResolution, checkpointStartMs),
    );

    if (verdict.type === 'ESCALATE') {
      await generator.return(null);
      throw new EscalationError(verdict.reason ?? 'Escalated', verdict);
    }

    iteration = await generator.next(verdict);
  }

  return iteration.value as AgentResult | null;
}

// ─── resolveHandoffTarget ─────────────────────────────────────────────────────

export function resolveHandoffTarget(
  this: ILaneExecutor,
  verdict:      SupervisorVerdict,
  sourceLaneId: string,
): SupervisorVerdict {
  if (verdict.type !== 'HANDOFF') return verdict;
  if (!verdict.targetLaneId) return verdict;

  const targetId = verdict.targetLaneId;
  if (!this._capabilityRegistry[targetId]) return verdict;

  const candidates = this._capabilityRegistry[targetId].filter((id) => id !== sourceLaneId);
  if (candidates.length === 0) {
    return {
      type:     'ESCALATE',
      reason:   `No lane with capability "${targetId}" found (excluding self "${sourceLaneId}")`,
      evidence: { capabilityRegistry: this._capabilityRegistry },
    };
  }

  return { ...verdict, targetLaneId: candidates[0] };
}

// ─── findHandoffLane ──────────────────────────────────────────────────────────

export async function findHandoffLane(
  this: ILaneExecutor,
  targetLaneId: string,
  _sourceLane:  LaneDefinition,
): Promise<LaneDefinition | null> {
  const agentFile      = `${targetLaneId}.agent.json`;
  const supervisorFile = `${targetLaneId}.supervisor.json`;
  const agentFilePath  = path.resolve(this._agentsBaseDir, agentFile);

  try {
    await fs.access(agentFilePath);
  } catch {
    return null;
  }

  const supPath = path.resolve(this._agentsBaseDir, supervisorFile);
  let hasSupervisor = false;
  try {
    await fs.access(supPath);
    hasSupervisor = true;
  } catch { /* no supervisor */ }

  return {
    id:             targetLaneId,
    agentFile,
    supervisorFile: hasSupervisor ? supervisorFile : undefined,
  };
}

// ─── buildRecord ─────────────────────────────────────────────────────────────

export function buildRecord(
  this: ILaneExecutor,
  payload:    CheckpointPayload,
  verdict:    SupervisorVerdict,
  retryCount: number,
  barrier:    BarrierResolution,
  startMs:    number,
): CheckpointRecord {
  return {
    checkpointId:      payload.checkpointId,
    stepIndex:         payload.stepIndex,
    mode:              payload.mode,
    payload,
    verdict,
    retryCount,
    timestamp:         new Date().toISOString(),
    contractsReceived: barrier.snapshots,
    durationMs:        Date.now() - startMs,
  };
}

// ─── saveCheckpoints ─────────────────────────────────────────────────────────

export async function saveCheckpoints(
  this: ILaneExecutor,
  laneId:  string,
  records: CheckpointRecord[],
): Promise<void> {
  if (records.length === 0) return;

  const laneDir = path.join(this._checkpointBaseDir, laneId);
  try {
    await fs.mkdir(laneDir, { recursive: true });
    for (const record of records) {
      const filePath = path.join(laneDir, `${record.checkpointId}.json`);
      const serializable = {
        ...record,
        contractsReceived: record.contractsReceived
          ? Object.fromEntries(record.contractsReceived)
          : undefined,
      };
      await fs.writeFile(filePath, JSON.stringify(serializable, null, 2), 'utf-8');
    }
  } catch {
    // Best-effort
  }
}

// ─── Standalone factory (module-level) ───────────────────────────────────────

export async function createAndRunLane(
  lane:                LaneDefinition,
  projectRoot:         string,
  registry:            ContractRegistry,
  coordinator:         BarrierCoordinator,
  capabilityRegistry?: Record<string, string[]>,
  modelRouter?:        ModelRouter,
  costTracker?:        CostTracker,
  interactive?:        boolean,
  agentsBaseDir?:      string,
  auditLog?:           AuditLog,
  checkpointBaseDir?:  string,
  runId?:              string,
): Promise<LaneResult> {
  const executor = new LaneExecutor({
    registry,
    coordinator,
    projectRoot,
    agentsBaseDir,
    capabilityRegistry,
    checkpointBaseDir,
    modelRouter,
    costTracker,
    interactive,
    auditLog,
    runId,
  });
  return executor.runLane(lane);
}
