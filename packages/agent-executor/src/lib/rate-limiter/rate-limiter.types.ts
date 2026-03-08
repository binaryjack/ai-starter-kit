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

export interface PrincipalState {
  runStartTimes: number[];
  concurrentRuns: number;
  tokensByDay: Record<string, number>;
}

export interface PersistedState {
  version: 1;
  updatedAt: string;
  principals: Record<string, PrincipalState>;
}

// Error class — kept as class because it extends Error
export class RateLimitExceededError extends Error {
  constructor(
    public readonly principal: string,
    public readonly limitType: 'tokenBudgetPerDay' | 'maxConcurrentRuns' | 'maxRunsPerHour',
    public readonly current: number,
    public readonly limit: number,
    public readonly retryAfterSeconds: number,
  ) {
    const msg = `Rate limit exceeded for "${principal}": ${limitType} (${current}/${limit}). Retry after ${retryAfterSeconds}s.`;
    super(msg);
    this.name = 'RateLimitExceededError';
  }
}
