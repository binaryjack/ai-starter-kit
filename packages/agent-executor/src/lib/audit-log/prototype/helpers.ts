import type { IAuditLog } from '../audit-log.js';
import { iso } from '../audit-log-helpers.js';

export async function runStart(this: IAuditLog, payload: Record<string, unknown>): Promise<void> {
  await this.write({ runId: this._runId, eventType: 'run-start', payload, timestamp: iso() });
}

export async function runEnd(this: IAuditLog, durationMs: number, payload: Record<string, unknown> = {}): Promise<void> {
  await this.write({ runId: this._runId, eventType: 'run-end', payload, durationMs, timestamp: iso() });
}

export async function laneStart(this: IAuditLog, laneId: string, actor: string): Promise<void> {
  await this.write({ runId: this._runId, laneId, actor, eventType: 'lane-start', payload: {}, timestamp: iso() });
}

export async function laneEnd(this: IAuditLog, laneId: string, actor: string, durationMs: number, status: string): Promise<void> {
  await this.write({ runId: this._runId, laneId, actor, eventType: 'lane-end', payload: { status }, durationMs, timestamp: iso() });
}

export async function checkpoint(this: IAuditLog, laneId: string, checkpointId: string, verdict: string, costUSD?: number): Promise<void> {
  await this.write({ runId: this._runId, laneId, checkpointId, eventType: 'checkpoint', payload: { verdict }, costUSD, timestamp: iso() });
}

export async function llmCall(this: IAuditLog, laneId: string, actor: string, model: string, costUSD: number): Promise<void> {
  await this.write({ runId: this._runId, laneId, actor, eventType: 'llm-call', payload: { model }, costUSD, timestamp: iso() });
}

export async function toolCall(this: IAuditLog, laneId: string, actor: string, toolName: string, result: string): Promise<void> {
  await this.write({ runId: this._runId, laneId, actor, eventType: 'tool-call', payload: { toolName, result: result.slice(0, 200) }, timestamp: iso() });
}

export async function decision(this: IAuditLog, actor: string, decision: string, rationale: string): Promise<void> {
  await this.write({ runId: this._runId, actor, eventType: 'decision', payload: { decision, rationale }, timestamp: iso() });
}

export async function error(this: IAuditLog, laneId: string | undefined, actor: string, message: string): Promise<void> {
  await this.write({ runId: this._runId, laneId, actor, eventType: 'error', payload: { message }, timestamp: iso() });
}
