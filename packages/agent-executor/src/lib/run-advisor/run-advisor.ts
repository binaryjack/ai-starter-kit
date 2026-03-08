import * as path from 'path'
import type { DagResult } from '../dag-types.js'
import type { RunEntry } from '../run-registry/run-registry.types.js'

export interface RunAdvisorOptions {
  lookback?: number;
  maxAvgRetries?: number;
  slowLaneMs?: number;
  maxFailureRate?: number;
  minSuccessRate?: number;
  minRunsForOptimisation?: number;
}

export type RecommendationKind =
  | 'HIGH_RETRY_RATE'
  | 'SLOW_LANE'
  | 'FLAKY_LANE'
  | 'DOWNGRADE_MODEL'
  | 'BUDGET_SUGGESTION'
  | 'DAG_UNSTABLE';

export interface Recommendation {
  kind:    RecommendationKind;
  laneId?: string;
  message: string;
  data:    Record<string, unknown>;
}

export interface LaneStats {
  laneId:          string;
  sampleCount:     number;
  avgRetries:      number;
  maxRetries:      number;
  avgDurationMs:   number;
  maxDurationMs:   number;
  successCount:    number;
  failureCount:    number;
  escalationCount: number;
  failureRate:     number;
}

export interface AdviceReport {
  generatedAt:     string;
  dagName:         string;
  runsAnalysed:    number;
  lookback:        number;
  dagSuccessRate:  number;
  perLane:         LaneStats[];
  recommendations: Recommendation[];
}

export interface IRunAdvisor {
  _projectRoot:  string;
  _runsDir:      string;
  _manifestPath: string;
  analyse(options?: RunAdvisorOptions): Promise<AdviceReport>;
  formatReport(report: AdviceReport): string;
  _readManifest(): Promise<RunEntry[]>;
  _loadResults(entries: RunEntry[]): Promise<DagResult[]>;
}

export const RunAdvisor = function (this: IRunAdvisor, projectRoot: string) {
  this._projectRoot  = projectRoot;
  this._runsDir      = path.join(projectRoot, '.agents', 'runs');
  this._manifestPath = path.join(this._runsDir, 'manifest.json');
} as unknown as new (projectRoot: string) => IRunAdvisor;
