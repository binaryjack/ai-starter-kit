import * as fs from 'fs/promises';
import * as path from 'path';
import type { AuditEvent, AuditEntry, AuditVerificationReport } from './audit-log.types.js';
import { sha256 } from './audit-log-helpers.js';
import {
  open,
  close,
  write,
  runStart,
  runEnd,
  laneStart,
  laneEnd,
  checkpoint,
  llmCall,
  toolCall,
  decision,
  error,
} from './prototype/index.js';

const GENESIS_HASH = '0'.repeat(64);

export interface IAuditLog {
  new(projectRoot: string, runId: string, auditDir?: string): IAuditLog;
  // Private state
  _filePath:  string;
  _runId:     string;
  _lastHash:  string;
  _seq:       number;
  _fh?:       import('fs').promises.FileHandle;
  // Public API
  open(): Promise<void>;
  close(): Promise<void>;
  write(event: AuditEvent): Promise<AuditEntry>;
  runStart(payload: Record<string, unknown>): Promise<void>;
  runEnd(durationMs: number, payload?: Record<string, unknown>): Promise<void>;
  laneStart(laneId: string, actor: string): Promise<void>;
  laneEnd(laneId: string, actor: string, durationMs: number, status: string): Promise<void>;
  checkpoint(laneId: string, checkpointId: string, verdict: string, costUSD?: number): Promise<void>;
  llmCall(laneId: string, actor: string, model: string, costUSD: number): Promise<void>;
  toolCall(laneId: string, actor: string, toolName: string, result: string): Promise<void>;
  decision(actor: string, decision: string, rationale: string): Promise<void>;
  error(laneId: string | undefined, actor: string, message: string): Promise<void>;
}

export const AuditLog = function(
  this: IAuditLog,
  projectRoot: string,
  runId: string,
  auditDir?: string,
) {
  const dir       = auditDir ?? path.join(projectRoot, '.agents', 'audit');
  this._filePath  = path.join(dir, `${runId}.ndjson`);
  this._runId     = runId;
  this._lastHash  = GENESIS_HASH;
  this._seq       = 0;
  this._fh        = undefined;
} as unknown as IAuditLog;

Object.assign(AuditLog.prototype, {
  open,
  close,
  write,
  runStart,
  runEnd,
  laneStart,
  laneEnd,
  checkpoint,
  llmCall,
  toolCall,
  decision,
  error,
});

// Static methods
(AuditLog as Record<string, unknown>).read = async function(
  projectRoot: string,
  runId: string,
): Promise<AuditEntry[]> {
  const filePath = path.join(projectRoot, '.agents', 'audit', `${runId}.ndjson`);
  const raw = await fs.readFile(filePath, 'utf-8').catch(() => '');
  return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l) as AuditEntry);
};

(AuditLog as Record<string, unknown>).listRuns = async function(
  projectRoot: string,
): Promise<string[]> {
  const dir     = path.join(projectRoot, '.agents', 'audit');
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  return entries.filter((f) => f.endsWith('.ndjson')).map((f) => f.slice(0, -6));
};

(AuditLog as Record<string, unknown>).verify = async function(
  projectRoot: string,
  runId: string,
): Promise<AuditVerificationReport> {
  const entries = await (AuditLog as unknown as { read: (p: string, r: string) => Promise<AuditEntry[]> }).read(projectRoot, runId);
  const broken: AuditVerificationReport['brokenLinks'] = [];
  let expectedPrev = GENESIS_HASH;
  let expectedSeq  = 0;

  for (const entry of entries) {
    if (entry.seq !== expectedSeq) {
      broken.push({ seq: entry.seq, reason: `seq gap: expected ${expectedSeq} got ${entry.seq}` });
    }
    if (entry.prevHash !== expectedPrev) {
      broken.push({ seq: entry.seq, reason: `prevHash mismatch` });
    }
    const { hash: _, ...hashable } = entry;
    const canonical = JSON.stringify(hashable, Object.keys(hashable).sort());
    const expected  = sha256(entry.prevHash + canonical);
    if (entry.hash !== expected) {
      broken.push({ seq: entry.seq, reason: `hash mismatch: entry may have been tampered` });
    }
    expectedPrev = entry.hash;
    expectedSeq  = entry.seq + 1;
  }

  return {
    runId,
    totalEntries: entries.length,
    valid:        broken.length === 0,
    brokenLinks:  broken,
  };
};
