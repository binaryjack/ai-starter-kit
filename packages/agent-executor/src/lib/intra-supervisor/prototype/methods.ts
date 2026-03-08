import type { AgentResult } from '../../agent-types.js';
import type {
    BarrierResolution,
    ExpectRules,
    SupervisorCheckpointRule,
    SupervisorVerdict,
    VerdictType,
} from '../../dag-types.js';
import type { IIntraSupervisor } from '../intra-supervisor.js';

export function evaluate(
  this: IIntraSupervisor,
  checkpointId: string,
  partialResult: Partial<AgentResult>,
  barrier: BarrierResolution,
): SupervisorVerdict {
  const rule = this._config.checkpoints.find((c) => c.checkpointId === checkpointId);

  if (!rule) {
    return { type: 'APPROVE' };
  }

  if (rule.mode === 'hard-barrier' && barrier.timedOut.length > 0) {
    const fallback = rule.fallback ?? 'escalate';
    if (fallback === 'escalate') {
      return {
        type: 'ESCALATE',
        reason: `Hard-barrier timed out waiting for lanes: ${barrier.timedOut.join(', ')}`,
        evidence: { timedOut: barrier.timedOut, checkpointId },
      };
    }
    return { type: 'APPROVE' };
  }

  if (rule.mode === 'soft-align' && barrier.timedOut.length > 0) {
    const fallback = rule.fallback ?? 'proceed-with-snapshot';
    if (fallback === 'escalate') {
      return {
        type: 'ESCALATE',
        reason: `Soft-align timed out waiting for lanes: ${barrier.timedOut.join(', ')}`,
        evidence: { timedOut: barrier.timedOut, checkpointId },
      };
    }
    return { type: 'APPROVE' };
  }

  if (rule.expect) {
    const failure = _applyExpect(this, rule.expect, partialResult, barrier);
    if (failure) {
      return _buildFailVerdict(this, rule, checkpointId, failure);
    }
  }

  return { type: 'APPROVE' };
}

export function isExhausted(this: IIntraSupervisor, checkpointId: string): boolean {
  return (this._retryCounters.get(checkpointId) ?? 0) >= this._config.retryBudget;
}

export function incrementRetry(this: IIntraSupervisor, checkpointId: string): number {
  const count = (this._retryCounters.get(checkpointId) ?? 0) + 1;
  this._retryCounters.set(checkpointId, count);
  return count;
}

export function retryCount(this: IIntraSupervisor, checkpointId: string): number {
  return this._retryCounters.get(checkpointId) ?? 0;
}

export function laneId(this: IIntraSupervisor): string {
  return this._config.laneId;
}

export function retryBudget(this: IIntraSupervisor): number {
  return this._config.retryBudget;
}

export function getRuleFor(this: IIntraSupervisor, checkpointId: string): SupervisorCheckpointRule | undefined {
  return this._config.checkpoints.find((c) => c.checkpointId === checkpointId);
}

function _applyExpect(
  self: IIntraSupervisor,
  expect: ExpectRules,
  partial: Partial<AgentResult>,
  barrier: BarrierResolution,
): string | null {
  const findings = partial.findings ?? [];
  const details = partial.details ?? {};

  if (expect.minFindings !== undefined && findings.length < expect.minFindings) {
    return `Expected at least ${expect.minFindings} findings, got ${findings.length}`;
  }

  if (expect.noErrorFindings) {
    const errors = findings.filter((f) => f.startsWith('❌'));
    if (errors.length > 0) {
      return `Found ${errors.length} error finding(s): ${errors[0]}`;
    }
  }

  if (expect.maxErrorSeverity) {
    const severityOrder: Record<string, number> = { info: 0, warning: 1, error: 2 };
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

  if (expect.requiredKeys) {
    for (const key of expect.requiredKeys) {
      if (!(key in details)) {
        return `Required detail key missing: "${key}"`;
      }
    }
  }

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

  return null;
}

function _buildFailVerdict(
  self: IIntraSupervisor,
  rule: SupervisorCheckpointRule,
  checkpointId: string,
  failureReason: string,
): SupervisorVerdict {
  const onFail: VerdictType = rule.onFail ?? 'RETRY';

  if (onFail === 'RETRY' && self.isExhausted(checkpointId)) {
    return {
      type: 'ESCALATE',
      reason: `Retry budget exhausted (${self._config.retryBudget} retries) for checkpoint "${checkpointId}". Last failure: ${failureReason}`,
      evidence: { checkpointId, failureReason, retries: self._retryCounters.get(checkpointId) },
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
