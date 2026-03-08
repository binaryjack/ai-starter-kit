import type { ICircuitBreaker } from '../circuit-breaker.js';
import { CircuitBreakerOpenError } from '../circuit-breaker.types.js';

export function execute<T>(this: ICircuitBreaker, fn: () => Promise<T>): Promise<T> {
  this._maybeTransitionToHalfOpen();

  if (this._state === 'OPEN') {
    const recoverAfter = new Date(this._lastFailureTime + this._cooldownMs);
    throw new CircuitBreakerOpenError(this._providerName, recoverAfter);
  }

  return fn().then(
    (result) => { this._onSuccess(); return result; },
    (err) => { this._onFailure(); throw err; },
  );
}
