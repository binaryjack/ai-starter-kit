import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs/promises'
import { RateLimiter, RateLimitExceededError } from '../lib/rate-limiter'

// ─── helpers ─────────────────────────────────────────────────────────────────

async function makeTmp(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rl-test-'))
  return dir
}

// ─── RateLimiter ─────────────────────────────────────────────────────────────

describe('RateLimiter', () => {
  let tmpDir: string
  let limiter: RateLimiter

  beforeEach(async () => {
    tmpDir = await makeTmp()
    limiter = new RateLimiter(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  // ─── assertWithinLimits ──────────────────────────────────────────────────

  it('allows usage under all limits', async () => {
    await expect(
      limiter.assertWithinLimits('alice', {
        maxConcurrentRuns: 5,
        maxRunsPerHour: 10,
        tokenBudgetPerDay: 100_000,
      }),
    ).resolves.toBeUndefined()
  })

  it('throws RateLimitExceededError on maxConcurrentRuns', async () => {
    // Acquire two runs without releasing them
    await limiter.acquireRun('bob')
    await limiter.acquireRun('bob')
    await expect(
      limiter.assertWithinLimits('bob', { maxConcurrentRuns: 2 }),
    ).rejects.toBeInstanceOf(RateLimitExceededError)
  })

  it('exposes limitType on concurrent run error', async () => {
    await limiter.acquireRun('carol')
    try {
      await limiter.assertWithinLimits('carol', { maxConcurrentRuns: 1 })
      fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitExceededError)
      expect((err as RateLimitExceededError).limitType).toBe('maxConcurrentRuns')
      expect((err as RateLimitExceededError).principal).toBe('carol')
    }
  })

  it('throws on maxRunsPerHour after enough runs', async () => {
    const limit = 3
    for (let i = 0; i < limit; i++) {
      await limiter.acquireRun('dave')
    }
    await expect(
      limiter.assertWithinLimits('dave', { maxRunsPerHour: limit }),
    ).rejects.toBeInstanceOf(RateLimitExceededError)
  })

  it('throws on tokenBudgetPerDay after enough tokens', async () => {
    await limiter.recordTokens('eve', 60_000, 40_000) // 100k total
    await expect(
      limiter.assertWithinLimits('eve', { tokenBudgetPerDay: 100_000 }),
    ).rejects.toBeInstanceOf(RateLimitExceededError)
  })

  // ─── acquireRun / release ────────────────────────────────────────────────

  it('decrements concurrentRuns on release', async () => {
    const release = await limiter.acquireRun('frank')
    let status = await limiter.getStatus('frank', { maxConcurrentRuns: 5 })
    expect(status.concurrentRuns).toBe(1)

    release()
    status = await limiter.getStatus('frank', { maxConcurrentRuns: 5 })
    expect(status.concurrentRuns).toBe(0)
  })

  it('release is idempotent', async () => {
    const release = await limiter.acquireRun('grace')
    release()
    release() // second call should be a no-op
    const status = await limiter.getStatus('grace')
    expect(status.concurrentRuns).toBe(0)
  })

  // ─── recordTokens ────────────────────────────────────────────────────────

  it('accumulates token usage across calls', async () => {
    await limiter.recordTokens('heidi', 1_000, 500) // 1500
    await limiter.recordTokens('heidi', 2_000, 1_000) // 3000
    const status = await limiter.getStatus('heidi', { tokenBudgetPerDay: 1_000_000 })
    expect(status.tokensUsedToday).toBe(4_500)
  })

  // ─── getStatus ───────────────────────────────────────────────────────────

  it('reports exceeded=false when within limits', async () => {
    const status = await limiter.getStatus('ivan', {
      maxConcurrentRuns: 10,
      maxRunsPerHour: 20,
      tokenBudgetPerDay: 1_000_000,
    })
    expect(status.exceeded).toBe(false)
    expect(status.reason).toBeUndefined()
  })

  it('reports exceeded=true with reason for overuse', async () => {
    await limiter.acquireRun('judy')
    const status = await limiter.getStatus('judy', { maxConcurrentRuns: 1 })
    expect(status.exceeded).toBe(true)
    expect(status.reason).toMatch(/maxConcurrentRuns/)
  })

  // ─── persistence ────────────────────────────────────────────────────────

  it('persists state to disk and reloads', async () => {
    await limiter.recordTokens('kyle', 5_000, 2_500)
    // Create a new limiter instance pointing at the same dir
    const limiter2 = new RateLimiter(tmpDir)
    const status = await limiter2.getStatus('kyle')
    expect(status.tokensUsedToday).toBe(7_500)
  })

  // ─── reset ───────────────────────────────────────────────────────────────

  it('reset clears all state for a principal', async () => {
    await limiter.acquireRun('lily')
    await limiter.recordTokens('lily', 99_000, 1_000)
    await limiter.reset('lily')
    const status = await limiter.getStatus('lily')
    expect(status.concurrentRuns).toBe(0)
    expect(status.tokensUsedToday).toBe(0)
    expect(status.runsThisHour).toBe(0)
  })
})

// ─── RateLimitExceededError ───────────────────────────────────────────────────

describe('RateLimitExceededError', () => {
  it('has correct prototype chain', () => {
    const err = new RateLimitExceededError('user', 'maxConcurrentRuns', 5, 3, 60)
    expect(err).toBeInstanceOf(RateLimitExceededError)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('RateLimitExceededError')
  })

  it('message includes useful context', () => {
    const err = new RateLimitExceededError('user', 'tokenBudgetPerDay', 50_000, 40_000, 3600)
    expect(err.message).toContain('tokenBudgetPerDay')
    expect(err.message).toContain('user')
    expect(err.retryAfterSeconds).toBe(3600)
  })
})
