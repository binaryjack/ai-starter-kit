/**
 * Unit tests for PythonMcpBridge and PythonMcpProvider (E9)
 * child_process.spawn is mocked to simulate a Python MCP server.
 */

import { EventEmitter } from 'events'

// ─── Mock child_process ───────────────────────────────────────────────────────

const mockSpawn = jest.fn();
jest.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

// ─── Python process simulator ─────────────────────────────────────────────────

interface MockProcess {
  stdin:  { write: jest.Mock; end: jest.Mock; writable: boolean };
  stdout: EventEmitter & { setEncoding: jest.Mock };
  stderr: EventEmitter;
  on:     jest.Mock;
  kill:   jest.Mock;
}

/**
 * Create a mock ChildProcess that responds to JSON-RPC messages written to
 * its stdin by emitting JSON-RPC responses on its stdout.
 *
 * `responseMap` maps method names to the `result` to include in the response.
 * The bridge always sends a JSON-RPC request with an integer `id`; the mock
 * echoes back `{"jsonrpc":"2.0","id":<id>,"result": responseMap[method]}`.
 */
function makeMockProcess(
  responseMap: Record<string, unknown> = {},
  errorMap:    Record<string, { code: number; message: string }> = {},
): MockProcess {
  const stdout = Object.assign(new EventEmitter(), { setEncoding: jest.fn() });
  const stderr = new EventEmitter();

  let _errorHandler:  ((err: Error)  => void) | null = null;
  let _exitHandler:   ((code: number) => void) | null = null;

  const mockProc: MockProcess = {
    stdin: {
      writable: true,
      end:   jest.fn(),
      write: jest.fn().mockImplementation((data: string) => {
        // Parse the incoming JSON-RPC request and emit the response on stdout
        let req: { jsonrpc: string; id?: number; method?: string };
        try {
          req = JSON.parse(data.toString().trim()) as typeof req;
        } catch {
          return;
        }

        // notifications have no id — don't respond
        if (req.id === undefined) return;

        const method = req.method ?? '';
        setImmediate(() => {
          if (errorMap[method]) {
            const resp = JSON.stringify({
              jsonrpc: '2.0',
              id:      req.id,
              error:   errorMap[method],
            });
            stdout.emit('data', resp + '\n');
          } else if (method in responseMap) {
            const resp = JSON.stringify({
              jsonrpc: '2.0',
              id:      req.id,
              result:  responseMap[method],
            });
            stdout.emit('data', resp + '\n');
          }
          // unknown method → no response (will timeout)
        });
      }),
    },
    stdout,
    stderr,
    on: jest.fn().mockImplementation((event: string, handler: (arg?: unknown) => void) => {
      if (event === 'error') _errorHandler = handler as (err: Error) => void;
      if (event === 'exit')  _exitHandler  = handler as (code: number) => void;
      return mockProc;
    }),
    kill: jest.fn().mockImplementation(() => {
      if (_exitHandler) _exitHandler(0);
    }),
  };

  void _errorHandler; void _exitHandler;  // satisfy TS unused-var
  return mockProc;
}

const INIT_RESULT = {
  protocolVersion: '2024-11-05',
  capabilities:    { tools: {} },
  serverInfo:      { name: 'test-python-server', version: '0.1.0' },
};

const TOOLS_RESULT = {
  tools: [
    {
      name:        'generate',
      description: 'Generate text from a prompt',
      inputSchema: {
        type:       'object',
        properties: { prompt: { type: 'string' } },
        required:   ['prompt'],
      },
    },
  ],
};

const CALL_RESULT: { content: Array<{ type: string; text: string }> } = {
  content: [{ type: 'text', text: 'Hello from Python!' }],
};

function makeDefaultMock() {
  return makeMockProcess({
    'initialize':  INIT_RESULT,
    'tools/list':  TOOLS_RESULT,
    'tools/call':  CALL_RESULT,
  });
}

// ─── Tests — PythonMcpBridge ──────────────────────────────────────────────────

describe('PythonMcpBridge — start() / stop()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('spawns the Python interpreter with the correct args', async () => {
    const proc = makeDefaultMock();
    mockSpawn.mockReturnValue(proc);

    const { PythonMcpBridge } = await import('../lib/python-mcp-bridge.js');
    const bridge = new PythonMcpBridge({ scriptPath: 'my_agent.py', pythonBin: 'python3' });

    await bridge.start();

    expect(mockSpawn).toHaveBeenCalledWith(
      'python3',
      ['my_agent.py'],
      expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] }),
    );

    await bridge.stop();
  });

  it('passes extra CLI args to the Python script', async () => {
    const proc = makeDefaultMock();
    mockSpawn.mockReturnValue(proc);

    const { PythonMcpBridge } = await import('../lib/python-mcp-bridge.js');
    const bridge = new PythonMcpBridge({
      scriptPath: 'agent.py',
      args:       ['--mode', 'fast'],
    });

    await bridge.start();

    expect(mockSpawn).toHaveBeenCalledWith(
      'python3',
      ['agent.py', '--mode', 'fast'],
      expect.anything(),
    );

    await bridge.stop();
  });

  it('start() is idempotent (calling twice is safe)', async () => {
    const proc = makeDefaultMock();
    mockSpawn.mockReturnValue(proc);

    const { PythonMcpBridge } = await import('../lib/python-mcp-bridge.js');
    const bridge = new PythonMcpBridge({ scriptPath: 'a.py' });

    await bridge.start();
    await bridge.start();  // should not spawn again

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    await bridge.stop();
  });

  it('stop() kills the subprocess and clears state', async () => {
    const proc = makeDefaultMock();
    mockSpawn.mockReturnValue(proc);

    const { PythonMcpBridge } = await import('../lib/python-mcp-bridge.js');
    const bridge = new PythonMcpBridge({ scriptPath: 'a.py' });

    await bridge.start();
    await bridge.stop();

    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(proc.stdin.end).toHaveBeenCalled();
  });
});

describe('PythonMcpBridge — listTools()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns tools from the Python server', async () => {
    mockSpawn.mockReturnValue(makeDefaultMock());

    const { PythonMcpBridge } = await import('../lib/python-mcp-bridge.js');
    const bridge = new PythonMcpBridge({ scriptPath: 'a.py' });
    await bridge.start();

    const tools = await bridge.listTools();

    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe('generate');
    expect(tools[0]!.description).toBe('Generate text from a prompt');

    await bridge.stop();
  });

  it('returns [] when the server returns no tools array', async () => {
    const proc = makeMockProcess({
      'initialize': INIT_RESULT,
      'tools/list': {},          // missing `tools` key
    });
    mockSpawn.mockReturnValue(proc);

    const { PythonMcpBridge } = await import('../lib/python-mcp-bridge.js');
    const bridge = new PythonMcpBridge({ scriptPath: 'a.py' });
    await bridge.start();

    const tools = await bridge.listTools();
    expect(tools).toEqual([]);

    await bridge.stop();
  });
});

describe('PythonMcpBridge — callTool()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends a tools/call request with name and arguments', async () => {
    const proc = makeDefaultMock();
    mockSpawn.mockReturnValue(proc);

    const { PythonMcpBridge } = await import('../lib/python-mcp-bridge.js');
    const bridge = new PythonMcpBridge({ scriptPath: 'a.py' });
    await bridge.start();

    const result = await bridge.callTool('generate', { prompt: 'hello' });
    expect(result.content[0]!.text).toBe('Hello from Python!');

    // Verify the request that was written to stdin
    const writeCalls = (proc.stdin.write.mock.calls as [string][])
      .map(([s]) => JSON.parse(s.trim()) as { method: string; params?: { name: string; arguments: unknown } });
    const toolCall = writeCalls.find((r) => r.method === 'tools/call');
    expect(toolCall?.params?.name).toBe('generate');
    expect(toolCall?.params?.arguments).toEqual({ prompt: 'hello' });

    await bridge.stop();
  });

  it('rejects on MCP error response', async () => {
    const proc = makeMockProcess(
      { 'initialize': INIT_RESULT },
      { 'tools/call': { code: -32000, message: 'Tool not found' } },
    );
    mockSpawn.mockReturnValue(proc);

    const { PythonMcpBridge } = await import('../lib/python-mcp-bridge.js');
    const bridge = new PythonMcpBridge({ scriptPath: 'a.py' });
    await bridge.start();

    await expect(bridge.callTool('bogus', {})).rejects.toThrow('Tool not found');

    await bridge.stop();
  });

  it('rejects on timeout when Python does not respond', async () => {
    const proc = makeMockProcess({ 'initialize': INIT_RESULT }); // tools/call never responds
    mockSpawn.mockReturnValue(proc);

    const { PythonMcpBridge } = await import('../lib/python-mcp-bridge.js');
    const bridge = new PythonMcpBridge({ scriptPath: 'a.py', callTimeoutMs: 50 });
    await bridge.start();

    await expect(bridge.callTool('slow-tool', {})).rejects.toThrow(/timeout/i);

    await bridge.stop();
  }, 3000);

  it('rejects all pending calls when stop() is called mid-flight', async () => {
    const proc = makeMockProcess({ 'initialize': INIT_RESULT }); // no tools/call response
    mockSpawn.mockReturnValue(proc);

    const { PythonMcpBridge } = await import('../lib/python-mcp-bridge.js');
    const bridge = new PythonMcpBridge({ scriptPath: 'a.py', callTimeoutMs: 5000 });
    await bridge.start();

    const pending = bridge.callTool('slow-tool', {});
    await bridge.stop();

    await expect(pending).rejects.toThrow(/stopped/i);
  });
});

// ─── Tests — PythonMcpProvider ────────────────────────────────────────────────

describe('PythonMcpProvider', () => {
  beforeEach(() => jest.clearAllMocks());

  it('isAvailable() returns true when the generate tool is listed', async () => {
    mockSpawn.mockReturnValue(makeDefaultMock());

    const { PythonMcpBridge } = await import('../lib/python-mcp-bridge.js');
    const bridge   = new PythonMcpBridge({ scriptPath: 'a.py' });
    await bridge.start();

    const provider = bridge.asLLMProvider();
    expect(await provider.isAvailable()).toBe(true);

    await bridge.stop();
  });

  it('isAvailable() returns false when tool is not listed', async () => {
    const proc = makeMockProcess({
      'initialize': INIT_RESULT,
      'tools/list': { tools: [] },     // no tools
    });
    mockSpawn.mockReturnValue(proc);

    const { PythonMcpBridge } = await import('../lib/python-mcp-bridge.js');
    const bridge   = new PythonMcpBridge({ scriptPath: 'a.py' });
    await bridge.start();

    const provider = bridge.asLLMProvider();
    expect(await provider.isAvailable()).toBe(false);

    await bridge.stop();
  });

  it('complete() calls the generate tool and returns text', async () => {
    mockSpawn.mockReturnValue(makeDefaultMock());

    const { PythonMcpBridge } = await import('../lib/python-mcp-bridge.js');
    const bridge   = new PythonMcpBridge({ scriptPath: 'a.py' });
    await bridge.start();

    const provider = bridge.asLLMProvider();
    const response = await provider.complete(
      { messages: [{ role: 'user', content: 'Hello!' }], maxTokens: 100, temperature: 0 },
      'custom-python-model',
    );

    expect(response.content).toBe('Hello from Python!');
    expect(response.provider).toBe('python-mcp');
    expect(response.model).toBe('custom-python-model');

    await bridge.stop();
  });

  it('complete() includes system message when present', async () => {
    const proc = makeMockProcess({
      'initialize': INIT_RESULT,
      'tools/list': TOOLS_RESULT,
      'tools/call': CALL_RESULT,
    });
    mockSpawn.mockReturnValue(proc);

    const { PythonMcpBridge } = await import('../lib/python-mcp-bridge.js');
    const bridge   = new PythonMcpBridge({ scriptPath: 'a.py' });
    await bridge.start();

    const provider = bridge.asLLMProvider();
    await provider.complete({
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user',   content: 'Hi' },
      ],
      maxTokens:   50,
      temperature: 0,
    }, 'model');

    // Verify 'system' was sent as a key in the tool arguments
    const writeCalls = (proc.stdin.write.mock.calls as [string][])
      .map(([s]) => JSON.parse(s.trim()) as { method: string; params?: { arguments: Record<string, unknown> } });
    const toolCallArgs = writeCalls.find((r) => r.method === 'tools/call')?.params?.arguments;
    expect(toolCallArgs?.['system']).toBe('Be concise.');

    await bridge.stop();
  });

  it('complete() uses custom toolName and promptArg', async () => {
    const proc = makeMockProcess({
      'initialize': INIT_RESULT,
      'tools/list': {
        tools: [{ name: 'infer', description: 'Infer', inputSchema: {} }],
      },
      'tools/call': { content: [{ type: 'text', text: 'Inferred result' }] },
    });
    mockSpawn.mockReturnValue(proc);

    const { PythonMcpBridge } = await import('../lib/python-mcp-bridge.js');
    const bridge   = new PythonMcpBridge({ scriptPath: 'a.py' });
    await bridge.start();

    const provider = bridge.asLLMProvider({ toolName: 'infer', promptArg: 'input_text' });
    expect(await provider.isAvailable()).toBe(true);

    const res = await provider.complete(
      { messages: [{ role: 'user', content: 'test' }], maxTokens: 10, temperature: 0 },
      'model',
    );
    expect(res.content).toBe('Inferred result');

    // Verify the argument key name used
    const writeCalls = (proc.stdin.write.mock.calls as [string][])
      .map(([s]) => JSON.parse(s.trim()) as { method: string; params?: { arguments: Record<string, unknown> } });
    const callArgs = writeCalls.find((r) => r.method === 'tools/call')?.params?.arguments;
    expect(callArgs?.['input_text']).toBe('test');

    await bridge.stop();
  });

  it('provider name is "python-mcp"', async () => {
    mockSpawn.mockReturnValue(makeDefaultMock());

    const { PythonMcpBridge } = await import('../lib/python-mcp-bridge.js');
    const bridge   = new PythonMcpBridge({ scriptPath: 'a.py' });
    await bridge.start();

    expect(bridge.asLLMProvider().name).toBe('python-mcp');

    await bridge.stop();
  });
});

// ─── Tests — MCP protocol ─────────────────────────────────────────────────────

describe('PythonMcpBridge — protocol robustness', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ignores non-JSON lines written to stdout by the Python process', async () => {
    const proc = makeDefaultMock();
    mockSpawn.mockReturnValue(proc);

    const { PythonMcpBridge } = await import('../lib/python-mcp-bridge.js');
    const bridge = new PythonMcpBridge({ scriptPath: 'a.py' });
    await bridge.start();

    // Inject a non-JSON line as if Python printed debug output
    setImmediate(() => proc.stdout.emit('data', 'Debug: some Python print()\n'));

    const tools = await bridge.listTools();
    expect(tools).toHaveLength(1);

    await bridge.stop();
  });

  it('ignores JSON-RPC notifications (messages with no id)', async () => {
    const proc = makeDefaultMock();
    mockSpawn.mockReturnValue(proc);

    const { PythonMcpBridge } = await import('../lib/python-mcp-bridge.js');
    const bridge = new PythonMcpBridge({ scriptPath: 'a.py' });
    await bridge.start();

    // Inject a notification (no id field) from the server
    setImmediate(() =>
      proc.stdout.emit('data',
        JSON.stringify({ jsonrpc: '2.0', method: 'notifications/message', params: {} }) + '\n',
      ),
    );

    // Should not interfere with subsequent calls
    const tools = await bridge.listTools();
    expect(tools).toHaveLength(1);

    await bridge.stop();
  });

  it('handles chunked stdout (partial JSON-RPC lines)', async () => {
    const proc = makeDefaultMock();
    mockSpawn.mockReturnValue(proc);

    const { PythonMcpBridge } = await import('../lib/python-mcp-bridge.js');

    // Override the write mock to deliver the initialize response in two chunks
    let firstId: number | undefined;
    proc.stdin.write.mockImplementationOnce((data: string) => {
      const req = JSON.parse(data.trim()) as { id: number; method: string };
      if (req.method === 'initialize') {
        firstId = req.id;
        const full = JSON.stringify({ jsonrpc: '2.0', id: firstId, result: INIT_RESULT }) + '\n';
        const half = full.length / 2 | 0;
        setImmediate(() => proc.stdout.emit('data', full.slice(0, half)));
        setImmediate(() => proc.stdout.emit('data', full.slice(half)));
      }
    }).mockImplementation((data: string) => {
      // subsequent calls respond normally
      const req = JSON.parse(data.trim()) as { id: number; method: string };
      if (req.id === undefined) return;
      const resMap: Record<string, unknown> = {
        'tools/list': TOOLS_RESULT,
        'tools/call': CALL_RESULT,
      };
      if (req.method in resMap) {
        setImmediate(() =>
          proc.stdout.emit('data',
            JSON.stringify({ jsonrpc: '2.0', id: req.id, result: resMap[req.method] }) + '\n',
          ),
        );
      }
    });

    const bridge = new PythonMcpBridge({ scriptPath: 'a.py' });
    await bridge.start();

    const tools = await bridge.listTools();
    expect(tools).toHaveLength(1);

    await bridge.stop();
  });
});
