/**
 * Unit tests for embedding providers and cosine similarity
 */

import { cosineSimilarity } from './cosine-similarity'
import { OllamaEmbeddingProvider } from './ollama-embedding-provider'
import { OpenAIEmbeddingProvider } from './openai-embedding-provider'

// ── cosineSimilarity ──────────────────────────────────────────────────────────

describe('cosineSimilarity', () => {
  it('returns 1 for identical unit vectors', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([1, 0, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5)
  })

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([0, 1, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5)
  })

  it('returns -1 for opposite vectors', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([-1, 0, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5)
  })

  it('returns 0 for a zero vector', () => {
    const a = new Float32Array([0, 0, 0])
    const b = new Float32Array([1, 0, 0])
    expect(cosineSimilarity(a, b)).toBe(0)
  })

  it('throws for mismatched dimensions', () => {
    const a = new Float32Array([1, 0])
    const b = new Float32Array([1, 0, 0])
    expect(() => cosineSimilarity(a, b)).toThrow('Vector dimension mismatch')
  })

  it('computes correct similarity for known vectors', () => {
    // 45-degree angle → cos(45°) ≈ 0.7071
    const a = new Float32Array([1, 0])
    const b = new Float32Array([1, 1])
    const sim = cosineSimilarity(a, b)
    expect(sim).toBeCloseTo(Math.SQRT1_2, 4)
  })
})

// ── OpenAIEmbeddingProvider construction ─────────────────────────────────────

describe('OpenAIEmbeddingProvider', () => {
  beforeEach(() => { jest.resetAllMocks() })
  it('constructs with required apiKey', () => {
    const p = new OpenAIEmbeddingProvider({ apiKey: 'sk-test' })
    expect(p.dimensions).toBe(1536)
    expect(p.model).toBe('text-embedding-3-small')
  })

  it('uses 3072 dimensions for large model', () => {
    const p = new OpenAIEmbeddingProvider({
      apiKey: 'sk-test',
      model: 'text-embedding-3-large',
    })
    expect(p.dimensions).toBe(3072)
  })

  it('throws without apiKey', () => {
    expect(() =>
      new OpenAIEmbeddingProvider({} as any)
    ).toThrow('apiKey is required')
  })

  it('calls the correct endpoint and returns Float32Arrays', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        data: [
          { index: 0, embedding: [0.1, 0.2, 0.3] },
          { index: 1, embedding: [0.4, 0.5, 0.6] },
        ],
      }),
    }
    global.fetch = jest.fn().mockResolvedValueOnce(mockResponse) as any

    const p = new OpenAIEmbeddingProvider({ apiKey: 'sk-test' })
    const result = await p.embed(['hello', 'world'])

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({ method: 'POST' })
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toBeInstanceOf(Float32Array)
    expect(result[0].length).toBe(3)
    expect(result[0][0]).toBeCloseTo(0.1, 5)
    expect(result[0][1]).toBeCloseTo(0.2, 5)
    expect(result[0][2]).toBeCloseTo(0.3, 5)
  })

  it('throws on non-OK response', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: { message: 'Invalid API key' } }),
    }) as any

    const p = new OpenAIEmbeddingProvider({ apiKey: 'bad-key' })
    await expect(p.embed(['test'])).rejects.toThrow('Invalid API key')
  })
})

// ── OllamaEmbeddingProvider construction ─────────────────────────────────────

describe('OllamaEmbeddingProvider', () => {
  beforeEach(() => { jest.resetAllMocks() })
  it('constructs with defaults', () => {
    const p = new OllamaEmbeddingProvider()
    expect(p.dimensions).toBe(768)
    expect(p.model).toBe('nomic-embed-text')
  })

  it('uses 1024 dimensions for large model', () => {
    const p = new OllamaEmbeddingProvider({
      model: 'mxbai-embed-large',
    })
    expect(p.dimensions).toBe(1024)
  })

  it('calls the Ollama endpoint for each text', async () => {
    const mockVector = [0.1, 0.2, 0.3]
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ embedding: mockVector }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ embedding: mockVector }) }) as any

    const p = new OllamaEmbeddingProvider()
    const result = await p.embed(['alpha', 'beta'])

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(result[0]).toBeInstanceOf(Float32Array)
  })

  it('throws on non-OK response', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false, status: 500, statusText: 'Internal Server Error',
      json: async () => ({ error: 'model not found' }),
    }) as any

    const p = new OllamaEmbeddingProvider()
    await expect(p.embed(['test'])).rejects.toThrow('Ollama embeddings error')
  })
})

// ── OllamaEmbeddingProvider concurrent embed ──────────────────────────────────

describe('OllamaEmbeddingProvider concurrent embed', () => {
  beforeEach(() => { jest.resetAllMocks() })

  it('issues all requests for the full input', async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({ ok: true, json: async () => ({ embedding: [0.1, 0.2] }) })
    ) as any

    const p = new OllamaEmbeddingProvider()
    const result = await p.embed(['a', 'b', 'c', 'd', 'e'])

    expect(global.fetch).toHaveBeenCalledTimes(5)
    expect(result).toHaveLength(5)
    result.forEach(r => expect(r).toBeInstanceOf(Float32Array))
  })

  it('preserves result ordering across chunk boundaries', async () => {
    global.fetch = jest.fn().mockImplementation((_url: string, opts: any) => {
      const idx = parseInt((JSON.parse(opts.body) as { prompt: string }).prompt, 10)
      return Promise.resolve({ ok: true, json: async () => ({ embedding: [idx / 10] }) })
    }) as any

    const p = new OllamaEmbeddingProvider()
    const result = await p.embed(['0', '1', '2', '3', '4', '5'])

    expect(result).toHaveLength(6)
    for (let i = 0; i < 6; i++) {
      expect(result[i]).toBeInstanceOf(Float32Array)
      expect(result[i][0]).toBeCloseTo(i / 10, 5)
    }
  })

  it('propagates error from any request in the chunk', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ embedding: [0.1] }) })
      .mockResolvedValueOnce({
        ok: false, status: 503, statusText: 'Service Unavailable',
        json: async () => ({ error: 'overloaded' }),
      }) as any

    const p = new OllamaEmbeddingProvider()
    await expect(p.embed(['ok', 'fail'])).rejects.toThrow('Ollama embeddings error')
  })
})
