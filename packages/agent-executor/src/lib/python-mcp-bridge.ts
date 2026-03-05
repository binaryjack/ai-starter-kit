/**
 * E9 — Python MCP Bridge
 *
 * Spawns a Python subprocess that speaks the MCP (Model Context Protocol) JSON-RPC
 * wire format over stdin/stdout, and exposes its tools to the TypeScript runtime.
 *
 * The bridge handles the full MCP initialisation handshake, tool enumeration, and
 * per-call request/response routing without any external dependencies — only Node's
 * built-in `child_process` module is used.
 *
 * Architecture:
 *
 *   TypeScript host
 *     └─ PythonMcpBridge
 *           ├─ spawns: python <scriptPath> [args]
 *           ├─ initialize()       — MCP init handshake (capabilities exchange)
 *           ├─ listTools()        — MCP tools/list RPC
 *           ├─ callTool(n, args)  — MCP tools/call RPC
 *           └─ PythonMcpProvider  — LLMProvider adapter backed by a "generate" tool
 *
 * MCP wire protocol (JSON-RPC 2.0 over stdio, newline-delimited):
 *   → {"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}
 *   ← {"jsonrpc":"2.0","id":1,"result":{...}}
 *   → {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
 *   ← {"jsonrpc":"2.0","id":2,"result":{"tools":[...]}}
 *   → {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"...","arguments":{...}}}
 *   ← {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"..."}]}}
 *
 * Example Python server (minimal):
 * ```python
 * import sys, json
 * for line in sys.stdin:
 *     req = json.loads(line.strip())
 *     method = req.get("method", "")
 *     id_ = req.get("id")
 *     if method == "initialize":
 *         print(json.dumps({"jsonrpc":"2.0","id":id_,
 *             "result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}}}}), flush=True)
 *     elif method == "tools/list":
 *         print(json.dumps({"jsonrpc":"2.0","id":id_,
 *             "result":{"tools":[{"name":"generate","description":"Generate text",
 *                 "inputSchema":{"type":"object","properties":{"prompt":{"type":"string"}}}}]}}), flush=True)
 *     elif method == "tools/call":
 *         prompt = req["params"]["arguments"].get("prompt","")
 *         print(json.dumps({"jsonrpc":"2.0","id":id_,
 *             "result":{"content":[{"type":"text","text":f"Echo: {prompt}"}]}}), flush=True)
 * ```
 *
 * Usage:
 *   const bridge = new PythonMcpBridge({ scriptPath: 'my_agent.py' });
 *   await bridge.start();
 *   const tools   = await bridge.listTools();
 *   const result  = await bridge.callTool('generate', { prompt: 'Hello' });
 *   await bridge.stop();
 *
 * LLMProvider usage:
 *   const provider = bridge.asLLMProvider({ toolName: 'generate', promptArg: 'prompt' });
 *   // provider.complete(prompt, modelId) → calls python generate tool
 */

import { type ChildProcess, spawn } from 'child_process';
import type { LLMPrompt, LLMProvider, LLMResponse } from './llm-provider.js';

// ─── MCP JSON-RPC types ───────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id:      number;
  method:  string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id:      number;
  result?: unknown;
  error?:  { code: number; message: string; data?: unknown };
}

export interface McpToolDefinition {
  name:        string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  content: Array<{ type: string; text?: string; data?: unknown }>;
  isError?: boolean;
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface PythonMcpBridgeOptions {
  /**
   * Path to the Python script that provides the MCP server.
   * Resolved relative to cwd unless absolute.
   */
  scriptPath: string;
  /**
   * Python interpreter to use ('python3', 'python', or absolute path).
   * @default 'python3'
   */
  pythonBin?: string;
  /**
   * Extra CLI arguments passed to the Python script after the path.
   * @default []
   */
  args?: string[];
  /**
   * Environment variables to pass to the Python process (merged with process.env).
   */
  env?: Record<string, string>;
  /**
   * Timeout in milliseconds for each individual RPC call.
   * @default 30_000
   */
  callTimeoutMs?: number;
  /**
   * MCP client info sent during the initialize handshake.
   */
  clientInfo?: { name: string; version: string };
}

// ─── PythonMcpBridge ──────────────────────────────────────────────────────────

/**
 * Manages the lifecycle of a Python MCP subprocess and routes JSON-RPC calls
 * to and from it.
 */
export class PythonMcpBridge {
  private readonly opts: Required<PythonMcpBridgeOptions>;

  private _process:  ChildProcess | null = null;
  private _nextId =  1;
  private _pending:  Map<number, {
    resolve: (result: unknown) => void;
    reject:  (err: Error) => void;
    timer:   ReturnType<typeof setTimeout>;
  }> = new Map();

  private _buffer = '';
  private _started = false;

  constructor(opts: PythonMcpBridgeOptions) {
    this.opts = {
      pythonBin:     opts.pythonBin     ?? 'python3',
      args:          opts.args          ?? [],
      env:           opts.env           ?? {},
      callTimeoutMs: opts.callTimeoutMs ?? 30_000,
      clientInfo:    opts.clientInfo    ?? { name: 'ai-starter-kit', version: '1.0.0' },
      scriptPath:    opts.scriptPath,
    };
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Spawn the Python process and perform the MCP `initialize` handshake.
   * Must be called before any tool invocations.
   */
  async start(): Promise<void> {
    if (this._started) return;

    const proc = spawn(
      this.opts.pythonBin,
      [this.opts.scriptPath, ...this.opts.args],
      {
        env:   { ...process.env, ...this.opts.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    this._process = proc;
    this._started = true;

    // Route stdout lines to pending RPC resolvers
    proc.stdout!.setEncoding('utf-8');
    proc.stdout!.on('data', (chunk: string) => {
      this._buffer += chunk;
      const lines = this._buffer.split('\n');
      this._buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        this._handleLine(trimmed);
      }
    });

    // Propagate forward stderr for debugging
    proc.stderr?.on('data', (_d: Buffer) => { /* swallow — caller can redirect if needed */ });

    proc.on('error', (err) => {
      this._rejectAll(new Error(`Python process error: ${err.message}`));
    });

    proc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        this._rejectAll(new Error(`Python process exited with code ${code}`));
      }
    });

    // MCP initialize handshake
    await this._rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities:    {},
      clientInfo:      this.opts.clientInfo,
    });

    // Send initialized notification (no id = notification, not a request)
    this._sendNotification('notifications/initialized');
  }

  /**
   * Stop the Python subprocess and reject any in-flight calls.
   */
  async stop(): Promise<void> {
    if (!this._process) return;
    this._rejectAll(new Error('Bridge stopped'));
    this._process.stdin?.end();
    this._process.kill('SIGTERM');
    this._process  = null;
    this._started  = false;
  }

  /**
   * List all tools exposed by the Python MCP server.
   */
  async listTools(): Promise<McpToolDefinition[]> {
    const result = await this._rpc('tools/list', {});
    return ((result as { tools?: McpToolDefinition[] }).tools) ?? [];
  }

  /**
   * Call a tool on the Python MCP server.
   * @param name      Tool name as returned by `listTools()`
   * @param args      Arguments matching the tool's `inputSchema`
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const result = await this._rpc('tools/call', { name, arguments: args });
    return result as McpToolResult;
  }

  /**
   * Return an `LLMProvider` that routes `complete()` calls to a Python tool.
   *
   * @param toolName   Name of the Python tool to call (default: `'generate'`)
   * @param promptArg  Key in the tool's input schema that receives the prompt text
   *                   (default: `'prompt'`)
   */
  asLLMProvider(options: { toolName?: string; promptArg?: string } = {}): LLMProvider {
    const toolName  = options.toolName  ?? 'generate';
    const promptArg = options.promptArg ?? 'prompt';
    return new PythonMcpProvider(this, toolName, promptArg);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private _rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this._nextId++;

      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`MCP RPC timeout: ${method} (id=${id})`));
      }, this.opts.callTimeoutMs);

      this._pending.set(id, { resolve, reject, timer });

      const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
      this._write(req);
    });
  }

  private _sendNotification(method: string): void {
    this._write({ jsonrpc: '2.0', method } as unknown as JsonRpcRequest);
  }

  private _write(msg: object): void {
    if (!this._process?.stdin?.writable) {
      throw new Error('Python MCP bridge is not started');
    }
    this._process.stdin.write(JSON.stringify(msg) + '\n');
  }

  private _handleLine(line: string): void {
    let msg: JsonRpcResponse;
    try {
      msg = JSON.parse(line) as JsonRpcResponse;
    } catch {
      return; // ignore non-JSON lines (e.g. Python debug prints)
    }

    if (typeof msg.id !== 'number') return; // notification — ignore

    const pending = this._pending.get(msg.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this._pending.delete(msg.id);

    if (msg.error) {
      pending.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
    } else {
      pending.resolve(msg.result);
    }
  }

  private _rejectAll(err: Error): void {
    for (const { reject, timer } of this._pending.values()) {
      clearTimeout(timer);
      reject(err);
    }
    this._pending.clear();
  }
}

// ─── PythonMcpProvider ────────────────────────────────────────────────────────

/**
 * Adapts a PythonMcpBridge tool into the `LLMProvider` interface so Python
 * text-generation tools can participate in the model router / DAG execution.
 *
 * Assumes the Python tool accepts `{ [promptArg]: string, ...extraArgs }` and
 * returns `{ content: [{ type: 'text', text: '...' }] }`.
 */
export class PythonMcpProvider implements LLMProvider {
  readonly name = 'python-mcp';

  constructor(
    private readonly bridge:    PythonMcpBridge,
    private readonly toolName:  string,
    private readonly promptArg: string,
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      const tools = await this.bridge.listTools();
      return tools.some((t) => t.name === this.toolName);
    } catch {
      return false;
    }
  }

  async complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse> {
    const userMessages  = prompt.messages.filter((m) => m.role !== 'system');
    const systemMessages = prompt.messages.filter((m) => m.role === 'system');
    const promptText    = userMessages.map((m) => m.content).join('\n');

    const callArgs: Record<string, unknown> = {
      [this.promptArg]: promptText,
      model:            modelId,
    };

    if (systemMessages.length > 0) {
      callArgs['system'] = systemMessages.map((m) => m.content).join('\n');
    }

    if (prompt.maxTokens   !== undefined) callArgs['maxTokens']   = prompt.maxTokens;
    if (prompt.temperature !== undefined) callArgs['temperature'] = prompt.temperature;

    const result = await this.bridge.callTool(this.toolName, callArgs);

    const text = result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');

    return {
      content:  text,
      usage:    { inputTokens: 0, outputTokens: 0 },
      model:    modelId,
      provider: this.name,
    };
  }
}
