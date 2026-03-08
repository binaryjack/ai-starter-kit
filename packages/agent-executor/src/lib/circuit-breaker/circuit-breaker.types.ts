export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Human-readable provider name (used in error messages). */
  name: string;
  /** Consecutive failures before the circuit opens. Default: 5 */
  failureThreshold?: number;
  /** Milliseconds to wait before probing again. Default: 60_000 */
  cooldownMs?: number;
}

// Error class — kept as class because it extends Error
export class CircuitBreakerOpenError extends Error {
  readonly providerName: string;
  readonly recoverAfter: Date;

  constructor(name: string, recoverAfter: Date) {
    super(
      `[CircuitBreaker] Provider "${name}" is OPEN — fast-failing. Will retry after ${recoverAfter.toISOString()}.`,
    );
    this.name         = 'CircuitBreakerOpenError';
    this.providerName = name;
    this.recoverAfter = recoverAfter;
  }
}
