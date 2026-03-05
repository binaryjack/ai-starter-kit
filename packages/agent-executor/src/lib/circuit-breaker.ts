/**
 * CircuitBreaker — prevents cascading failures when an LLM provider is down.
 *
 * States:
 *   CLOSED    — normal operation; calls pass through
 *   OPEN      — provider is failing; calls rejected immediately (fast-fail)
 *   HALF_OPEN — cooling-down probe; one call allowed through to test recovery
 *
 * Transition rules:
 *   CLOSED → OPEN      after `failureThreshold` consecutive failures
 *   OPEN   → HALF_OPEN after `cooldownMs` has elapsed since the last failure
 *   HALF_OPEN → CLOSED if the probe call succeeds
 *   HALF_OPEN → OPEN   if the probe call fails (reset cooldown timer)
 *
 * Usage:
 *   const breaker = new CircuitBreaker({ name: 'anthropic' });
 *   const result  = await breaker.execute(() => provider.complete(prompt, model));
 *
 * ModelRouter creates one breaker per registered provider.
 *
 * Enterprise note: CircuitBreakerOpenError carries the provider name and
 * the earliest time the circuit will attempt to recover so callers can
 * promote work to an alternative provider.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Human-readable provider name (used in error messages). */
  name: string;
  /** Consecutive failures before the circuit opens. Default: 5 */
  failureThreshold?: number;
  /** Milliseconds to wait before probing again. Default: 60_000 */
  cooldownMs?: number;
}

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

// ─── CircuitBreaker ──────────────────────────────────────────────────────────

export class CircuitBreaker {
  private readonly providerName:    string;
  private readonly failureThreshold: number;
  private readonly cooldownMs:       number;

  private state:            CircuitState = 'CLOSED';
  private consecutiveFails: number       = 0;
  private lastFailureTime:  number       = 0;

  constructor(options: CircuitBreakerOptions) {
    this.providerName     = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.cooldownMs       = options.cooldownMs       ?? 60_000;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  get currentState(): CircuitState {
    this.maybeTransitionToHalfOpen();
    return this.state;
  }

  get name(): string { return this.providerName; }

  /**
   * Execute `fn` through the circuit.
   * Throws `CircuitBreakerOpenError` when the circuit is OPEN.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeTransitionToHalfOpen();

    if (this.state === 'OPEN') {
      const recoverAfter = new Date(this.lastFailureTime + this.cooldownMs);
      throw new CircuitBreakerOpenError(this.providerName, recoverAfter);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /** Expose current stats for observability/dashboard use. */
  stats(): {
    state: CircuitState;
    consecutiveFails: number;
    lastFailureTime: number | null;
    recoverAfterMs: number | null;
  } {
    return {
      state:            this.state,
      consecutiveFails: this.consecutiveFails,
      lastFailureTime:  this.lastFailureTime || null,
      recoverAfterMs:
        this.state === 'OPEN'
          ? Math.max(0, this.lastFailureTime + this.cooldownMs - Date.now())
          : null,
    };
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private onSuccess(): void {
    this.consecutiveFails = 0;
    this.state            = 'CLOSED';
  }

  private onFailure(): void {
    this.consecutiveFails++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN' || this.consecutiveFails >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  private maybeTransitionToHalfOpen(): void {
    if (
      this.state === 'OPEN' &&
      Date.now() - this.lastFailureTime >= this.cooldownMs
    ) {
      this.state = 'HALF_OPEN';
    }
  }
}
