import type { IRetryPolicy } from '../retry-policy.js';

export async function execute<T>(
  this: IRetryPolicy,
  fn: () => Promise<T>,
  context?: string,
  log?: (msg: string) => void,
): Promise<T> {
  let lastErr: unknown;
  let delayMs = this._opts.initialDelayMs;

  for (let attempt = 1; attempt <= this._opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      if (this._opts.retryWhen && !this._opts.retryWhen(err)) break;
      if (attempt === this._opts.maxAttempts) break;

      const jitterMs = this._opts.jitter
        ? (Math.random() * 0.5 - 0.25) * delayMs
        : 0;
      const waitMs = Math.min(Math.max(0, delayMs + jitterMs), this._opts.maxDelayMs);

      log?.(
        `   ⏳ ${context ?? 'Attempt'} failed (attempt ${attempt}/${this._opts.maxAttempts}), ` +
        `retrying in ${Math.round(waitMs)}ms: ${String(err).slice(0, 120)}`,
      );

      await this._sleep(waitMs);
      delayMs = Math.min(delayMs * this._opts.multiplier, this._opts.maxDelayMs);
    }
  }

  throw lastErr;
}

export function _sleep(this: IRetryPolicy, ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
