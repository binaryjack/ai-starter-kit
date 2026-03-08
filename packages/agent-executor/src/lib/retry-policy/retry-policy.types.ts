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
  /** Optional predicate — only retry when this returns true for the thrown error. Default: always retry. */
  retryWhen?: (err: unknown) => boolean;
}

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
