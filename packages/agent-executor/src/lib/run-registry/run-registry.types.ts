export type RunStatus = 'running' | 'success' | 'partial' | 'failed' | 'escalated';

export interface RunEntry {
  runId:        string;
  dagName:      string;
  status:       RunStatus;
  startedAt:    string;
  completedAt?: string;
  durationMs?:  number;
}

export interface RunPaths {
  runRoot:        string;
  auditDir:       string;
  checkpointsDir: string;
  resultsDir:     string;
  planStateDir:   string;
}
