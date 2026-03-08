import * as path from 'path';
import {
    _empty,
    _getState,
    _load,
    _nextMidnightMs,
    _save,
    _utcDate,
    acquireRun,
    assertWithinLimits,
    getStatus,
    recordTokens,
    reset,
} from './prototype/index.js';
import type { PrincipalState, RateLimitConfig, RateLimitStatus } from './rate-limiter.types.js';

export interface IRateLimiter {
  new(projectRoot: string): IRateLimiter;
  // Private state
  _statePath: string;
  _state: Record<string, PrincipalState>;
  _loaded: boolean;
  // Public API
  assertWithinLimits(principal: string, config: RateLimitConfig): Promise<void>;
  acquireRun(principal: string): Promise<() => void>;
  recordTokens(principal: string, inputTokens: number, outputTokens: number): Promise<void>;
  getStatus(principal: string, config?: RateLimitConfig): Promise<RateLimitStatus>;
  reset(principal: string): Promise<void>;
  // Private helpers
  _getState(principal: string): PrincipalState;
  _empty(): PrincipalState;
  _load(): Promise<void>;
  _save(): Promise<void>;
  _utcDate(ms: number): string;
  _nextMidnightMs(ms: number): number;
}

export const RateLimiter = function(this: IRateLimiter, projectRoot: string) {
  this._statePath = path.join(projectRoot, '.agents', 'rate-limits.json');
  this._state     = {};
  this._loaded    = false;
} as unknown as IRateLimiter;

Object.assign(RateLimiter.prototype, {
  assertWithinLimits,
  acquireRun,
  recordTokens,
  getStatus,
  reset,
  _getState,
  _empty,
  _load,
  _save,
  _utcDate,
  _nextMidnightMs,
});
