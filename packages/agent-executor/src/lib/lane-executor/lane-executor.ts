import type { AuditLog } from '../audit-log.js';
import type { BarrierCoordinator } from '../barrier-coordinator.js';
import type { ContractRegistry } from '../contract-registry.js';
import type { CostTracker } from '../cost-tracker.js';
import type {
    CheckpointRecord,
    LaneDefinition,
    LaneResult,
    SupervisorVerdict,
} from '../dag-types.js';
import type { IHumanReviewGate } from '../human-review-gate.js';
import type { ModelRouter } from '../model-router.js';

export interface LaneExecutorOptions {
  registry:            ContractRegistry;
  coordinator:         BarrierCoordinator;
  projectRoot:         string;
  agentsBaseDir?:      string;
  capabilityRegistry?: Record<string, string[]>;
  checkpointBaseDir?:  string;
  modelRouter?:        ModelRouter;
  costTracker?:        CostTracker;
  interactive?:        boolean;
  humanReviewGate?:    IHumanReviewGate;
  auditLog?:           AuditLog;
  runId?:              string;
}

export interface ILaneExecutor {
  _registry:           ContractRegistry;
  _coordinator:        BarrierCoordinator;
  _projectRoot:        string;
  _agentsBaseDir:      string;
  _capabilityRegistry: Record<string, string[]>;
  _checkpointBaseDir:  string;
  _modelRouter:        ModelRouter | undefined;
  _costTracker:        CostTracker | undefined;
  _interactive:        boolean;
  _humanReviewGate:    IHumanReviewGate;
  _auditLog:           AuditLog | undefined;
  _runId:              string;

  runLane(lane: LaneDefinition):                                         Promise<LaneResult>;
  driveLane(
    lane:        LaneDefinition,
    checkpoints: CheckpointRecord[],
    counters:    { retries: { count: number }; handoffsRef: { count: number } },
  ):                                                                     Promise<import('../agent-types.js').AgentResult | null>;
  resolveHandoffTarget(verdict: SupervisorVerdict, sourceLaneId: string): SupervisorVerdict;
  findHandoffLane(targetLaneId: string, sourceLane: LaneDefinition):    Promise<LaneDefinition | null>;
  buildRecord(
    payload:    import('../dag-types.js').CheckpointPayload,
    verdict:    SupervisorVerdict,
    retryCount: number,
    barrier:    import('../dag-types.js').BarrierResolution,
    startMs:    number,
  ):                                                                     CheckpointRecord;
  saveCheckpoints(laneId: string, records: CheckpointRecord[]):         Promise<void>;
}

export const LaneExecutor = function LaneExecutor(
  this: ILaneExecutor,
  options: LaneExecutorOptions,
) {
  const { AutoApproveHumanReviewGate, InteractiveHumanReviewGate } =
    require('../human-review-gate.js') as typeof import('../human-review-gate.js');

  this._registry           = options.registry;
  this._coordinator        = options.coordinator;
  this._projectRoot        = options.projectRoot;
  this._agentsBaseDir      = options.agentsBaseDir ?? options.projectRoot;
  this._capabilityRegistry = options.capabilityRegistry ?? {};
  this._checkpointBaseDir  = options.checkpointBaseDir
    ?? require('path').join(options.projectRoot, '.agents', 'checkpoints');
  this._modelRouter        = options.modelRouter;
  this._costTracker        = options.costTracker;
  this._interactive        = options.interactive ?? false;
  this._humanReviewGate    = options.humanReviewGate
    ?? (options.interactive ? new InteractiveHumanReviewGate() : new AutoApproveHumanReviewGate());
  this._auditLog           = options.auditLog;
  this._runId              = options.runId ?? 'unknown';
} as unknown as new (options: LaneExecutorOptions) => ILaneExecutor;
