import * as fs from 'fs/promises';
import { AgentDefinition, AgentResult } from './agent-types.js';
import { StepResult, runCheckStep } from './check-runner.js';
import {
    CheckpointMode,
    CheckpointPayload,
    ContractSnapshot,
    SupervisorVerdict,
} from './dag-types.js';
import { ModelRouter, RoutedResponse } from './model-router.js';

// Re-export StepResult so callers that imported it from here still work
export type { StepResult };

/**
 * An AsyncGenerator wrapper over a JSON-driven agent definition.
 *
 * Yields `CheckpointPayload` after every check (step).
 * Receives `SupervisorVerdict` on `.next(verdict)`.
 *
 * Control flow:
 *   APPROVE  → advance to next check
 *   RETRY    → re-run current check with injected instructions (tracked externally)
 *   HANDOFF  → return null immediately (caller handles specialist lane spawn)
 *   ESCALATE → throw so caller can record the failure
 *
 * Returns the complete `AgentResult` when all checks pass their verdicts,
 * or null when the agent terminates early via HANDOFF.
 */
export class SupervisedAgent {
  private readonly definition: AgentDefinition;

  constructor(definition: AgentDefinition) {
    this.definition = definition;
  }

  get name(): string {
    return this.definition.name;
  }

  get icon(): string {
    return this.definition.icon;
  }

  // ─── Factory ───────────────────────────────────────────────────────────────

  static async fromFile(agentFile: string): Promise<SupervisedAgent> {
    const raw = await fs.readFile(agentFile, 'utf-8');
    const definition: AgentDefinition = JSON.parse(raw);
    return new SupervisedAgent(definition);
  }

  // ─── Generator ────────────────────────────────────────────────────────────

  /**
   * Run the agent check-by-check, yielding a supervised checkpoint after every step.
   *
   * @param projectRoot     Absolute path to the project being analysed
   * @param defaultMode     Checkpoint mode to use when not overridden per-check
   * @param publishContract Optional contract snapshot to publish at every checkpoint
   */
  async *run(
    projectRoot: string,
    defaultMode: CheckpointMode = 'self',
    publishContract?: () => ContractSnapshot,
    modelRouter?: ModelRouter,
    onLlmResponse?: (response: RoutedResponse) => void,
    onLlmStream?: (token: string) => void,
  ): AsyncGenerator<CheckpointPayload, AgentResult | null, SupervisorVerdict> {
    const findings: string[] = [];
    const recommendations: string[] = [];
    const details: Record<string, unknown> = {};

    const checks = this.definition.checks;
    let stepIndex = 0;

    while (stepIndex < checks.length) {
      const check = checks[stepIndex];

      // Run the check (retry instructions injected by the LaneExecutor via RETRY verdict)
      let retryInstructions: string | undefined;
      let stepResult: StepResult;

      try {
        stepResult = await runCheckStep(check, projectRoot, retryInstructions, modelRouter, onLlmResponse, onLlmStream);
      } catch (err) {
        stepResult = {
          findings: [`❌ Unexpected step error: ${err}`],
          recommendations: [],
        };
      }

      // Accumulate partial results
      findings.push(...stepResult.findings);
      recommendations.push(...stepResult.recommendations);
      if (stepResult.detail) {
        details[stepResult.detail.key] = stepResult.detail.value;
      }

      // Build partial AgentResult for this checkpoint
      const partialResult: Partial<AgentResult> = {
        agentName: this.definition.name,
        status: 'success',
        findings: [...findings],
        recommendations: [...recommendations],
        details: { ...details },
        timestamp: new Date().toISOString(),
      };

      // Build the checkpoint payload
      const checkpointId = `step-${stepIndex}`;
      const payload: CheckpointPayload = {
        checkpointId,
        mode: defaultMode,
        stepIndex,
        partialResult,
        contracts: publishContract?.(),
      };

      // Yield to the LaneExecutor; receive a verdict back
      const verdict: SupervisorVerdict = yield payload;

      switch (verdict.type) {
        case 'APPROVE':
          // Advance to next check
          stepIndex++;
          break;

        case 'RETRY': {
          // Re-run the same step with instructions attached.
          // The LaneExecutor has already validated the retry budget.
          retryInstructions = verdict.instructions;

          // Pop the findings added by this step so they don't duplicate
          const stepFindingCount = stepResult.findings.length;
          const stepRecoCount = stepResult.recommendations.length;
          if (stepFindingCount > 0) findings.splice(-stepFindingCount, stepFindingCount);
          if (stepRecoCount > 0) recommendations.splice(-stepRecoCount, stepRecoCount);
          if (stepResult.detail) delete details[stepResult.detail.key];

          // Stay on same stepIndex → will re-run the while loop body
          break;
        }

        case 'HANDOFF':
          // Terminate cleanly; LaneExecutor spawns specialist lane and merges result
          return null;

        case 'ESCALATE':
          // Throw so LaneExecutor can record the failure with evidence
          throw new EscalationError(verdict.reason ?? 'Escalated by supervisor', verdict);
      }
    }

    // All checks completed successfully
    return {
      agentName: this.definition.name,
      status: 'success',
      findings,
      recommendations,
      details,
      timestamp: new Date().toISOString(),
    };
  }
}

// ─── Error Types ──────────────────────────────────────────────────────────────

export class EscalationError extends Error {
  constructor(
    message: string,
    public readonly verdict: SupervisorVerdict,
  ) {
    super(message);
    this.name = 'EscalationError';
  }
}
