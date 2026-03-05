/**
 * Unit tests for GeminiProvider
 * All network calls are intercepted via jest.spyOn / global.fetch mock.
 */
export { }

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.resetAllMocks();
  // Remove API key from env before each test
  delete process.env['GEMINI_API_KEY'];
  process.env = { ...ORIGINAL_ENV };
  delete process.env['GEMINI_API_KEY'];
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

function mockFetch(responseBody: unknown, ok = true, status = 200) {
  return jest.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(responseBody),
    text: () => Promise.resolve(JSON.stringify(responseBody)),
    body: null,
  } as Partial<Response>);
}

// ─── GeminiProvider ───────────────────────────────────────────────────────────

describe('GeminiProvider', () => {
  it('isAvailable() returns true when API key is present', async () => {
    const { GeminiProvider } = await import('../lib/providers/gemini.provider.js');
    const provider = new GeminiProvider('test-api-key');
    expect(await provider.isAvailable()).toBe(true);
  });

  it('isAvailable() returns false when API key is empty string', async () => {
    const { GeminiProvider } = await import('../lib/providers/gemini.provider.js');
    const provider = new GeminiProvider('');
    expect(await provider.isAvailable()).toBe(false);
  });

  it('isAvailable() reads GEMINI_API_KEY from env', async () => {
    process.env['GEMINI_API_KEY'] = 'env-key';
    const { GeminiProvider } = await import('../lib/providers/gemini.provider.js');
    const provider = new GeminiProvider();
    expect(await provider.isAvailable()).toBe(true);
    delete process.env['GEMINI_API_KEY'];
  });

  it('complete() throws when API key is missing', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = mockFetch({});

    const { GeminiProvider } = await import('../lib/providers/gemini.provider.js');
    const provider = new GeminiProvider('');

    await expect(
      provider.complete({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 50, temperature: 0 }, 'gemini-pro')
    ).rejects.toThrow(/GEMINI_API_KEY/i);
  });

  it('complete() sends request to correct URL and maps response text', async () => {
    const fakeResponse = {
      candidates: [
        { content: { parts: [{ text: 'Hello Gemini!' }], role: 'model' } },
      ],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3 },
    };

    let capturedUrl = '';
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(fakeResponse),
        text: () => Promise.resolve(JSON.stringify(fakeResponse)),
      });
    });

    const { GeminiProvider } = await import('../lib/providers/gemini.provider.js');
    const provider = new GeminiProvider('my-key');

    const result = await provider.complete(
      { messages: [{ role: 'user', content: 'hello' }], maxTokens: 100, temperature: 0 },
      'gemini-pro'
    );

    expect(capturedUrl).toContain('gemini-pro');
    expect(capturedUrl).toContain('my-key');
    expect(result.content).toBe('Hello Gemini!');
  });

  it('complete() throws on non-200 response', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = mockFetch({ error: { message: 'Invalid API key' } }, false, 401);

    const { GeminiProvider } = await import('../lib/providers/gemini.provider.js');
    const provider = new GeminiProvider('bad-key');

    await expect(
      provider.complete({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 50, temperature: 0 }, 'gemini-pro')
    ).rejects.toThrow();
  });

  it('_buildContents() separates system message from user messages', async () => {
    let capturedBody: Record<string, unknown> = {};
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedBody = JSON.parse(opts.body as string);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'ok' }], role: 'model' } }],
          usageMetadata: {},
        }),
        text: () => Promise.resolve('{}'),
      });
    });

    const { GeminiProvider } = await import('../lib/providers/gemini.provider.js');
    const provider = new GeminiProvider('my-key');

    await provider.complete(
      {
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is 2+2?' },
        ],
        maxTokens: 100,
        temperature: 0,
      },
      'gemini-pro'
    );

    // The system message should live in systemInstruction, not contents
    expect(capturedBody['systemInstruction']).toBeDefined();
    // Non-system messages go in contents
    const contents = capturedBody['contents'] as unknown[];
    expect(Array.isArray(contents)).toBe(true);
    const userMsg = contents.find((c: unknown) => (c as { role: string }).role === 'user');
    expect(userMsg).toBeDefined();
  });

  it('stream() yields token chunks from SSE data lines', async () => {
    const sseLines = [
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hello' }] } }] })}`,
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: ' World' }], finishReason: 'STOP' } }], usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3 } })}`,
    ].join('\n');

    const encoder = new TextEncoder();
    const encoded = encoder.encode(sseLines + '\n');

    let readCalled = false;
    const mockBody = {
      getReader() {
        return {
          releaseLock: jest.fn(),
          read(): Promise<{ done: boolean; value: Uint8Array | undefined }> {
            if (!readCalled) {
              readCalled = true;
              return Promise.resolve({ done: false, value: encoded });
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

    const { GeminiProvider } = await import('../lib/providers/gemini.provider.js');
    const provider = new GeminiProvider('my-key');

    const tokens: string[] = [];
    let doneCount = 0;
    for await (const chunk of provider.stream(
      { messages: [{ role: 'user', content: 'hi' }], maxTokens: 100, temperature: 0 },
      'gemini-pro'
    )) {
      if (chunk.done) doneCount++;
      else tokens.push(chunk.token);
    }

    expect(tokens.join('')).toBe('Hello World');
    expect(doneCount).toBeGreaterThan(0);
  });
});
