/**
 * RetryPolicy — exponential back-off with optional jitter.
 *
 * Used by LaneExecutor (supervisor RETRY) and LLM providers (rate-limit 429/503).
 *
 * Usage:
 *   const policy = RetryPolicy.default();
 *   await policy.execute(() => modelRouter.route(taskType, prompt));
 */

// ─── Config ───────────────────────────────────────────────────────────────────

export interface RetryPolicyOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts: number;
  /** Delay before the first retry in milliseconds. Default: 500 */
  initialDelayMs: number;
  /** Multiplier applied after each failed attempt. Default: 2 */
  multiplier: number;
  /** Upper ceiling for delay regardless of multiplier. Default: 30_000 */
  maxDelayMs: number;
  /** Add ±25% random jitter to avoid thundering-herd on shared rate limits. Default: true */
  jitter: boolean;
  /**
   * Optional predicate — only retry when this returns true for the thrown error.
   * Default: always retry.
   */
  retryWhen?: (err: unknown) => boolean;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULTS: RetryPolicyOptions = {
  maxAttempts:    3,
  initialDelayMs: 500,
  multiplier:     2,
  maxDelayMs:     30_000,
  jitter:         true,
};

/** Retry only on status codes that indicate transient server/rate-limit errors. */
export function isTransientError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('rate limit') ||
    msg.includes('overloaded') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('fetch failed')
  );
}

// ─── RetryPolicy ─────────────────────────────────────────────────────────────

export class RetryPolicy {
  private readonly opts: RetryPolicyOptions;

  constructor(opts?: Partial<RetryPolicyOptions>) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  /** Convenience: default policy (3 attempts, 500 ms initial, x2, 30 s cap, jitter) */
  static default(): RetryPolicy {
    return new RetryPolicy();
  }

  /** Aggressively retry rate-limit errors only (useful for LLM API calls) */
  static forLLM(): RetryPolicy {
    return new RetryPolicy({
      maxAttempts:    4,
      initialDelayMs: 1_000,
      multiplier:     2,
      maxDelayMs:     32_000,
      jitter:         true,
      retryWhen:      isTransientError,
    });
  }

  /** No retries — use as a pass-through in test environments */
  static none(): RetryPolicy {
    return new RetryPolicy({ maxAttempts: 1 });
  }

  // ─── Execution ─────────────────────────────────────────────────────────────

  /**
   * Execute `fn` with automatic retry on failure.
   *
   * @param fn       The async operation to retry
   * @param context  Optional label for log messages (e.g. 'anthropic:code-generation')
   * @param log      Optional logging sink for retry diagnostics
   */
  async execute<T>(
    fn: () => Promise<T>,
    context?: string,
    log?: (msg: string) => void,
  ): Promise<T> {
    let lastErr: unknown;
    let delayMs = this.opts.initialDelayMs;

    for (let attempt = 1; attempt <= this.opts.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;

        // Check if we should retry at all
        if (this.opts.retryWhen && !this.opts.retryWhen(err)) {
          break;
        }

        if (attempt === this.opts.maxAttempts) break;

        // Calculate delay with optional jitter
        const jitterMs = this.opts.jitter
          ? (Math.random() * 0.5 - 0.25) * delayMs  // ±25%
          : 0;
        const waitMs = Math.min(Math.max(0, delayMs + jitterMs), this.opts.maxDelayMs);

        log?.(
          `   ⏳ ${context ?? 'Attempt'} failed (attempt ${attempt}/${this.opts.maxAttempts}), ` +
          `retrying in ${Math.round(waitMs)}ms: ${String(err).slice(0, 120)}`,
        );

        await this.sleep(waitMs);
        delayMs = Math.min(delayMs * this.opts.multiplier, this.opts.maxDelayMs);
      }
    }

    throw lastErr;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
