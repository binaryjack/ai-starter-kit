import type { ICircuitBreaker } from '../circuit-breaker.js';

export function currentState(this: ICircuitBreaker) {
  this._maybeTransitionToHalfOpen();
  return this._state;
}

export function name(this: ICircuitBreaker): string {
  return this._providerName;
}

export function _onSuccess(this: ICircuitBreaker): void {
  this._consecutiveFails = 0;
  this._state            = 'CLOSED';
}

export function _onFailure(this: ICircuitBreaker): void {
  this._consecutiveFails++;
  this._lastFailureTime = Date.now();

  if (this._state === 'HALF_OPEN' || this._consecutiveFails >= this._failureThreshold) {
    this._state = 'OPEN';
  }
}

export function _maybeTransitionToHalfOpen(this: ICircuitBreaker): void {
  if (
    this._state === 'OPEN' &&
    Date.now() - this._lastFailureTime >= this._cooldownMs
  ) {
    this._state = 'HALF_OPEN';
  }
}
