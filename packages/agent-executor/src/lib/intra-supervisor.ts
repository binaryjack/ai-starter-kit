import * as fs from 'fs/promises';
import { AgentResult } from './agent-types.js';
import {
    BarrierResolution,
    ExpectRules,
    SupervisorCheckpointRule,
    SupervisorConfig,
    SupervisorVerdict,
    VerdictType,
} from './dag-types.js';

// ─── IntraSupervisor ──────────────────────────────────────────────────────────

/**
 * Reads a *.supervisor.json file and evaluates checkpoints against its rules.
 *
 * Responsibility: intra-lane quality gate — decides APPROVE / RETRY / HANDOFF / ESCALATE.
 * Does NOT handle cross-lane waiting (that is the BarrierCoordinator's job).
 *
 * Usage:
 *   const sup = await IntraSupervisor.fromFile('agents/backend.supervisor.json');
 *   const verdict = sup.evaluate('step-2-error-manager', partialResult, barrierResolution, 0);
 */
export class IntraSupervisor {
  private readonly config: SupervisorConfig;
  private readonly retryCounters = new Map<string, number>();

  constructor(config: SupervisorConfig) {
    this.config = config;
  }

  // ─── Factory ─────────────────────────────────────────────────────────────

  static async fromFile(filePath: string): Promise<IntraSupervisor> {
    const raw = await fs.readFile(filePath, 'utf-8');
    const config = JSON.parse(raw) as SupervisorConfig;
    return new IntraSupervisor(config);
  }

  /** Create a no-op supervisor that approves everything (used when supervisorFile is absent) */
  static noOp(laneId: string): IntraSupervisor {
    return new IntraSupervisor({ laneId, retryBudget: 0, checkpoints: [] });
  }

  // ─── Evaluation ──────────────────────────────────────────────────────────

  /**
   * Evaluate a checkpoint and return a verdict.
   *
   * @param checkpointId   Must match a rule in config.checkpoints (if no rule → APPROVE)
   * @param partialResult  Current partial results from the agent
   * @param barrier        Resolution data from BarrierCoordinator (snapshots from other lanes)
   */
  evaluate(
    checkpointId: string,
    partialResult: Partial<AgentResult>,
    barrier: BarrierResolution,
  ): SupervisorVerdict {
    const rule = this.config.checkpoints.find((c) => c.checkpointId === checkpointId);

    // No rule for this checkpoint → auto-approve
    if (!rule) {
      return { type: 'APPROVE' };
    }

    // Check hard-barrier timeout — if required lanes didn't publish, escalate
    if (rule.mode === 'hard-barrier' && barrier.timedOut.length > 0) {
      const fallback = rule.fallback ?? 'escalate';
      if (fallback === 'escalate') {
        return {
          type: 'ESCALATE',
          reason: `Hard-barrier timed out waiting for lanes: ${barrier.timedOut.join(', ')}`,
          evidence: { timedOut: barrier.timedOut, checkpointId },
        };
      }
      // proceed-with-snapshot: continue despite missing lanes
      return { type: 'APPROVE' };
    }

    // Soft-align timeout: apply fallback
    if (rule.mode === 'soft-align' && barrier.timedOut.length > 0) {
      const fallback = rule.fallback ?? 'proceed-with-snapshot';
      if (fallback === 'escalate') {
        return {
          type: 'ESCALATE',
          reason: `Soft-align timed out waiting for lanes: ${barrier.timedOut.join(', ')}`,
          evidence: { timedOut: barrier.timedOut, checkpointId },
        };
      }
      // proceed-with-snapshot → skip expect checks, approve with partial contracts
      return { type: 'APPROVE' };
    }

    // Apply expect rules
    if (rule.expect) {
      const failure = this.applyExpect(rule.expect, partialResult, barrier);
      if (failure) {
        return this.buildFailVerdict(rule, checkpointId, failure);
      }
    }

    return { type: 'APPROVE' };
  }

  /** Whether the retry budget is exhausted for a specific checkpoint */
  isExhausted(checkpointId: string): boolean {
    return (this.retryCounters.get(checkpointId) ?? 0) >= this.config.retryBudget;
  }

  /** Increment retry counter for a checkpoint and return the new count */
  incrementRetry(checkpointId: string): number {
    const count = (this.retryCounters.get(checkpointId) ?? 0) + 1;
    this.retryCounters.set(checkpointId, count);
    return count;
  }

  /** Current retry count for a checkpoint */
  retryCount(checkpointId: string): number {
    return this.retryCounters.get(checkpointId) ?? 0;
  }

  get laneId(): string {
    return this.config.laneId;
  }

  get retryBudget(): number {
    return this.config.retryBudget;
  }

  /**
   * Return the checkpoint rule for a given checkpointId, or undefined if no rule exists.
   * Used by LaneExecutor to drive the BarrierCoordinator with the correct mode/waitFor.
   */
  getRuleFor(checkpointId: string): SupervisorCheckpointRule | undefined {
    return this.config.checkpoints.find((c) => c.checkpointId === checkpointId);
  }

  // ─── Expect Rule Evaluators ───────────────────────────────────────────────

  /**
   * Apply all expect rules. Returns the first failure message, or null if all pass.
   */
  private applyExpect(
    expect: ExpectRules,
    partial: Partial<AgentResult>,
    barrier: BarrierResolution,
  ): string | null {
    const findings = partial.findings ?? [];
    const details = partial.details ?? {};

    // minFindings
    if (expect.minFindings !== undefined && findings.length < expect.minFindings) {
      return `Expected at least ${expect.minFindings} findings, got ${findings.length}`;
    }

    // noErrorFindings — no finding may start with ❌
    if (expect.noErrorFindings) {
      const errors = findings.filter((f) => f.startsWith('❌'));
      if (errors.length > 0) {
        return `Found ${errors.length} error finding(s): ${errors[0]}`;
      }
    }

    // maxErrorSeverity — check that no finding starts with the forbidden severity marker
    if (expect.maxErrorSeverity) {
      const severityOrder = { info: 0, warning: 1, error: 2 };
      const maxLevel = severityOrder[expect.maxErrorSeverity];
      const errorMarkers = ['🔴', '❌'];
      const warningMarkers = ['⚠️', '🟡'];

      for (const finding of findings) {
        const isError = errorMarkers.some((m) => finding.startsWith(m));
        const isWarning = warningMarkers.some((m) => finding.startsWith(m));
        const level = isError ? 2 : isWarning ? 1 : 0;
        if (level > maxLevel) {
          return `Finding exceeds max severity (${expect.maxErrorSeverity}): ${finding}`;
        }
      }
    }

    // requiredKeys — must exist in details
    if (expect.requiredKeys) {
      for (const key of expect.requiredKeys) {
        if (!(key in details)) {
          return `Required detail key missing: "${key}"`;
        }
      }
    }

    // contractFields — must exist in at least one of the received lane snapshots
    if (expect.contractFields && expect.contractFields.length > 0) {
      for (const field of expect.contractFields) {
        let found = false;
        for (const [, snapshot] of barrier.snapshots) {
          if (snapshot && field in snapshot.exports) {
            found = true;
            break;
          }
        }
        if (!found) {
          return `Required contract field "${field}" not found in any lane snapshot`;
        }
      }
    }

    return null; // all rules passed
  }

  // ─── Verdict Builder ──────────────────────────────────────────────────────

  private buildFailVerdict(
    rule: SupervisorCheckpointRule,
    checkpointId: string,
    failureReason: string,
  ): SupervisorVerdict {
    const onFail: VerdictType = rule.onFail ?? 'RETRY';

    // If budget exhausted, force escalate regardless of onFail
    if (onFail === 'RETRY' && this.isExhausted(checkpointId)) {
      return {
        type: 'ESCALATE',
        reason: `Retry budget exhausted (${this.config.retryBudget} retries) for checkpoint "${checkpointId}". Last failure: ${failureReason}`,
        evidence: { checkpointId, failureReason, retries: this.retryCounters.get(checkpointId) },
      };
    }

    switch (onFail) {
      case 'APPROVE':
        return { type: 'APPROVE' };

      case 'RETRY':
        return {
          type: 'RETRY',
          instructions:
            rule.retryInstructions ??
            `Re-examine checkpoint "${checkpointId}". Issue: ${failureReason}`,
        };

      case 'HANDOFF':
        return {
          type: 'HANDOFF',
          targetLaneId: rule.handoffTo,
          handoffContext: { failureReason, checkpointId },
        };

      case 'ESCALATE':
      default:
        return {
          type: 'ESCALATE',
          reason: failureReason,
          evidence: { checkpointId, rule },
        };
    }
  }
}
