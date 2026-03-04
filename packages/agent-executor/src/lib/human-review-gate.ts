/**
 * HumanReviewGate — injectable boundary for human-in-the-loop checkpoint reviews.
 *
 * Two implementations are provided:
 *   - InteractiveHumanReviewGate  — reads from stdin (production / interactive CLI)
 *   - AutoApproveHumanReviewGate  — returns the supervisor verdict unchanged (CI / testing)
 *
 * Inject via LaneExecutor constructor option `humanReviewGate`.
 * Tests override with AutoApproveHumanReviewGate (or a custom spy).
 */

import * as readline from 'readline';
import type { CheckpointPayload, SupervisorVerdict } from './dag-types.js';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IHumanReviewGate {
  /**
   * Present the checkpoint to a human operator and return the (potentially
   * overridden) supervisor verdict.
   *
   * @param payload  The full checkpoint payload with partial results
   * @param verdict  The supervisor's proposed verdict
   */
  prompt(payload: CheckpointPayload, verdict: SupervisorVerdict): Promise<SupervisorVerdict>;
}

// ─── Interactive (readline) implementation ────────────────────────────────────

/**
 * Prompts the operator on stdout / stdin using a readline interface.
 * Used at runtime when `LaneExecutor.interactive = true`.
 */
export class InteractiveHumanReviewGate implements IHumanReviewGate {
  async prompt(
    payload: CheckpointPayload,
    verdict: SupervisorVerdict,
  ): Promise<SupervisorVerdict> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const findings = payload.partialResult.findings ?? [];

    process.stdout.write('\n');
    process.stdout.write('  🔔  HUMAN REVIEW CHECKPOINT\n');
    process.stdout.write(`  Checkpoint : ${payload.checkpointId}\n`);
    process.stdout.write(`  Supervisor : ${verdict.type}`);
    if (verdict.type === 'RETRY') {
      process.stdout.write(` ("${verdict.instructions ?? ''}")`);
    }
    process.stdout.write('\n');

    if (findings.length > 0) {
      process.stdout.write('  Findings   :\n');
      findings.slice(-5).forEach((f) => process.stdout.write(`    ${f}\n`));
    }

    process.stdout.write(
      '\n  [a] Approve  [r] Retry  [e] Escalate  (Enter = accept verdict)\n> ',
    );

    return new Promise<SupervisorVerdict>((resolve) => {
      rl.once('line', (input) => {
        rl.close();
        const ch = input.trim().toLowerCase();
        if (ch === 'a') return resolve({ type: 'APPROVE' });
        if (ch === 'r') return resolve({ type: 'RETRY', instructions: 'Human-requested retry' });
        if (ch === 'e') {
          return resolve({
            type: 'ESCALATE',
            reason: 'Human escalated at review checkpoint',
          });
        }
        resolve(verdict); // accept supervisor verdict unchanged
      });
    });
  }
}

// ─── Auto-approve (passthrough) implementation ────────────────────────────────

/**
 * Always returns the supervisor verdict unchanged.
 * Used in automated / non-interactive runs and unit tests.
 */
export class AutoApproveHumanReviewGate implements IHumanReviewGate {
  async prompt(
    _payload: CheckpointPayload,
    verdict: SupervisorVerdict,
  ): Promise<SupervisorVerdict> {
    return verdict;
  }
}
