import type { TaskType } from '../llm-provider.js';

export interface CallRecord {
  timestamp:        string;
  laneId:           string;
  checkpointId:     string;
  taskType:         TaskType;
  provider:         string;
  model:            string;
  inputTokens:      number;
  outputTokens:     number;
  estimatedCostUSD: number;
}

export interface LaneCostSummary {
  laneId:            string;
  totalInputTokens:  number;
  totalOutputTokens: number;
  totalCostUSD:      number;
  callCount:         number;
  byModel:           Record<string, { calls: number; costUSD: number }>;
}

export interface RunCostSummary {
  runId:             string;
  startedAt:         string;
  completedAt?:      string;
  totalCostUSD:      number;
  totalInputTokens:  number;
  totalOutputTokens: number;
  byLane:            Record<string, LaneCostSummary>;
  byTaskType:        Record<string, { calls: number; costUSD: number }>;
  budgetCapUSD?:     number;
  budgetExceeded:    boolean;
  calls:             CallRecord[];
}
