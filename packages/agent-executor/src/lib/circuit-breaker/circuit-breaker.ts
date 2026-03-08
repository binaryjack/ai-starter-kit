import type { CircuitBreakerOptions, CircuitState } from './circuit-breaker.types.js';
import {
    _maybeTransitionToHalfOpen,
    _onFailure,
    _onSuccess,
    currentState,
    execute,
    name,
    stats,
} from './prototype/index.js';

export interface ICircuitBreaker {
  new(options: CircuitBreakerOptions): ICircuitBreaker;
  // Private state (prefixed _)
  _providerName:     string;
  _failureThreshold: number;
  _cooldownMs:       number;
  _state:            CircuitState;
  _consecutiveFails: number;
  _lastFailureTime:  number;
  // Public API
  currentState(): CircuitState;
  name(): string;
  execute<T>(fn: () => Promise<T>): Promise<T>;
  stats(): {
    state: CircuitState;
    consecutiveFails: number;
    lastFailureTime: number | null;
    recoverAfterMs: number | null;
  };
  // Private helpers
  _onSuccess(): void;
  _onFailure(): void;
  _maybeTransitionToHalfOpen(): void;
}

export const CircuitBreaker = function(
  this: ICircuitBreaker,
  options: CircuitBreakerOptions,
) {
  this._providerName     = options.name;
  this._failureThreshold = options.failureThreshold ?? 5;
  this._cooldownMs       = options.cooldownMs       ?? 60_000;
  this._state            = 'CLOSED';
  this._consecutiveFails = 0;
  this._lastFailureTime  = 0;
} as unknown as ICircuitBreaker;

Object.assign(CircuitBreaker.prototype, {
  currentState,
  name,
  execute,
  stats,
  _onSuccess,
  _onFailure,
  _maybeTransitionToHalfOpen,
});
