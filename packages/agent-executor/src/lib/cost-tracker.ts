import * as fs from 'fs/promises';
import * as path from 'path';
import { RoutedResponse } from './model-router.js';
import { TaskType } from './llm-provider.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CallRecord {
  timestamp: string;
  laneId: string;
  checkpointId: string;
  taskType: TaskType;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUSD: number;
}

export interface LaneCostSummary {
  laneId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUSD: number;
  callCount: number;
  /** Per-model breakdown within this lane */
  byModel: Record<string, { calls: number; costUSD: number }>;
}

export interface RunCostSummary {
  runId: string;
  startedAt: string;
  completedAt?: string;
  totalCostUSD: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byLane: Record<string, LaneCostSummary>;
  byTaskType: Record<string, { calls: number; costUSD: number }>;
  budgetCapUSD?: number;
  budgetExceeded: boolean;
  calls: CallRecord[];
}

// ─── CostTracker ──────────────────────────────────────────────────────────────

/**
 * Tracks LLM call costs across a full DAG run.
 *
 * - Records every call with model, tokens, and estimated USD cost
 * - Enforces a budget cap — fires onBudgetExceeded when the cap is hit
 * - Generates per-run and per-lane cost summaries
 * - Saves summaries to disk as JSON
 *
 * Usage:
 *   const tracker = new CostTracker(runId, 0.50, () => dag.abort('Budget exceeded'));
 *   tracker.record('backend-lane', 'step-2', routedResponse);
 *   console.log(tracker.formatReport());
 *   await tracker.save('.agents/results/');
 */
export class CostTracker {
  private readonly runId: string;
  private readonly startedAt: string;
  private readonly calls: CallRecord[] = [];
  private readonly budgetCapUSD?: number;
  private readonly onBudgetExceeded?: () => void;
  private budgetTriggered = false;

  constructor(runId: string, budgetCapUSD?: number, onBudgetExceeded?: () => void) {
    this.runId = runId;
    this.startedAt = new Date().toISOString();
    this.budgetCapUSD = budgetCapUSD;
    this.onBudgetExceeded = onBudgetExceeded;
  }

  // ─── Recording ─────────────────────────────────────────────────────────────

  /** Record a completed LLM call. Triggers budget callback if cap is exceeded. */
  record(laneId: string, checkpointId: string, response: RoutedResponse): void {
    this.calls.push({
      timestamp: new Date().toISOString(),
      laneId,
      checkpointId,
      taskType: response.taskType,
      provider: response.provider,
      model: response.model,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      estimatedCostUSD: response.estimatedCostUSD,
    });

    if (
      !this.budgetTriggered &&
      this.budgetCapUSD !== undefined &&
      this.totalCost() >= this.budgetCapUSD
    ) {
      this.budgetTriggered = true;
      this.onBudgetExceeded?.();
    }
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  /** Total estimated USD spend for this run so far */
  totalCost(): number {
    return this.calls.reduce((sum, c) => sum + c.estimatedCostUSD, 0);
  }

  /** Total estimated USD spend for a specific lane */
  laneCost(laneId: string): number {
    return this.calls
      .filter((c) => c.laneId === laneId)
      .reduce((sum, c) => sum + c.estimatedCostUSD, 0);
  }

  /** Whether the budget cap has been exceeded */
  get isOverBudget(): boolean {
    return this.budgetTriggered;
  }

  // ─── Summary ───────────────────────────────────────────────────────────────

  /** Build a structured cost summary for the full run */
  summary(): RunCostSummary {
    const byLane: Record<string, LaneCostSummary> = {};
    const byTaskType: Record<string, { calls: number; costUSD: number }> = {};

    for (const call of this.calls) {
      // ── By lane ──
      if (!byLane[call.laneId]) {
        byLane[call.laneId] = {
          laneId: call.laneId,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCostUSD: 0,
          callCount: 0,
          byModel: {},
        };
      }
      const lane = byLane[call.laneId];
      lane.totalInputTokens += call.inputTokens;
      lane.totalOutputTokens += call.outputTokens;
      lane.totalCostUSD += call.estimatedCostUSD;
      lane.callCount++;

      if (!lane.byModel[call.model]) lane.byModel[call.model] = { calls: 0, costUSD: 0 };
      lane.byModel[call.model].calls++;
      lane.byModel[call.model].costUSD += call.estimatedCostUSD;

      // ── By task type ──
      if (!byTaskType[call.taskType]) byTaskType[call.taskType] = { calls: 0, costUSD: 0 };
      byTaskType[call.taskType].calls++;
      byTaskType[call.taskType].costUSD += call.estimatedCostUSD;
    }

    const totalCost = this.totalCost();

    return {
      runId: this.runId,
      startedAt: this.startedAt,
      completedAt: new Date().toISOString(),
      totalCostUSD: totalCost,
      totalInputTokens: this.calls.reduce((s, c) => s + c.inputTokens, 0),
      totalOutputTokens: this.calls.reduce((s, c) => s + c.outputTokens, 0),
      byLane,
      byTaskType,
      budgetCapUSD: this.budgetCapUSD,
      budgetExceeded: this.budgetCapUSD !== undefined && totalCost >= this.budgetCapUSD,
      calls: this.calls,
    };
  }

  /**
   * Format a human-readable cost report for CLI output.
   *
   * Example output:
   *   💰 Cost Report — Run abc123
   *      Total: $0.00231 USD  (1,240 in / 380 out tokens)
   *
   *      By lane:
   *        backend-lane    $0.00180  (3 calls)
   *        react-lane      $0.00051  (1 call)
   *
   *      By task type:
   *        code-generation           $0.00180  (2 calls)
   *        file-analysis             $0.00051  (2 calls)
   */
  formatReport(): string {
    const s = this.summary();
    const lines: string[] = [
      `💰 Cost Report — Run ${this.runId}`,
      `   Total: $${s.totalCostUSD.toFixed(5)} USD  ` +
        `(${s.totalInputTokens.toLocaleString()} in / ${s.totalOutputTokens.toLocaleString()} out tokens)`,
      '',
      '   By lane:',
      ...Object.values(s.byLane).map(
        (l) =>
          `     ${l.laneId.padEnd(20)} $${l.totalCostUSD.toFixed(5)}  (${l.callCount} call${l.callCount === 1 ? '' : 's'})`,
      ),
      '',
      '   By task type:',
      ...Object.entries(s.byTaskType).map(
        ([t, d]) =>
          `     ${t.padEnd(28)} $${d.costUSD.toFixed(5)}  (${d.calls} call${d.calls === 1 ? '' : 's'})`,
      ),
    ];

    if (s.budgetExceeded) {
      lines.push('', `   ⚠️  Budget cap of $${s.budgetCapUSD} USD EXCEEDED`);
    }

    return lines.join('\n');
  }

  /** Persist the cost summary JSON to disk */
  async save(outputDir: string): Promise<void> {
    await fs.mkdir(outputDir, { recursive: true });
    const filename = `cost-${this.runId}.json`;
    await fs.writeFile(
      path.join(outputDir, filename),
      JSON.stringify(this.summary(), null, 2),
      'utf-8',
    );
  }
}
