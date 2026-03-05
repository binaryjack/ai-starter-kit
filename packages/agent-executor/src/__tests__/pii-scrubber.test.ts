import { PiiScrubber, createPiiSafeProvider, ScrubResult } from '../lib/pii-scrubber'
import type { LLMProvider, LLMPrompt, LLMResponse, ToolExecutorFn } from '../lib/llm-provider'

// ─── helpers ─────────────────────────────────────────────────────────────────

const mockResponse: LLMResponse = {
  content: 'ok',
  model: 'claude-3-haiku',
  provider: 'mock',
  usage: { inputTokens: 5, outputTokens: 2 },
}

const makeProvider = (): LLMProvider => ({
  name: 'mock',
  complete: jest.fn(async (_prompt: LLMPrompt, _modelId: string) => mockResponse),
  isAvailable: jest.fn(async () => true),
})

const prompt = (content: string): LLMPrompt => ({
  messages: [{ role: 'user', content }],
})

// ─── PiiScrubber ─────────────────────────────────────────────────────────────

describe('PiiScrubber', () => {
  let scrubber: PiiScrubber

  beforeEach(() => {
    scrubber = new PiiScrubber()
  })

  it('scrubs an AWS access key', () => {
    const text = 'Key is AKIAIOSFODNN7EXAMPLE'
    const result: ScrubResult = scrubber.scrub(text)
    expect(result.text).not.toContain('AKIAIOSFODNN7EXAMPLE')
    expect(result.scrubCount).toBeGreaterThan(0)
    expect(result.patternsMatched).toContain('AWS_ACCESS_KEY')
  })

  it('scrubs a GitHub token', () => {
    // GitHub PATs are 36+ chars after the ghp_ prefix
    const text = 'Token: ghp_abcdefghijklmnopqrstuvwxyz12345678901'
    const result = scrubber.scrub(text)
    expect(result.text).not.toContain('ghp_')
    expect(result.patternsMatched).toContain('GITHUB_TOKEN')
  })

  it('scrubs an Anthropic API key', () => {
    const text = 'ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz'
    const result = scrubber.scrub(text)
    expect(result.text).not.toContain('sk-ant-api03-')
    expect(result.scrubCount).toBeGreaterThan(0)
  })

  it('scrubs an OpenAI API key', () => {
    const text = 'key = sk-abcdefghijklmnopqrstuvwxyz1234567890abcdef'
    const result = scrubber.scrub(text)
    expect(result.text).not.toContain('sk-abcdefg')
  })

  it('does not modify clean text', () => {
    const text = 'Hello, world! No secrets here.'
    const result = scrubber.scrub(text)
    expect(result.text).toBe(text)
    expect(result.scrubCount).toBe(0)
    expect(result.patternsMatched).toHaveLength(0)
  })

  it('scrubs multiple patterns in one pass', () => {
    // AWS key (16 uppercase alphanum after AKIA) + GitHub PAT (36+ chars after ghp_)
    const text = 'Key: AKIAIOSFODNN7EXAMPLE and token: ghp_abcdefghijklmnopqrstuvwxyz12345678901'
    const result = scrubber.scrub(text)
    expect(result.scrubCount).toBeGreaterThanOrEqual(2)
    expect(result.patternsMatched.length).toBeGreaterThanOrEqual(2)
  })

  it('accepts custom patterns via customPatterns option', () => {
    const custom = new PiiScrubber({
      customPatterns: [{ name: 'MAGIC_WORD', pattern: 'secret-word-xyz' }],
    })
    const result = custom.scrub('Do not share my secret-word-xyz please')
    expect(result.text).not.toContain('secret-word-xyz')
    expect(result.text).toContain('[REDACTED:MAGIC_WORD]')
    expect(result.patternsMatched).toContain('MAGIC_WORD')
  })

  it('scrubPrompt redacts prompt messages', () => {
    const p: LLMPrompt = {
      messages: [
        { role: 'user', content: 'My key is AKIAIOSFODNN7EXAMPLE' },
        { role: 'assistant', content: 'I see your key' },
      ],
    }
    const { prompt: scrubbed, result } = scrubber.scrubPrompt(p)
    expect(scrubbed.messages[0]!.content).not.toContain('AKIAIOSFODNN7EXAMPLE')
    expect(result.scrubCount).toBeGreaterThan(0)
  })

  it('when disabled, returns original text unchanged', () => {
    const disabled = new PiiScrubber({ enabled: false })
    const text = 'AKIAIOSFODNN7EXAMPLE'
    const result = disabled.scrub(text)
    expect(result.text).toBe(text)
    expect(result.scrubCount).toBe(0)
  })

  it('patternNames returns all active pattern names', () => {
    const names = scrubber.patternNames
    expect(names).toContain('AWS_ACCESS_KEY')
    expect(names).toContain('GITHUB_TOKEN')
  })
})

// ─── createPiiSafeProvider ────────────────────────────────────────────────────

describe('createPiiSafeProvider', () => {
  it('wraps complete() and scrubs input prompt', async () => {
    const inner = makeProvider()
    const safe = createPiiSafeProvider(inner)
    const p = prompt('My key AKIAIOSFODNN7EXAMPLE is here')
    await safe.complete(p, 'claude-3-haiku-20240307')
    const received = (inner.complete as jest.Mock).mock.calls[0][0] as LLMPrompt
    expect(received.messages[0]!.content).not.toContain('AKIAIOSFODNN7EXAMPLE')
  })

  it('passes through isAvailable', async () => {
    const inner = makeProvider()
    const safe = createPiiSafeProvider(inner)
    await expect(safe.isAvailable()).resolves.toBe(true)
  })

  it('preserves provider name', () => {
    const inner = makeProvider()
    const safe = createPiiSafeProvider(inner)
    expect(safe.name).toBe('mock')
  })

  it('calls onScrub when secrets found', async () => {
    const inner = makeProvider()
    const onScrub = jest.fn()
    const safe = createPiiSafeProvider(inner, { onScrub })
    await safe.complete(prompt('Key: AKIAIOSFODNN7EXAMPLE'), 'claude-3-haiku-20240307')
    expect(onScrub).toHaveBeenCalled()
    const [result] = onScrub.mock.calls[0] as [ScrubResult]
    expect(result.scrubCount).toBeGreaterThan(0)
    expect(JSON.stringify(result)).not.toContain('AKIAIOSFODNN7EXAMPLE')
  })

  it('does NOT call onScrub when no secrets found', async () => {
    const inner = makeProvider()
    const onScrub = jest.fn()
    const safe = createPiiSafeProvider(inner, { onScrub })
    await safe.complete(prompt('Hello world — nothing secret here'), 'claude-3-haiku-20240307')
    expect(onScrub).not.toHaveBeenCalled()
  })

  it('wraps completeWithTools when inner has it', async () => {
    const inner = makeProvider()
    ;(inner as LLMProvider & { completeWithTools: jest.Mock }).completeWithTools =
      jest.fn(async (_p: LLMPrompt, _m: string, _e: ToolExecutorFn) => mockResponse)
    const safe = createPiiSafeProvider(inner)
    expect(typeof (safe as LLMProvider & { completeWithTools?: unknown }).completeWithTools).toBe('function')
  })
})
