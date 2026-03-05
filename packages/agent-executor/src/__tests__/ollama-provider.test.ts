/**
 * Unit tests for OllamaProvider
 * All network calls are mocked via jest.spyOn(global, 'fetch').
 */
export { }

// Ensure module-level env is clean
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.resetAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFetchMock(responseBody: unknown, status = 200, ok = true) {
  return jest.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(responseBody),
    text: () => Promise.resolve(JSON.stringify(responseBody)),
    body: null,
  } as Partial<Response>);
}

// ─── OllamaProvider ───────────────────────────────────────────────────────────

describe('OllamaProvider', () => {
  it('isAvailable() returns true when /api/tags succeeds', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = makeFetchMock({ models: [] });

    const { OllamaProvider } = await import('../lib/providers/ollama.provider.js');
    const provider = new OllamaProvider('http://localhost:11434');

    const available = await provider.isAvailable();
    expect(available).toBe(true);
  });

  it('isAvailable() returns false on network error', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const { OllamaProvider } = await import('../lib/providers/ollama.provider.js');
    const provider = new OllamaProvider('http://localhost:11434');

    const available = await provider.isAvailable();
    expect(available).toBe(false);
  });

  it('isAvailable() returns false on non-200 response', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = makeFetchMock({ error: 'not found' }, 404, false);

    const { OllamaProvider } = await import('../lib/providers/ollama.provider.js');
    const provider = new OllamaProvider();

    const available = await provider.isAvailable();
    expect(available).toBe(false);
  });

  it('reads OLLAMA_HOST from environment', async () => {
    process.env['OLLAMA_HOST'] = 'http://remote:11434';

    let capturedUrl = '';
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ models: [] }), text: () => Promise.resolve('{}') });
    });

    const { OllamaProvider } = await import('../lib/providers/ollama.provider.js');
    const provider = new OllamaProvider();
    await provider.isAvailable();

    expect(capturedUrl).toContain('http://remote:11434');
  });

  it('complete() sends correct request body and maps response', async () => {
    const fakeResponse = {
      message: { role: 'assistant', content: 'Hello!' },
      prompt_eval_count: 10,
      eval_count: 5,
    };

    let capturedBody: unknown;
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedBody = JSON.parse(opts.body as string);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(fakeResponse),
        text: () => Promise.resolve(JSON.stringify(fakeResponse)),
      });
    });

    const { OllamaProvider } = await import('../lib/providers/ollama.provider.js');
    const provider = new OllamaProvider('http://localhost:11434');

    const result = await provider.complete(
      { messages: [{ role: 'user', content: 'hi' }], maxTokens: 100, temperature: 0.5 },
      'llama3'
    );

    expect(capturedBody).toMatchObject({ model: 'llama3', stream: false });
    expect(result.content).toBe('Hello!');
  });

  it('complete() throws on non-200 response', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = makeFetchMock({ error: 'model not found' }, 404, false);

    const { OllamaProvider } = await import('../lib/providers/ollama.provider.js');
    const provider = new OllamaProvider('http://localhost:11434');

    await expect(
      provider.complete({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 50, temperature: 0 }, 'bad-model')
    ).rejects.toThrow();
  });

  it('stream() yields token chunks and final done chunk', async () => {
    // Build a mock that returns a streaming body
    const lines = [
      JSON.stringify({ message: { content: 'Hello' }, done: false }),
      JSON.stringify({ message: { content: ' World' }, done: false }),
      JSON.stringify({ message: { content: '' }, done: true, prompt_eval_count: 5, eval_count: 10 }),
    ];

    const mockBody = {
      getReader() {
        let i = 0;
        const encoder = new TextEncoder();
        return {
          releaseLock: jest.fn(),
          read(): Promise<{ done: boolean; value: Uint8Array | undefined }> {
            if (i < lines.length) {
              return Promise.resolve({ done: false, value: encoder.encode((lines[i++] ?? '') + '\n') });
            }
            return Promise.resolve({ done: true, value: undefined });
          },
        };
      },
    };

    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: mockBody,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    });

    const { OllamaProvider } = await import('../lib/providers/ollama.provider.js');
    const provider = new OllamaProvider('http://localhost:11434');

    const chunks: { token: string; done: boolean }[] = [];
    for await (const chunk of provider.stream(
      { messages: [{ role: 'user', content: 'hi' }], maxTokens: 100, temperature: 0 },
      'llama3'
    )) {
      chunks.push(chunk);
    }

    const tokens = chunks.filter((c) => !c.done).map((c) => c.token);
    expect(tokens.join('')).toBe('Hello World');
    expect(chunks[chunks.length - 1]?.done).toBe(true);
  });
});
