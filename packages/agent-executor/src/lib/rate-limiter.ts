/**
 * E6 — Rate Limiting per Principal
 *
 * Enforces per-principal DAG execution limits to prevent runaway CI scripts
 * or misconfigured agents from exhausting the organisation's LLM budget.
 *
 * Three complementary limit axes:
 *   1. tokenBudgetPerDay    — cumulative input+output tokens per calendar day
 *   2. maxConcurrentRuns    — simultaneous DAG runs from this principal
 *   3. maxRunsPerHour       — sliding 60-minute window on run starts
 *
 * Configuration in `.agents/rbac.json` (extends RbacPrincipalDefinition):
 * ```json
 * {
 *   "principals": {
 *     "ci-bot": {
 *       "role": "developer",
 *       "rateLimits": {
 *         "tokenBudgetPerDay": 500000,
 *         "maxConcurrentRuns": 3,
 *         "maxRunsPerHour": 10
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * State is in-memory with optional JSON persistence to `.agents/rate-limits.json`.
 * The state file is loaded on first use and written on every mutation — suitable
 * for single-process deployments.  For multi-process, use a shared external store.
 *
 * Usage:
 *   const limiter = new RateLimiter(projectRoot);
 *   await limiter.assertWithinLimits('ci-bot', { maxRunsPerHour: 10, maxConcurrentRuns: 3 });
 *   const release = await limiter.acquireRun('ci-bot');
 *   // … execute DAG …
 *   await limiter.releaseRun('ci-bot', response.usage);
 *   release();
 */

import * as fs from 'fs/promises'
import * as path from 'path'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Maximum total tokens (inputTokens + outputTokens) consumed in a calendar day (UTC) */
  tokenBudgetPerDay?: number;
  /** Maximum number of simultaneously running DAG runs for this principal */
  maxConcurrentRuns?: number;
  /** Maximum DAG run starts within any rolling 60-minute window */
  maxRunsPerHour?: number;
}

export interface RateLimitStatus {
  principal: string;
  /** Tokens used since UTC midnight today */
  tokensUsedToday: number;
  /** Currently running DAG count */
  concurrentRuns: number;
  /** Run starts in the last 60 minutes */
  runsThisHour: number;
  /** Whether any limit is currently exceeded */
  exceeded: boolean;
  /** Human-readable reason, present when `exceeded` is true */
  reason?: string;
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class RateLimitExceededError extends Error {
  constructor(
    public readonly principal: string,
    public readonly limitType: 'tokenBudgetPerDay' | 'maxConcurrentRuns' | 'maxRunsPerHour',
    public readonly current: number,
    public readonly limit: number,
    /** Seconds until the limit resets (for Retry-After headers) */
    public readonly retryAfterSeconds: number,
  ) {
    const msg = `Rate limit exceeded for "${principal}": ${limitType} (${current}/${limit}). Retry after ${retryAfterSeconds}s.`;
    super(msg);
    this.name = 'RateLimitExceededError';
  }
}

// ─── Internal state ───────────────────────────────────────────────────────────

interface PrincipalState {
  /** Timestamps (ms) of run starts within the sliding window */
  runStartTimes: number[];
  /** How many runs are currently in-flight */
  concurrentRuns: number;
  /** Token usage keyed by UTC date string "YYYY-MM-DD" */
  tokensByDay: Record<string, number>;
}

interface PersistedState {
  version: 1;
  updatedAt: string;
  principals: Record<string, PrincipalState>;
}

// ─── RateLimiter ─────────────────────────────────────────────────────────────

export class RateLimiter {
  private readonly statePath: string;
  private state: Record<string, PrincipalState> = {};
  private loaded = false;

  constructor(projectRoot: string) {
    this.statePath = path.join(projectRoot, '.agents', 'rate-limits.json');
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Assert that `principal` is within all configured rate limits.
   * Throws `RateLimitExceededError` on the first violated limit.
   * Call this BEFORE starting a DAG run.
   */
  async assertWithinLimits(
    principal: string,
    config: RateLimitConfig,
  ): Promise<void> {
    await this._load();
    const ps = this._state(principal);
    const now = Date.now();

    // 1. Concurrent run check
    if (config.maxConcurrentRuns !== undefined && ps.concurrentRuns >= config.maxConcurrentRuns) {
      const retryAfterSeconds = 30; // poll again in 30 s
      throw new RateLimitExceededError(
        principal,
        'maxConcurrentRuns',
        ps.concurrentRuns,
        config.maxConcurrentRuns,
        retryAfterSeconds,
      );
    }

    // 2. Hourly run count (sliding 60-minute window)
    if (config.maxRunsPerHour !== undefined) {
      const windowStart = now - 60 * 60 * 1_000;
      const recent = ps.runStartTimes.filter((t) => t >= windowStart);
      if (recent.length >= config.maxRunsPerHour) {
        const oldest = Math.min(...recent);
        const retryAfterSeconds = Math.ceil((oldest + 60 * 60 * 1_000 - now) / 1_000);
        throw new RateLimitExceededError(
          principal,
          'maxRunsPerHour',
          recent.length,
          config.maxRunsPerHour,
          retryAfterSeconds,
        );
      }
    }

    // 3. Daily token budget
    if (config.tokenBudgetPerDay !== undefined) {
      const today = this._utcDate(now);
      const used = ps.tokensByDay[today] ?? 0;
      if (used >= config.tokenBudgetPerDay) {
        const midnight = this._nextMidnightMs(now);
        const retryAfterSeconds = Math.ceil((midnight - now) / 1_000);
        throw new RateLimitExceededError(
          principal,
          'tokenBudgetPerDay',
          used,
          config.tokenBudgetPerDay,
          retryAfterSeconds,
        );
      }
    }
  }

  /**
   * Record the start of a new run for `principal`.
   * Returns a release function — call it when the run ends.
   *
   * @example
   * const release = await limiter.acquireRun('ci-bot');
   * try {
   *   await orchestrator.execute(dag, opts);
   * } finally {
   *   release();
   * }
   */
  async acquireRun(principal: string): Promise<() => void> {
    await this._load();
    const ps = this._state(principal);
    ps.concurrentRuns += 1;
    ps.runStartTimes.push(Date.now());
    // Trim stale entries older than 1 hour
    const cutoff = Date.now() - 60 * 60 * 1_000;
    ps.runStartTimes = ps.runStartTimes.filter((t) => t >= cutoff);
    await this._save();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const s = this._state(principal);
      s.concurrentRuns = Math.max(0, s.concurrentRuns - 1);
      this._save().catch(() => undefined);
    };
  }

  /**
   * Add consumed tokens to the day's accounting for `principal`.
   * Call this after each successful LLM response.
   */
  async recordTokens(
    principal: string,
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    await this._load();
    const ps = this._state(principal);
    const today = this._utcDate(Date.now());
    ps.tokensByDay[today] = (ps.tokensByDay[today] ?? 0) + inputTokens + outputTokens;
    // Prune days older than 8 to keep file small
    const keep = new Set(
      Object.keys(ps.tokensByDay)
        .sort()
        .slice(-8),
    );
    for (const k of Object.keys(ps.tokensByDay)) {
      if (!keep.has(k)) delete ps.tokensByDay[k];
    }
    await this._save();
  }

  /**
   * Return current rate limit status for a principal (read-only).
   */
  async getStatus(
    principal: string,
    config: RateLimitConfig = {},
  ): Promise<RateLimitStatus> {
    await this._load();
    const ps = this._state(principal);
    const now = Date.now();
    const windowStart = now - 60 * 60 * 1_000;
    const runsThisHour = ps.runStartTimes.filter((t) => t >= windowStart).length;
    const today = this._utcDate(now);
    const tokensUsedToday = ps.tokensByDay[today] ?? 0;

    let exceeded = false;
    let reason: string | undefined;

    if (config.maxConcurrentRuns !== undefined && ps.concurrentRuns >= config.maxConcurrentRuns) {
      exceeded = true;
      reason = `maxConcurrentRuns: ${ps.concurrentRuns}/${config.maxConcurrentRuns}`;
    } else if (config.maxRunsPerHour !== undefined && runsThisHour >= config.maxRunsPerHour) {
      exceeded = true;
      reason = `maxRunsPerHour: ${runsThisHour}/${config.maxRunsPerHour}`;
    } else if (config.tokenBudgetPerDay !== undefined && tokensUsedToday >= config.tokenBudgetPerDay) {
      exceeded = true;
      reason = `tokenBudgetPerDay: ${tokensUsedToday}/${config.tokenBudgetPerDay}`;
    }

    return {
      principal,
      tokensUsedToday,
      concurrentRuns: ps.concurrentRuns,
      runsThisHour,
      exceeded,
      reason,
    };
  }

  /** Reset all state for a principal (e.g. after a test or manual override). */
  async reset(principal: string): Promise<void> {
    await this._load();
    this.state[principal] = this._empty();
    await this._save();
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private _state(principal: string): PrincipalState {
    if (!this.state[principal]) {
      this.state[principal] = this._empty();
    }
    return this.state[principal]!;
  }

  private _empty(): PrincipalState {
    return { runStartTimes: [], concurrentRuns: 0, tokensByDay: {} };
  }

  private async _load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await fs.readFile(this.statePath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedState;
      this.state = parsed.principals ?? {};
    } catch {
      this.state = {};
    }
  }

  private async _save(): Promise<void> {
    const data: PersistedState = {
      version: 1,
      updatedAt: new Date().toISOString(),
      principals: this.state,
    };
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    await fs.writeFile(this.statePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private _utcDate(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10); // "YYYY-MM-DD"
  }

  private _nextMidnightMs(ms: number): number {
    const d = new Date(ms);
    d.setUTCHours(24, 0, 0, 0);
    return d.getTime();
  }
}
