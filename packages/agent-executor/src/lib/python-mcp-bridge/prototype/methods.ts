import { spawn } from 'child_process'
import type { LLMPrompt, LLMResponse } from '../../llm-provider.js'
import {
    IPythonMcpBridge,
    IPythonMcpProvider,
    McpToolDefinition,
    McpToolResult,
    PythonMcpProvider
} from '../python-mcp-bridge.js'

// ─── PythonMcpBridge methods ─────────────────────────────────────────────────

export async function start(this: IPythonMcpBridge): Promise<void> {
  if (this._started) return;

  const proc = spawn(
    this._opts.pythonBin,
    [this._opts.scriptPath, ...this._opts.args],
    {
      env:   { ...process.env, ...this._opts.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  this._process = proc;
  this._started = true;

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

  proc.stderr?.on('data', (_d: Buffer) => { /* forward stderr for debugging */ });

  proc.on('error', (err: Error) => {
    this._rejectAll(new Error(`Python process error: ${err.message}`));
  });

  proc.on('exit', (code: number | null) => {
    if (code !== 0 && code !== null) {
      this._rejectAll(new Error(`Python process exited with code ${code}`));
    }
  });

  await this._rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities:    {},
    clientInfo:      this._opts.clientInfo,
  });

  this._sendNotification('notifications/initialized');
}

export async function stop(this: IPythonMcpBridge): Promise<void> {
  if (!this._process) return;
  this._rejectAll(new Error('Bridge stopped'));
  this._process.stdin?.end();
  this._process.kill('SIGTERM');
  this._process = null;
  this._started = false;
}

export async function listTools(this: IPythonMcpBridge): Promise<McpToolDefinition[]> {
  const result = await this._rpc('tools/list', {});
  return ((result as { tools?: McpToolDefinition[] }).tools) ?? [];
}

export async function callTool(
  this: IPythonMcpBridge,
  name: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const result = await this._rpc('tools/call', { name, arguments: args });
  return result as McpToolResult;
}

export function asLLMProvider(
  this: IPythonMcpBridge,
  options: { toolName?: string; promptArg?: string } = {},
): import('../../llm-provider.js').LLMProvider {
  const toolName  = options.toolName  ?? 'generate';
  const promptArg = options.promptArg ?? 'prompt';
  return new PythonMcpProvider(this, toolName, promptArg);
}

export function _rpc(
  this: IPythonMcpBridge,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = this._nextId++;

    const timer = setTimeout(() => {
      this._pending.delete(id);
      reject(new Error(`MCP RPC timeout: ${method} (id=${id})`));
    }, this._opts.callTimeoutMs);

    this._pending.set(id, { resolve, reject, timer });

    const req = { jsonrpc: '2.0' as const, id, method, params };
    this._write(req);
  });
}

export function _sendNotification(this: IPythonMcpBridge, method: string): void {
  this._write({ jsonrpc: '2.0', method });
}

export function _write(this: IPythonMcpBridge, msg: object): void {
  if (!this._process?.stdin?.writable) {
    throw new Error('Python MCP bridge is not started');
  }
  this._process.stdin.write(JSON.stringify(msg) + '\n');
}

export function _handleLine(this: IPythonMcpBridge, line: string): void {
  let msg: { jsonrpc: string; id?: number; result?: unknown; error?: { code: number; message: string } };
  try {
    msg = JSON.parse(line) as typeof msg;
  } catch {
    return;
  }

  if (typeof msg.id !== 'number') return;

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

export function _rejectAll(this: IPythonMcpBridge, err: Error): void {
  for (const { reject, timer } of this._pending.values()) {
    clearTimeout(timer);
    reject(err);
  }
  this._pending.clear();
}

// ─── PythonMcpProvider methods ───────────────────────────────────────────────

export async function isAvailable(this: IPythonMcpProvider): Promise<boolean> {
  try {
    const tools = await this._bridge.listTools();
    return tools.some((t) => t.name === this._toolName);
  } catch {
    return false;
  }
}

export async function complete(
  this: IPythonMcpProvider,
  prompt: LLMPrompt,
  modelId: string,
): Promise<LLMResponse> {
  const userMessages   = prompt.messages.filter((m) => m.role !== 'system');
  const systemMessages = prompt.messages.filter((m) => m.role === 'system');
  const promptText     = userMessages.map((m) => m.content).join('\n');

  const callArgs: Record<string, unknown> = {
    [this._promptArg]: promptText,
    model:             modelId,
  };

  if (systemMessages.length > 0) {
    callArgs['system'] = systemMessages.map((m) => m.content).join('\n');
  }

  if (prompt.maxTokens   !== undefined) callArgs['maxTokens']   = prompt.maxTokens;
  if (prompt.temperature !== undefined) callArgs['temperature'] = prompt.temperature;

  const result = await this._bridge.callTool(this._toolName, callArgs);

  const text = result.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('');

  return {
    content:  text,
    usage:    { inputTokens: 0, outputTokens: 0 },
    model:    modelId,
    provider: 'python-mcp',
  };
}
