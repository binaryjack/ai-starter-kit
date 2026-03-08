import type { RoutedResponse } from '../../model-router.js';
import type { ICostTracker } from '../cost-tracker.js';
import type { LaneCostSummary, RunCostSummary } from '../cost-tracker.types.js';

export function record(
  this: ICostTracker,
  laneId: string,
  checkpointId: string,
  response: RoutedResponse,
): void {
  this._calls.push({
    timestamp:        new Date().toISOString(),
    laneId,
    checkpointId,
    taskType:         response.taskType,
    provider:         response.provider,
    model:            response.model,
    inputTokens:      response.usage.inputTokens,
    outputTokens:     response.usage.outputTokens,
    estimatedCostUSD: response.estimatedCostUSD,
  });

  if (
    !this._budgetTriggered &&
    this._budgetCapUSD !== undefined &&
    this.totalCost() >= this._budgetCapUSD
  ) {
    this._budgetTriggered = true;
    this._onBudgetExceeded?.();
  }
}

export function totalCost(this: ICostTracker): number {
  return this._calls.reduce((sum, c) => sum + c.estimatedCostUSD, 0);
}

export function laneCost(this: ICostTracker, laneId: string): number {
  return this._calls
    .filter((c) => c.laneId === laneId)
    .reduce((sum, c) => sum + c.estimatedCostUSD, 0);
}

export function isOverBudget(this: ICostTracker): boolean {
  return this._budgetTriggered;
}

export function summary(this: ICostTracker): RunCostSummary {
  const byLane:     Record<string, LaneCostSummary>              = {};
  const byTaskType: Record<string, { calls: number; costUSD: number }> = {};

  for (const call of this._calls) {
    if (!byLane[call.laneId]) {
      byLane[call.laneId] = {
        laneId:           call.laneId,
        totalInputTokens:  0,
        totalOutputTokens: 0,
        totalCostUSD:      0,
        callCount:         0,
        byModel:           {},
      };
    }
    const lane = byLane[call.laneId]!;
    lane.totalInputTokens  += call.inputTokens;
    lane.totalOutputTokens += call.outputTokens;
    lane.totalCostUSD      += call.estimatedCostUSD;
    lane.callCount++;

    if (!lane.byModel[call.model]) lane.byModel[call.model] = { calls: 0, costUSD: 0 };
    lane.byModel[call.model]!.calls++;
    lane.byModel[call.model]!.costUSD += call.estimatedCostUSD;

    if (!byTaskType[call.taskType]) byTaskType[call.taskType] = { calls: 0, costUSD: 0 };
    byTaskType[call.taskType]!.calls++;
    byTaskType[call.taskType]!.costUSD += call.estimatedCostUSD;
  }

  const totalC = this.totalCost();

  return {
    runId:             this._runId,
    startedAt:         this._startedAt,
    completedAt:       new Date().toISOString(),
    totalCostUSD:      totalC,
    totalInputTokens:  this._calls.reduce((s, c) => s + c.inputTokens, 0),
    totalOutputTokens: this._calls.reduce((s, c) => s + c.outputTokens, 0),
    byLane,
    byTaskType,
    budgetCapUSD:      this._budgetCapUSD,
    budgetExceeded:    this._budgetCapUSD !== undefined && totalC >= this._budgetCapUSD,
    calls:             this._calls,
  };
}

export function formatReport(this: ICostTracker): string {
  const s = this.summary();
  const lines: string[] = [
    `💰 Cost Report — Run ${this._runId}`,
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
