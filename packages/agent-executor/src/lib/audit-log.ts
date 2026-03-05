/**
 * AuditLog — append-only, hash-chained NDJSON audit trail.
 *
 * Every event is written as a single JSON line to:
 *   .agents/audit/<runId>.ndjson
 *
 * Each entry carries:
 *   • `seq`      — monotonic sequence number
 *   • `prevHash` — sha256 of the previous entry (genesis entry uses '0'.repeat(64))
 *   • `hash`     — sha256(prevHash + canonicalJSON(entry fields excluding hash))
 *
 * Tamper-evidence: `AuditLog.verify(runId)` recomputes the chain and returns
 * any broken links, making offline forensic audits trivial.
 *
 * Usage:
 *   const log = new AuditLog(projectRoot, runId);
 *   await log.open();
 *   await log.write({ eventType: 'run-start', runId, payload: { lanes: [...] } });
 *   await log.close();
 *
 *   const report = await AuditLog.verify(projectRoot, runId);
 */

import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'

// ─── Event types ──────────────────────────────────────────────────────────────

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
  /** The DAG run identifier */
  runId: string;
  /** Lane identifier (undefined for run-level events) */
  laneId?: string;
  /** Checkpoint identifier */
  checkpointId?: string;
  /** Structured event type */
  eventType: AuditEventType;
  /** Agent name, 'human', 'system', etc. */
  actor?: string;
  /** Event-specific structured payload */
  payload: unknown;
  /** USD cost attributed to this event (llm-call, tool-call) */
  costUSD?: number;
  /** Duration in ms for timed events (lane-end, run-end) */
  durationMs?: number;
  /** ISO-8601 timestamp */
  timestamp: string;
}

/** A persisted audit entry — `AuditEvent` + chain metadata */
export interface AuditEntry extends AuditEvent {
  /** Monotonic sequence number starting at 0 */
  seq: number;
  /** sha256 of the previous entry (all-zeros for the genesis entry) */
  prevHash: string;
  /** sha256(prevHash + canonicalJSON(this entry excluding hash)) */
  hash: string;
}

// ─── Verification report ─────────────────────────────────────────────────────

export interface AuditVerificationReport {
  runId: string;
  totalEntries: number;
  valid: boolean;
  brokenLinks: Array<{ seq: number; reason: string }>;
}

// ─── AuditLog ─────────────────────────────────────────────────────────────────

const GENESIS_HASH = '0'.repeat(64);

export class AuditLog {
  private readonly filePath: string;
  private lastHash: string = GENESIS_HASH;
  private seq     = 0;
  private fh?: import('fs').promises.FileHandle;

  constructor(
    private readonly projectRoot: string,
    private readonly runId: string,
    /** Override the directory where the NDJSON file is written. Defaults to `<projectRoot>/.agents/audit/`. */
    auditDir?: string,
  ) {
    const dir      = auditDir ?? path.join(projectRoot, '.agents', 'audit');
    this.filePath  = path.join(dir, `${runId}.ndjson`);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  /** Open (or resume) the audit log file for appending. */
  async open(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    this.fh = await fs.open(this.filePath, 'a');

    // If the file already has entries, seek to the last line to resume the chain
    const existing = await fs.readFile(this.filePath, 'utf-8').catch(() => '');
    const lines = existing.split('\n').filter(Boolean);
    if (lines.length > 0) {
      try {
        const last = JSON.parse(lines[lines.length - 1]) as AuditEntry;
        this.lastHash = last.hash;
        this.seq      = last.seq + 1;
      } catch {
        // malformed last line — start fresh chain from that point
      }
    }
  }

  /** Flush and close the file handle. */
  async close(): Promise<void> {
    await this.fh?.close();
    this.fh = undefined;
  }

  // ─── Write ────────────────────────────────────────────────────────────────

  /**
   * Append a signed, chained entry to the audit log.
   * Safe to call concurrently — entries are written atomically per line.
   */
  async write(event: AuditEvent): Promise<AuditEntry> {
    const entry: AuditEntry = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
      seq:       this.seq,
      prevHash:  this.lastHash,
      hash:      '',      // computed below
    };

    // Compute hash over all fields except hash itself
    const { hash: _, ...hashable } = entry;
    const canonical = JSON.stringify(hashable, Object.keys(hashable).sort());
    entry.hash = sha256(this.lastHash + canonical);

    // Advance chain
    this.lastHash = entry.hash;
    this.seq++;

    const line = JSON.stringify(entry) + '\n';
    if (this.fh) {
      await this.fh.write(line, undefined, 'utf-8');
    } else {
      // Auto-open on first write if not opened explicitly
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.appendFile(this.filePath, line, 'utf-8');
    }

    return entry;
  }

  // ─── Convenience helpers ──────────────────────────────────────────────────

  async runStart(payload: Record<string, unknown>): Promise<void> {
    await this.write({ runId: this.runId, eventType: 'run-start', payload, timestamp: iso() });
  }

  async runEnd(durationMs: number, payload: Record<string, unknown> = {}): Promise<void> {
    await this.write({ runId: this.runId, eventType: 'run-end', payload, durationMs, timestamp: iso() });
  }

  async laneStart(laneId: string, actor: string): Promise<void> {
    await this.write({ runId: this.runId, laneId, actor, eventType: 'lane-start', payload: {}, timestamp: iso() });
  }

  async laneEnd(laneId: string, actor: string, durationMs: number, status: string): Promise<void> {
    await this.write({ runId: this.runId, laneId, actor, eventType: 'lane-end', payload: { status }, durationMs, timestamp: iso() });
  }

  async checkpoint(laneId: string, checkpointId: string, verdict: string, costUSD?: number): Promise<void> {
    await this.write({ runId: this.runId, laneId, checkpointId, eventType: 'checkpoint', payload: { verdict }, costUSD, timestamp: iso() });
  }

  async llmCall(laneId: string, actor: string, model: string, costUSD: number): Promise<void> {
    await this.write({ runId: this.runId, laneId, actor, eventType: 'llm-call', payload: { model }, costUSD, timestamp: iso() });
  }

  async toolCall(laneId: string, actor: string, toolName: string, result: string): Promise<void> {
    await this.write({ runId: this.runId, laneId, actor, eventType: 'tool-call', payload: { toolName, result: result.slice(0, 200) }, timestamp: iso() });
  }

  async decision(actor: string, decision: string, rationale: string): Promise<void> {
    await this.write({ runId: this.runId, actor, eventType: 'decision', payload: { decision, rationale }, timestamp: iso() });
  }

  async error(laneId: string | undefined, actor: string, message: string): Promise<void> {
    await this.write({ runId: this.runId, laneId, actor, eventType: 'error', payload: { message }, timestamp: iso() });
  }

  // ─── Static: read + verify ─────────────────────────────────────────────────

  /** Load all entries for a run. Returns empty array if the run file doesn't exist. */
  static async read(projectRoot: string, runId: string): Promise<AuditEntry[]> {
    const filePath = path.join(projectRoot, '.agents', 'audit', `${runId}.ndjson`);
    const raw = await fs.readFile(filePath, 'utf-8').catch(() => '');
    return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l) as AuditEntry);
  }

  /** List all run IDs that have an audit file in the project. */
  static async listRuns(projectRoot: string): Promise<string[]> {
    const dir = path.join(projectRoot, '.agents', 'audit');
    const entries = await fs.readdir(dir).catch(() => [] as string[]);
    return entries.filter((f) => f.endsWith('.ndjson')).map((f) => f.slice(0, -6));
  }

  /**
   * Verify the hash chain for a given run.
   * Returns a report listing any broken links (tampered or corrupted lines).
   */
  static async verify(projectRoot: string, runId: string): Promise<AuditVerificationReport> {
    const entries = await AuditLog.read(projectRoot, runId);
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
      // Recompute hash
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
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf-8').digest('hex');
}

function iso(): string {
  return new Date().toISOString();
}
