import * as fs from 'fs/promises';
import * as path from 'path';
import { AgentDefinition, AgentResult, CheckDefinition } from './agent-types.js';
import {
    CheckpointMode,
    CheckpointPayload,
    ContractSnapshot,
    SupervisorVerdict,
} from './dag-types.js';

// ─── Internal check runner (mirrors agent-chain.ts; kept local to avoid coupling) ──

interface StepResult {
  findings: string[];
  recommendations: string[];
  detail?: { key: string; value: unknown };
}

async function runCheckStep(
  check: CheckDefinition,
  projectRoot: string,
  retryInstructions?: string,
): Promise<StepResult> {
  const fullPath = path.join(projectRoot, check.path);
  const findings: string[] = [];
  const recommendations: string[] = [];

  // For LLM-based future agents: attach retry instructions to context.
  // For filesystem checks: log them so they can be inspected.
  if (retryInstructions) {
    findings.push(`ℹ️ Retry context: ${retryInstructions}`);
  }

  let passed = false;
  let value: string | number | undefined;

  try {
    switch (check.type) {
      case 'file-exists':
      case 'dir-exists': {
        try {
          await fs.access(fullPath);
          passed = true;
        } catch {
          passed = false;
        }
        break;
      }

      case 'count-dirs': {
        try {
          const entries = await fs.readdir(fullPath, { withFileTypes: true });
          const dirs = entries.filter((e) => e.isDirectory());
          value = dirs.length;
          passed = dirs.length > 0;
        } catch {
          passed = false;
          value = 0;
        }
        break;
      }

      case 'count-files': {
        try {
          const glob = check.glob ?? '**/*';
          const entries = (await fs.readdir(fullPath, { recursive: true })) as string[];
          const ext = glob.replace('**/*', '').replace('*', '');
          const matched = entries.filter((f) => typeof f === 'string' && f.endsWith(ext));
          value = matched.length;
          passed = matched.length > 0;
        } catch {
          passed = false;
          value = 0;
        }
        break;
      }

      case 'json-field': {
        try {
          const raw = await fs.readFile(fullPath, 'utf-8');
          const json = JSON.parse(raw);
          const parts = (check.field ?? '').split('.');
          let v: unknown = json;
          for (const part of parts) {
            v = (v as Record<string, unknown>)?.[part];
          }
          if (v === undefined || v === null) {
            passed = false;
          } else if (typeof v === 'object') {
            value = Object.keys(v as object).length;
            passed = value > 0;
          } else {
            value = String(v);
            passed = true;
          }
        } catch {
          passed = false;
        }
        break;
      }

      case 'json-has-key': {
        try {
          const raw = await fs.readFile(fullPath, 'utf-8');
          const json = JSON.parse(raw);
          const parts = (check.field ?? '').split('.');
          let v: unknown = json;
          for (const part of parts) {
            v = (v as Record<string, unknown>)?.[part];
          }
          passed = v !== undefined && v !== null;
        } catch {
          passed = false;
        }
        break;
      }

      case 'grep': {
        try {
          const entries = (await fs.readdir(fullPath, { recursive: true })) as string[];
          const pattern = check.pattern ?? '';
          for (const entry of entries) {
            if (typeof entry !== 'string') continue;
            try {
              const content = await fs.readFile(path.join(fullPath, entry), 'utf-8');
              if (content.includes(pattern)) {
                passed = true;
                value = entry;
                break;
              }
            } catch {
              // skip unreadable files
            }
          }
        } catch {
          passed = false;
        }
        break;
      }

      default:
        passed = false;
    }
  } catch (err) {
    passed = false;
    findings.push(`❌ Check error: ${err}`);
  }

  // Interpolate message templates
  const interpolate = (tpl: string) =>
    tpl
      .replace('{count}', String(value ?? 0))
      .replace('{value}', String(value ?? ''))
      .replace('{path}', check.path)
      .replace('{pattern}', check.pattern ?? '')
      .replace('{field}', check.field ?? '');

  const severityIcon =
    !passed && check.failSeverity === 'error'
      ? '❌'
      : !passed && check.failSeverity === 'warning'
        ? '⚠️ '
        : !passed
          ? 'ℹ️ '
          : '';

  if (passed && check.pass) {
    findings.push(interpolate(check.pass));
  } else if (!passed && check.fail) {
    findings.push(severityIcon + interpolate(check.fail));
  }

  if (check.recommendations) {
    recommendations.push(...check.recommendations.map(interpolate));
  }
  if (passed && check.passRecommendations) {
    recommendations.push(...check.passRecommendations.map(interpolate));
  }
  if (!passed && check.failRecommendations) {
    recommendations.push(...check.failRecommendations.map(interpolate));
  }

  return {
    findings,
    recommendations,
    detail:
      value !== undefined ? { key: check.path.replace(/\W+/g, '_'), value } : undefined,
  };
}

// ─── SupervisedAgent ──────────────────────────────────────────────────────────

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
        stepResult = await runCheckStep(check, projectRoot, retryInstructions);
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
