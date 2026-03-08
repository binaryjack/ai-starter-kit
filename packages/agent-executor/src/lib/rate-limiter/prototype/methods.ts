import type { IRateLimiter } from '../rate-limiter.js';

export async function acquireRun(this: IRateLimiter, principal: string): Promise<() => void> {
  await this._load();
  const ps = this._getState(principal);
  ps.concurrentRuns += 1;
  ps.runStartTimes.push(Date.now());
  const cutoff = Date.now() - 60 * 60 * 1_000;
  ps.runStartTimes = ps.runStartTimes.filter((t) => t >= cutoff);
  await this._save();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const s = this._getState(principal);
    s.concurrentRuns = Math.max(0, s.concurrentRuns - 1);
    this._save().catch(() => undefined);
  };
}

export async function recordTokens(
  this: IRateLimiter,
  principal: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  await this._load();
  const ps    = this._getState(principal);
  const today = this._utcDate(Date.now());
  ps.tokensByDay[today] = (ps.tokensByDay[today] ?? 0) + inputTokens + outputTokens;
  const keep = new Set(Object.keys(ps.tokensByDay).sort().slice(-8));
  for (const k of Object.keys(ps.tokensByDay)) {
    if (!keep.has(k)) delete ps.tokensByDay[k];
  }
  await this._save();
}

export async function getStatus(
  this: IRateLimiter,
  principal: string,
  config: import('../rate-limiter.types.js').RateLimitConfig,
): Promise<import('../rate-limiter.types.js').RateLimitStatus> {
  await this._load();
  const ps          = this._getState(principal);
  const now         = Date.now();
  const windowStart = now - 60 * 60 * 1_000;
  const runsThisHour     = ps.runStartTimes.filter((t) => t >= windowStart).length;
  const today            = this._utcDate(now);
  const tokensUsedToday  = ps.tokensByDay[today] ?? 0;

  let exceeded = false;
  let reason: string | undefined;

  if (config.maxConcurrentRuns !== undefined && ps.concurrentRuns >= config.maxConcurrentRuns) {
    exceeded = true;
    reason   = `maxConcurrentRuns: ${ps.concurrentRuns}/${config.maxConcurrentRuns}`;
  } else if (config.maxRunsPerHour !== undefined && runsThisHour >= config.maxRunsPerHour) {
    exceeded = true;
    reason   = `maxRunsPerHour: ${runsThisHour}/${config.maxRunsPerHour}`;
  } else if (config.tokenBudgetPerDay !== undefined && tokensUsedToday >= config.tokenBudgetPerDay) {
    exceeded = true;
    reason   = `tokenBudgetPerDay: ${tokensUsedToday}/${config.tokenBudgetPerDay}`;
  }

  return { principal, tokensUsedToday, concurrentRuns: ps.concurrentRuns, runsThisHour, exceeded, reason };
}

export async function reset(this: IRateLimiter, principal: string): Promise<void> {
  await this._load();
  this._state[principal] = this._empty();
  await this._save();
}
