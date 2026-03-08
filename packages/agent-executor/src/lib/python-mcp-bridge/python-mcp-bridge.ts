import { type ChildProcess } from 'child_process';
import type { LLMProvider } from '../llm-provider.js';

export type { LLMProvider };

export interface McpToolDefinition {
  name:        string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  content: Array<{ type: string; text?: string; data?: unknown }>;
  isError?: boolean;
}

export interface PythonMcpBridgeOptions {
  scriptPath:     string;
  pythonBin?:     string;
  args?:          string[];
  env?:           Record<string, string>;
  callTimeoutMs?: number;
  clientInfo?:    { name: string; version: string };
}

interface PendingCall {
  resolve: (result: unknown) => void;
  reject:  (err: Error) => void;
  timer:   ReturnType<typeof setTimeout>;
}

export interface IPythonMcpBridge {
  _opts:     Required<PythonMcpBridgeOptions>;
  _process:  ChildProcess | null;
  _nextId:   number;
  _pending:  Map<number, PendingCall>;
  _buffer:   string;
  _started:  boolean;

  start():                                              Promise<void>;
  stop():                                               Promise<void>;
  listTools():                                          Promise<McpToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
  asLLMProvider(options?: { toolName?: string; promptArg?: string }): LLMProvider;
  _rpc(method: string, params: Record<string, unknown>):        Promise<unknown>;
  _sendNotification(method: string):                            void;
  _write(msg: object):                                          void;
  _handleLine(line: string):                                    void;
  _rejectAll(err: Error):                                       void;
}

export const PythonMcpBridge = function PythonMcpBridge(
  this: IPythonMcpBridge,
  opts: PythonMcpBridgeOptions,
) {
  this._opts = {
    pythonBin:     opts.pythonBin     ?? 'python3',
    args:          opts.args          ?? [],
    env:           opts.env           ?? {},
    callTimeoutMs: opts.callTimeoutMs ?? 30_000,
    clientInfo:    opts.clientInfo    ?? { name: 'ai-agencee', version: '1.0.0' },
    scriptPath:    opts.scriptPath,
  };
  this._process = null;
  this._nextId  = 1;
  this._pending = new Map();
  this._buffer  = '';
  this._started = false;
} as unknown as new (opts: PythonMcpBridgeOptions) => IPythonMcpBridge;

// ─── PythonMcpProvider ────────────────────────────────────────────────────────

export interface IPythonMcpProvider extends LLMProvider {
  _bridge:     IPythonMcpBridge;
  _toolName:   string;
  _promptArg:  string;
  readonly name: string;
}

export const PythonMcpProvider = function PythonMcpProvider(
  this: IPythonMcpProvider,
  bridge:    IPythonMcpBridge,
  toolName:  string,
  promptArg: string,
) {
  this._bridge    = bridge;
  this._toolName  = toolName;
  this._promptArg = promptArg;
  (this as unknown as { name: string }).name = 'python-mcp';
} as unknown as new (
  bridge:    IPythonMcpBridge,
  toolName:  string,
  promptArg: string,
) => IPythonMcpProvider;
