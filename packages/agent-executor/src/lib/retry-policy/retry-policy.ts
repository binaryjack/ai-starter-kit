import { _sleep, execute } from './prototype/index.js';
import type { RetryPolicyOptions } from './retry-policy.types.js';
import { isTransientError } from './retry-policy.types.js';

const DEFAULTS: RetryPolicyOptions = {
  maxAttempts:    3,
  initialDelayMs: 500,
  multiplier:     2,
  maxDelayMs:     30_000,
  jitter:         true,
};

export interface IRetryPolicy {
  new(opts?: Partial<RetryPolicyOptions>): IRetryPolicy;
  // Private state
  _opts: RetryPolicyOptions;
  // Public API
  execute<T>(fn: () => Promise<T>, context?: string, log?: (msg: string) => void): Promise<T>;
  // Private helpers
  _sleep(ms: number): Promise<void>;
}

export const RetryPolicy = function(this: IRetryPolicy, opts?: Partial<RetryPolicyOptions>) {
  this._opts = { ...DEFAULTS, ...opts };
} as unknown as IRetryPolicy;

Object.assign(RetryPolicy.prototype, { execute, _sleep });

// Static factory methods
(RetryPolicy as Record<string, unknown>).default = function(): IRetryPolicy {
  return new RetryPolicy();
};

(RetryPolicy as Record<string, unknown>).forLLM = function(): IRetryPolicy {
  return new RetryPolicy({
    maxAttempts:    4,
    initialDelayMs: 1_000,
    multiplier:     2,
    maxDelayMs:     32_000,
    jitter:         true,
    retryWhen:      isTransientError,
  });
};

(RetryPolicy as Record<string, unknown>).none = function(): IRetryPolicy {
  return new RetryPolicy({ maxAttempts: 1 });
};
