/**
 * DAG (Directed Acyclic Graph) type definitions for the multi-lane
 * supervised agent execution system.
 *
 * Dependency map:
 *   dag-types.ts   ← no internal deps (pure interfaces)
 *   contract-registry.ts  ← dag-types
 *   barrier-coordinator.ts ← dag-types + contract-registry
 *   intra-supervisor.ts   ← dag-types
 *   supervised-agent.ts   ← dag-types + agent-types
 *   lane-executor.ts      ← all of the above
 *   dag-orchestrator.ts   ← lane-executor + contract-registry
 */

import { AgentResult } from './agent-types.js';

// ─── Verdict System ───────────────────────────────────────────────────────────

export type VerdictType = 'APPROVE' | 'RETRY' | 'HANDOFF' | 'ESCALATE';

export interface SupervisorVerdict {
  type: VerdictType;

  /** RETRY: specific corrective instructions passed back to the agent generator */
  instructions?: string;

  /** HANDOFF: lane ID from the capability registry that should take over */
  targetLaneId?: string;

  /** HANDOFF: sub-context to pass to the specialist lane */
  handoffContext?: unknown;

  /** ESCALATE: human-readable reason why automatic resolution failed */
  reason?: string;

  /** ESCALATE: evidence payload (partial results, mismatched contracts, etc.) */
  evidence?: unknown;
}

// ─── Checkpoint System ────────────────────────────────────────────────────────

/**
 * How a checkpoint is resolved:
 *   self               → supervisor validates this lane's own output only
 *   read-contract      → read another lane's current snapshot non-blocking
 *   soft-align         → wait up to timeoutMs for another lane's snapshot
 *   hard-barrier       → all named lanes must reach this point before any continues
 *   needs-human-review → pause for human decision when running with --interactive
 */
export type CheckpointMode =
  | 'self'
  | 'read-contract'
  | 'soft-align'
  | 'hard-barrier'
  | 'needs-human-review';

/**
 * What an agent yields to the executor at a pause point.
 * The executor routes this to the BarrierCoordinator + IntraSupervisor,
 * then resumes the generator with a SupervisorVerdict.
 */
export interface CheckpointPayload {
  /** Unique within the lane — matches a checkpointId in *.supervisor.json */
  checkpointId: string;

  mode: CheckpointMode;

  /** 0-based index of the current step within this lane */
  stepIndex: number;

  /** Work completed so far in this lane — may be partial */
  partialResult: Partial<AgentResult>;

  /** Contracts this lane is publishing at this checkpoint */
  contracts?: ContractSnapshot;

  /**
   * For soft-align / hard-barrier: which lane IDs to wait for.
   * For read-contract: the single lane ID to read from.
   */
  waitFor?: string[];

  /**
   * soft-align only: max milliseconds to wait for waitFor lanes.
   * Defaults to supervisor config or 5000ms.
   */
  timeoutMs?: number;
}

// ─── Contract Registry Types ──────────────────────────────────────────────────

/**
 * A versioned snapshot of what a lane has committed to so far.
 * Published to the ContractRegistry at each checkpoint.
 * Other lanes read these without blocking the publisher.
 */
export interface ContractSnapshot {
  laneId: string;

  /** Monotonically increasing — bumps on every publish() call */
  version: number;

  timestamp: string;

  /** What this lane currently exposes to other lanes */
  exports: ContractExports;

  /** What this lane still needs from other lanes (for documentation / debugging) */
  pending: string[];
}

/**
 * The typed exports shape — extend this interface as new contract types are added.
 * Kept flat and optional so lanes only populate what they produce.
 */
export interface ContractExports {
  apiRoutes?: RouteContract[];
  dbSchema?: TableContract[];
  components?: ComponentContract[];
  errorTypes?: ErrorContract[];
  eventTypes?: EventContract[];
  /** Arbitrary additional exports — allows extension without interface changes */
  [key: string]: unknown;
}

export interface RouteContract {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  requestSchema?: string;
  responseSchema?: string;
  errorCodes?: string[];
}

export interface TableContract {
  tableName: string;
  columns: Array<{ name: string; type: string; nullable?: boolean }>;
  primaryKey: string;
}

export interface ComponentContract {
  name: string;
  props: Record<string, string>; // propName → TypeScript type string
  emits?: string[];
  atomicLevel?: 'atom' | 'molecule' | 'organism' | 'template' | 'page';
}

export interface ErrorContract {
  code: string;
  message: string;
  httpStatus?: number;
  retryable?: boolean;
}

export interface EventContract {
  name: string;
  payload: Record<string, string>; // fieldName → TypeScript type string
}

// ─── Barrier Resolution ───────────────────────────────────────────────────────

export interface BarrierResolution {
  /** Whether the barrier fully resolved (vs. timed out or partial) */
  resolved: boolean;

  /**
   * Snapshots gathered from waitFor lanes.
   * May be partial if some lanes timed out (their entries will be null).
   */
  snapshots: Map<string, ContractSnapshot | null>;

  /**
   * Lane IDs that did not publish within the timeout window.
   * Empty array for 'self' and 'read-contract' modes.
   */
  timedOut: string[];
}

// ─── Lane & DAG Definitions ───────────────────────────────────────────────────

/** A single parallel execution unit: one agent + one supervisor */
export interface LaneDefinition {
  /** Unique identifier — used in dependsOn, waitFor, capabilityRegistry */
  id: string;

  /** Relative path to the *.agent.json file for this lane */
  agentFile: string;

  /**
   * Relative path to the *.supervisor.json file for this lane.
   * If omitted or file not found, lane runs without supervision (all auto-approve).
   */
  supervisorFile?: string;

  /**
   * Lane IDs that must START before this lane can start.
   * Validated at load time for cycles (Kahn's algorithm).
   */
  dependsOn?: string[];

  /** Capability names this lane can handle for HANDOFF routing */
  capabilities?: string[];

  /**
   * Declared shape of this lane's ContractExports, expressed as
   * fieldName → TypeScript type string.  Used for validation and
   * documentation; not enforced at runtime.
   *
   * Example:
   *   { "apiRoutes": "RouteContract[]", "errorTypes": "ErrorContract[]" }
   */
  contractSchema?: Record<string, string>;

  /**
   * Override the default LLM provider for this lane only.
   * Must match a key in the `providers` map of model-router.json.
   *
   * Example: "openai" | "anthropic" | "vscode" | any custom provider id
   *
   * When set, the lane creates a scoped model-router config that forces
   * this provider regardless of the global routing profile.
   */
  providerOverride?: string;
}

/** A named synchronization point that requires all participant lanes to arrive */
export interface GlobalBarrier {
  name: string;

  /** Lane IDs that must all publish a snapshot before any can continue past this barrier */
  participants: string[];

  /** Max ms to wait for stragglers before marking them as timed-out */
  timeoutMs: number;
}

/** Top-level DAG configuration — loaded from dag.json */
export interface DagDefinition {
  name: string;
  description: string;
  lanes: LaneDefinition[];

  /** Optional named global sync points declared at the DAG level */
  globalBarriers?: GlobalBarrier[];

  /**
   * Maps capability name → lane IDs that can handle it.
   * Used by IntraSupervisor to route HANDOFF verdicts.
   */
  capabilityRegistry?: Record<string, string[]>;

  /** Path to model-router.json (relative to dag.json location) */
  modelRouterFile?: string;
}

// ─── Execution Results ────────────────────────────────────────────────────────

export interface CheckpointRecord {
  checkpointId: string;
  stepIndex: number;
  mode: CheckpointMode;
  payload: CheckpointPayload;
  verdict: SupervisorVerdict;
  retryCount: number;
  timestamp: string;
  /** Contracts received from other lanes at this checkpoint */
  contractsReceived?: Map<string, ContractSnapshot | null>;
  durationMs: number;
}

export interface LaneResult {
  laneId: string;
  status: 'success' | 'failed' | 'escalated' | 'timed-out';
  agentResult?: AgentResult;
  checkpoints: CheckpointRecord[];
  totalRetries: number;
  handoffsReceived: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  error?: string;
}

export interface DagResult {
  dagName: string;
  runId: string;
  status: 'success' | 'partial' | 'failed';
  lanes: LaneResult[];
  totalDurationMs: number;
  startedAt: string;
  completedAt: string;
  /** Rolled-up findings from all successful lanes */
  findings: string[];
  /** Rolled-up recommendations from all successful lanes */
  recommendations: string[];
}

// ─── Supervisor Config Types (mirrors *.supervisor.json schema) ───────────────

export interface ExpectRules {
  /** Minimum number of findings required */
  minFindings?: number;
  /** Maximum severity allowed (any finding above this → fail) */
  maxErrorSeverity?: 'info' | 'warning' | 'error';
  /** Keys that must exist in partialResult.details */
  requiredKeys?: string[];
  /** Fields that must be present in the other lane's ContractExports */
  contractFields?: string[];
  /** No finding string may start with ❌ */
  noErrorFindings?: boolean;
}

export interface SupervisorCheckpointRule {
  checkpointId: string;
  mode: CheckpointMode;
  expect?: ExpectRules;
  onFail?: VerdictType;
  retryInstructions?: string;
  handoffTo?: string;
  waitFor?: string[];
  timeoutMs?: number;
  /** What to do when soft-align times out: 'proceed-with-snapshot' | 'escalate' */
  fallback?: 'proceed-with-snapshot' | 'escalate';
}

export interface SupervisorConfig {
  laneId: string;
  retryBudget: number;
  checkpoints: SupervisorCheckpointRule[];
}
