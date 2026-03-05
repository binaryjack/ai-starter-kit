/**
 * Unit tests for BedrockProvider (E10)
 *
 * All network calls are intercepted via global.fetch mock.
 * SigV4 signing is verified structurally (header presence / format).
 */
export { }

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.resetAllMocks();
  delete process.env['AWS_ACCESS_KEY_ID'];
  delete process.env['AWS_SECRET_ACCESS_KEY'];
  delete process.env['AWS_SESSION_TOKEN'];
  delete process.env['AWS_REGION'];
  delete process.env['AWS_DEFAULT_REGION'];
});

afterAll(() => {
  process.env = { ...ORIGINAL_ENV };
});

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeOkFetch(body: unknown) {
  return jest.fn().mockResolvedValue({
    ok:     true,
    status: 200,
    json:   () => Promise.resolve(body),
    text:   () => Promise.resolve(JSON.stringify(body)),
    body:   null,
  } as Partial<Response>);
}

function makeErrorFetch(status: number, errText: string) {
  return jest.fn().mockResolvedValue({
    ok:     false,
    status,
    json:   () => Promise.reject(new Error('not json')),
    text:   () => Promise.resolve(errText),
    body:   null,
  } as Partial<Response>);
}

const CONVERSE_RESPONSE = {
  output: {
    message: {
      role:    'assistant',
      content: [{ text: 'Hello from Bedrock!' }],
    },
  },
  usage: {
    inputTokens:  10,
    outputTokens: 5,
    totalTokens:  15,
  },
  stopReason: 'end_turn',
};

const BASIC_PROMPT = {
  messages: [
    { role: 'user' as const, content: 'Say hi' },
  ],
  maxTokens:   100,
  temperature: 0,
};

// ─── isAvailable() ─────────────────────────────────────────────────────────────

describe('BedrockProvider — isAvailable()', () => {
  it('returns false when no credentials', async () => {
    const { BedrockProvider } = await import('../lib/providers/bedrock.provider.js');
    const p = new BedrockProvider();
    expect(await p.isAvailable()).toBe(false);
  });

  it('returns false when only accessKeyId is set', async () => {
    const { BedrockProvider } = await import('../lib/providers/bedrock.provider.js');
    const p = new BedrockProvider({ accessKeyId: 'AKID', secretKey: '' });
    expect(await p.isAvailable()).toBe(false);
  });

  it('returns false when only secretKey is set', async () => {
    const { BedrockProvider } = await import('../lib/providers/bedrock.provider.js');
    const p = new BedrockProvider({ accessKeyId: '', secretKey: 'secret' });
    expect(await p.isAvailable()).toBe(false);
  });

  it('returns true when both keys supplied via constructor', async () => {
    const { BedrockProvider } = await import('../lib/providers/bedrock.provider.js');
    const p = new BedrockProvider({ accessKeyId: 'AKID', secretKey: 'secret' });
    expect(await p.isAvailable()).toBe(true);
  });

  it('returns true when both keys present in env', async () => {
    process.env['AWS_ACCESS_KEY_ID']     = 'AKID-env';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'secret-env';
    const { BedrockProvider } = await import('../lib/providers/bedrock.provider.js');
    const p = new BedrockProvider();
    expect(await p.isAvailable()).toBe(true);
  });
});

// ─── complete() ───────────────────────────────────────────────────────────────

describe('BedrockProvider — complete()', () => {
  it('throws when credentials are missing', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = makeOkFetch(CONVERSE_RESPONSE);

    const { BedrockProvider } = await import('../lib/providers/bedrock.provider.js');
    const p = new BedrockProvider();

    await expect(
      p.complete(BASIC_PROMPT, 'anthropic.claude-haiku-20240307-v1:0'),
    ).rejects.toThrow(/AWS_ACCESS_KEY_ID/i);
  });

  it('sends POST to the correct Bedrock Converse endpoint', async () => {
    let capturedUrl = '';
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok:   true,
        status: 200,
        json: () => Promise.resolve(CONVERSE_RESPONSE),
        text: () => Promise.resolve(JSON.stringify(CONVERSE_RESPONSE)),
        body: null,
      } as Partial<Response>);
    });

    const { BedrockProvider } = await import('../lib/providers/bedrock.provider.js');
    const p = new BedrockProvider({ accessKeyId: 'AKID', secretKey: 'secret', region: 'eu-west-1' });
    const modelId = 'anthropic.claude-haiku-20240307-v1:0';

    await p.complete(BASIC_PROMPT, modelId);

    expect(capturedUrl).toContain('bedrock-runtime.eu-west-1.amazonaws.com');
    expect(capturedUrl).toContain(encodeURIComponent(modelId));
    expect(capturedUrl).toContain('/converse');
    expect(capturedUrl).not.toContain('/converse-stream');
  });

  it('attaches SigV4 Authorization header', async () => {
    let capturedHeaders: Record<string, string> = {};
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) => {
        capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
        return Promise.resolve({
          ok:   true,
          status: 200,
          json: () => Promise.resolve(CONVERSE_RESPONSE),
          text: () => Promise.resolve(JSON.stringify(CONVERSE_RESPONSE)),
          body: null,
        } as Partial<Response>);
      },
    );

    const { BedrockProvider } = await import('../lib/providers/bedrock.provider.js');
    const p = new BedrockProvider({ accessKeyId: 'AKID', secretKey: 'secret' });

    await p.complete(BASIC_PROMPT, 'anthropic.claude-haiku-20240307-v1:0');

    expect(capturedHeaders['Authorization']).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\//);
    expect(capturedHeaders['Authorization']).toContain('SignedHeaders=');
    expect(capturedHeaders['Authorization']).toContain('Signature=');
  });

  it('includes x-amz-security-token when sessionToken is provided', async () => {
    let capturedHeaders: Record<string, string> = {};
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) => {
        capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
        return Promise.resolve({
          ok:   true,
          status: 200,
          json: () => Promise.resolve(CONVERSE_RESPONSE),
          text: () => Promise.resolve(JSON.stringify(CONVERSE_RESPONSE)),
          body: null,
        } as Partial<Response>);
      },
    );

    const { BedrockProvider } = await import('../lib/providers/bedrock.provider.js');
    const p = new BedrockProvider({ accessKeyId: 'AKID', secretKey: 'secret', sessionToken: 'TOKEN' });

    await p.complete(BASIC_PROMPT, 'anthropic.claude-haiku-20240307-v1:0');

    expect(capturedHeaders['x-amz-security-token']).toBe('TOKEN');
  });

  it('maps system messages to "system" field in request body', async () => {
    let capturedBody: unknown;
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return Promise.resolve({
          ok:   true,
          status: 200,
          json: () => Promise.resolve(CONVERSE_RESPONSE),
          text: () => Promise.resolve(JSON.stringify(CONVERSE_RESPONSE)),
          body: null,
        } as Partial<Response>);
      },
    );

    const { BedrockProvider } = await import('../lib/providers/bedrock.provider.js');
    const p = new BedrockProvider({ accessKeyId: 'AKID', secretKey: 'secret' });

    await p.complete({
      messages: [
        { role: 'system',    content: 'You are a helpful bot.' },
        { role: 'user',      content: 'Hello!' },
      ],
      maxTokens:   50,
      temperature: 0,
    }, 'anthropic.claude-haiku-20240307-v1:0');

    const body = capturedBody as Record<string, unknown>;
    expect(Array.isArray(body['system'])).toBe(true);
    expect((body['system'] as Array<{ text: string }>)[0].text).toBe('You are a helpful bot.');

    const messages = body['messages'] as Array<{ role: string; content: Array<{ text: string }> }>;
    expect(messages).toHaveLength(1);
    expect(messages[0]!.role).toBe('user');
    expect(messages[0]!.content[0]!.text).toBe('Hello!');
  });

  it('parses ConverseResponse text and usage', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = makeOkFetch(CONVERSE_RESPONSE);

    const { BedrockProvider } = await import('../lib/providers/bedrock.provider.js');
    const p = new BedrockProvider({ accessKeyId: 'AKID', secretKey: 'secret' });

    const result = await p.complete(BASIC_PROMPT, 'anthropic.claude-haiku-20240307-v1:0');

    expect(result.content).toBe('Hello from Bedrock!');
    expect(result.usage?.inputTokens).toBe(10);
    expect(result.usage?.outputTokens).toBe(5);
    expect(result.provider).toBe('bedrock');
  });

  it('returns empty content when response has no content array', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = makeOkFetch({ output: {}, usage: { inputTokens: 1, outputTokens: 0 } });

    const { BedrockProvider } = await import('../lib/providers/bedrock.provider.js');
    const p = new BedrockProvider({ accessKeyId: 'AKID', secretKey: 'secret' });

    const result = await p.complete(BASIC_PROMPT, 'anthropic.claude-haiku-20240307-v1:0');

    expect(result.content).toBe('');
  });

  it('throws on non-ok HTTP response', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = makeErrorFetch(403, 'AccessDeniedException');

    const { BedrockProvider } = await import('../lib/providers/bedrock.provider.js');
    const p = new BedrockProvider({ accessKeyId: 'AKID', secretKey: 'secret' });

    await expect(
      p.complete(BASIC_PROMPT, 'anthropic.claude-haiku-20240307-v1:0'),
    ).rejects.toThrow(/403/);
  });

  it('uses us-east-1 as default region', async () => {
    let capturedUrl = '';
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok:   true,
        status: 200,
        json: () => Promise.resolve(CONVERSE_RESPONSE),
        text: () => Promise.resolve(JSON.stringify(CONVERSE_RESPONSE)),
        body: null,
      } as Partial<Response>);
    });

    const { BedrockProvider } = await import('../lib/providers/bedrock.provider.js');
    const p = new BedrockProvider({ accessKeyId: 'AKID', secretKey: 'secret' });

    await p.complete(BASIC_PROMPT, 'anthropic.claude-haiku-20240307-v1:0');

    expect(capturedUrl).toContain('us-east-1');
  });

  it('reads region from AWS_DEFAULT_REGION when AWS_REGION is absent', async () => {
    process.env['AWS_DEFAULT_REGION'] = 'ap-southeast-1';
    let capturedUrl = '';
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok:   true,
        status: 200,
        json: () => Promise.resolve(CONVERSE_RESPONSE),
        text: () => Promise.resolve(JSON.stringify(CONVERSE_RESPONSE)),
        body: null,
      } as Partial<Response>);
    });

    const { BedrockProvider } = await import('../lib/providers/bedrock.provider.js');
    const p = new BedrockProvider({ accessKeyId: 'AKID', secretKey: 'secret' });

    await p.complete(BASIC_PROMPT, 'model');

    expect(capturedUrl).toContain('ap-southeast-1');
    delete process.env['AWS_DEFAULT_REGION'];
  });
});

// ─── stream() ─────────────────────────────────────────────────────────────────

function buildBedrockEventFrame(payload: string): Buffer {
  // Frame layout: [4-byte total-len][4-byte headers-len][4-byte prelude-crc][0-byte headers][payload][4-byte msg-crc]
  // headers-len = 0 (no headers in payload frames for this test)
  const payloadBuf  = Buffer.from(payload, 'utf-8');
  const headersBuf  = Buffer.alloc(0);
  const totalLen    = 4 + 4 + 4 + headersBuf.length + payloadBuf.length + 4;  // prelude + headers + payload + trailing CRC
  const frame       = Buffer.alloc(totalLen);
  frame.writeUInt32BE(totalLen, 0);
  frame.writeUInt32BE(headersBuf.length, 4);
  frame.writeUInt32BE(0, 8);                                     // prelude CRC (not verified by parser)
  headersBuf.copy(frame, 12);
  payloadBuf.copy(frame, 12 + headersBuf.length);
  frame.writeUInt32BE(0, totalLen - 4);                         // trailing CRC (not verified by parser)
  return frame;
}

async function readChunks(iterable: AsyncIterable<{ token: string; done: boolean }>): Promise<Array<{ token: string; done: boolean }>> {
  const chunks: Array<{ token: string; done: boolean }> = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('BedrockProvider — stream()', () => {
  it('throws when credentials are missing', async () => {
    const { BedrockProvider } = await import('../lib/providers/bedrock.provider.js');
    const p = new BedrockProvider();

    const iterable = p.stream!(BASIC_PROMPT, 'model')!;
    await expect(readChunks(iterable)).rejects.toThrow(/AWS_ACCESS_KEY_ID/i);
  });

  it('yields token chunks from binary event frames', async () => {
    const delta1 = buildBedrockEventFrame(JSON.stringify({ contentBlockDelta: { delta: { text: 'Hello' } } }));
    const delta2 = buildBedrockEventFrame(JSON.stringify({ contentBlockDelta: { delta: { text: ' world' } } }));
    const stop   = buildBedrockEventFrame(JSON.stringify({
      messageStop: { stopReason: 'end_turn' },
    }));
    const meta   = buildBedrockEventFrame(JSON.stringify({
      metadata: { usage: { inputTokens: 3, outputTokens: 2 } },
    }));
    const combined = Buffer.concat([meta, delta1, delta2, stop]);

    const mockBody = {
      [Symbol.asyncIterator]() {
        let sent = false;
        return {
          next() {
            if (!sent) {
              sent = true;
              return Promise.resolve({ value: combined, done: false });
            }
            return Promise.resolve({ value: undefined, done: true });
          },
        };
      },
    };

    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok:   true,
      status: 200,
      body: mockBody,
      json: () => Promise.reject(new Error('no json for stream')),
      text: () => Promise.resolve(''),
    } as unknown as Response);

    const { BedrockProvider } = await import('../lib/providers/bedrock.provider.js');
    const p = new BedrockProvider({ accessKeyId: 'AKID', secretKey: 'secret' });

    const chunks = await readChunks(p.stream!(BASIC_PROMPT, 'anthropic.claude-haiku-20240307-v1:0')!);

    const tokenChunks = chunks.filter((c) => !c.done);
    const doneChunk   = chunks.find((c) => c.done);

    expect(tokenChunks.map((c) => c.token).join('')).toBe('Hello world');
    expect(doneChunk).toBeDefined();
    expect((doneChunk as { token: string; done: boolean; usage?: unknown }).usage).toEqual({
      inputTokens:  3,
      outputTokens: 2,
    });
  });

  it('sends to /converse-stream endpoint', async () => {
    let capturedUrl = '';
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok:   true,
        status: 200,
        body: {
          [Symbol.asyncIterator]() {
            return { next: () => Promise.resolve({ value: undefined, done: true }) };
          },
        },
        json: () => Promise.reject(new Error()),
        text: () => Promise.resolve(''),
      } as unknown as Response);
    });

    const { BedrockProvider } = await import('../lib/providers/bedrock.provider.js');
    const p = new BedrockProvider({ accessKeyId: 'AKID', secretKey: 'secret', region: 'us-west-2' });

    await readChunks(p.stream!(BASIC_PROMPT, 'anthropic.claude-haiku-20240307-v1:0')!);

    expect(capturedUrl).toContain('/converse-stream');
    expect(capturedUrl).toContain('us-west-2');
  });

  it('throws on non-ok stream response', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = makeErrorFetch(401, 'UnauthorizedException');

    const { BedrockProvider } = await import('../lib/providers/bedrock.provider.js');
    const p = new BedrockProvider({ accessKeyId: 'AKID', secretKey: 'secret' });

    await expect(
      readChunks(p.stream!(BASIC_PROMPT, 'model')!),
    ).rejects.toThrow(/401/);
  });
});

// ─── SigV4 helpers (indirectly via complete()) ────────────────────────────────

describe('SigV4 signing (structural)', () => {
  it('Authorization header contains credential scope with region and service', async () => {
    let auth = '';
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) => {
        auth = (init?.headers as Record<string, string>)['Authorization'] ?? '';
        return Promise.resolve({
          ok:   true,
          status: 200,
          json: () => Promise.resolve(CONVERSE_RESPONSE),
          text: () => Promise.resolve(JSON.stringify(CONVERSE_RESPONSE)),
          body: null,
        } as Partial<Response>);
      },
    );

    const { BedrockProvider } = await import('../lib/providers/bedrock.provider.js');
    const p = new BedrockProvider({ accessKeyId: 'AKID', secretKey: 'secret', region: 'ca-central-1' });

    await p.complete(BASIC_PROMPT, 'model');

    expect(auth).toContain('ca-central-1');
    expect(auth).toContain('/bedrock/aws4_request');
    expect(auth).toMatch(/Signature=[0-9a-f]{64}/);
  });
});
