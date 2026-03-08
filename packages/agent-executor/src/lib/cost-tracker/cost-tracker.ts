import type { CallRecord, RunCostSummary } from './cost-tracker.types.js';
import type { RoutedResponse } from './model-router.js';
import {
    formatReport,
    isOverBudget,
    laneCost,
    record,
    save,
    summary,
    totalCost,
} from './prototype/index.js';

export interface ICostTracker {
  new(runId: string, budgetCapUSD?: number, onBudgetExceeded?: () => void): ICostTracker;
  // Private state
  _runId:              string;
  _startedAt:          string;
  _calls:              CallRecord[];
  _budgetCapUSD?:      number;
  _onBudgetExceeded?:  () => void;
  _budgetTriggered:    boolean;
  // Public API
  record(laneId: string, checkpointId: string, response: RoutedResponse): void;
  totalCost(): number;
  laneCost(laneId: string): number;
  isOverBudget(): boolean;
  summary(): RunCostSummary;
  formatReport(): string;
  save(outputDir: string): Promise<void>;
}

export const CostTracker = function(
  this: ICostTracker,
  runId: string,
  budgetCapUSD?: number,
  onBudgetExceeded?: () => void,
) {
  this._runId             = runId;
  this._startedAt         = new Date().toISOString();
  this._calls             = [];
  this._budgetCapUSD      = budgetCapUSD;
  this._onBudgetExceeded  = onBudgetExceeded;
  this._budgetTriggered   = false;
} as unknown as ICostTracker;

Object.assign(CostTracker.prototype, {
  record,
  totalCost,
  laneCost,
  isOverBudget,
  summary,
  formatReport,
  save,
});
