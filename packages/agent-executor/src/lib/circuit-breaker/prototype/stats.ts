import type { ICircuitBreaker } from '../circuit-breaker.js';
import type { CircuitState } from '../circuit-breaker.types.js';

export function stats(this: ICircuitBreaker): {
  state: CircuitState;
  consecutiveFails: number;
  lastFailureTime: number | null;
  recoverAfterMs: number | null;
} {
  return {
    state:            this._state,
    consecutiveFails: this._consecutiveFails,
    lastFailureTime:  this._lastFailureTime || null,
    recoverAfterMs:
      this._state === 'OPEN'
        ? Math.max(0, this._lastFailureTime + this._cooldownMs - Date.now())
        : null,
  };
}
