import * as fs from 'fs/promises';
import * as path from 'path';
import type { IRateLimiter } from '../rate-limiter.js';
import type { PrincipalState, PersistedState } from '../rate-limiter.types.js';

export function _getState(this: IRateLimiter, principal: string): PrincipalState {
  if (!this._state[principal]) {
    this._state[principal] = this._empty();
  }
  return this._state[principal]!;
}

export function _empty(): PrincipalState {
  return { runStartTimes: [], concurrentRuns: 0, tokensByDay: {} };
}

export async function _load(this: IRateLimiter): Promise<void> {
  if (this._loaded) return;
  this._loaded = true;
  try {
    const raw    = await fs.readFile(this._statePath, 'utf-8');
    const parsed = JSON.parse(raw) as PersistedState;
    this._state  = parsed.principals ?? {};
  } catch {
    this._state = {};
  }
}

export async function _save(this: IRateLimiter): Promise<void> {
  const data: PersistedState = {
    version:    1,
    updatedAt:  new Date().toISOString(),
    principals: this._state,
  };
  await fs.mkdir(path.dirname(this._statePath), { recursive: true });
  await fs.writeFile(this._statePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function _utcDate(this: IRateLimiter, ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function _nextMidnightMs(this: IRateLimiter, ms: number): number {
  const d = new Date(ms);
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}
