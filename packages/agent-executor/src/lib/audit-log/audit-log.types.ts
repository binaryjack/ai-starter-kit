export type AuditEventType =
  | 'run-start'
  | 'run-end'
  | 'lane-start'
  | 'lane-end'
  | 'checkpoint'
  | 'verdict'
  | 'llm-call'
  | 'tool-call'
  | 'human-review'
  | 'budget-exceeded'
  | 'decision'
  | 'error';

export interface AuditEvent {
  runId: string;
  laneId?: string;
  checkpointId?: string;
  eventType: AuditEventType;
  actor?: string;
  payload: unknown;
  costUSD?: number;
  durationMs?: number;
  timestamp: string;
}

export interface AuditEntry extends AuditEvent {
  seq: number;
  prevHash: string;
  hash: string;
}

export interface AuditVerificationReport {
  runId: string;
  totalEntries: number;
  valid: boolean;
  brokenLinks: Array<{ seq: number; reason: string }>;
}
