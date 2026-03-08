import type { IRateLimiter } from '../rate-limiter.js';
import type { RateLimitConfig } from '../rate-limiter.types.js';
import { RateLimitExceededError } from '../rate-limiter.types.js';

export async function assertWithinLimits(
  this: IRateLimiter,
  principal: string,
  config: RateLimitConfig,
): Promise<void> {
  await this._load();
  const ps  = this._getState(principal);
  const now = Date.now();

  if (config.maxConcurrentRuns !== undefined && ps.concurrentRuns >= config.maxConcurrentRuns) {
    throw new RateLimitExceededError(principal, 'maxConcurrentRuns', ps.concurrentRuns, config.maxConcurrentRuns, 30);
  }

  if (config.maxRunsPerHour !== undefined) {
    const windowStart = now - 60 * 60 * 1_000;
    const recent = ps.runStartTimes.filter((t) => t >= windowStart);
    if (recent.length >= config.maxRunsPerHour) {
      const oldest = Math.min(...recent);
      const retryAfterSeconds = Math.ceil((oldest + 60 * 60 * 1_000 - now) / 1_000);
      throw new RateLimitExceededError(principal, 'maxRunsPerHour', recent.length, config.maxRunsPerHour, retryAfterSeconds);
    }
  }

  if (config.tokenBudgetPerDay !== undefined) {
    const today = this._utcDate(now);
    const used  = ps.tokensByDay[today] ?? 0;
    if (used >= config.tokenBudgetPerDay) {
      const midnight = this._nextMidnightMs(now);
      const retryAfterSeconds = Math.ceil((midnight - now) / 1_000);
      throw new RateLimitExceededError(principal, 'tokenBudgetPerDay', used, config.tokenBudgetPerDay, retryAfterSeconds);
    }
  }
}
