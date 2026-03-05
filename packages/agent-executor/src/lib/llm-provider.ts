/**
 * LLM Provider abstraction — same interface across Anthropic, OpenAI, VS Code Sampling, Mock.
 * The ModelRouter selects which provider and model based on task type.
 *
 * Task → Model family mapping:
 *   file-analysis, contract-extraction, validation  → Haiku   (fast, cheap)
 *   code-generation, refactoring, api-design        → Sonnet  (balanced)
 *   architecture-decision, security-review, barrier → Opus    (deep reasoning)
 *
 * Provider class implementations live in ./providers/ and are re-exported here
 * for backward compatibility — all existing imports of this module continue to work.
 */

// ─── Task Types ───────────────────────────────────────────────────────────────

export type TaskType =
  | 'file-analysis'           // Haiku: reading files, counting, extracting data
  | 'contract-extraction'     // Haiku: pulling schema/interface data from code
  | 'validation'              // Haiku: applying deterministic rules
  | 'code-generation'         // Sonnet: writing TypeScript/JS/CSS code
  | 'refactoring'             // Sonnet: restructuring existing code
  | 'api-design'              // Sonnet: designing interfaces and contracts
  | 'prompt-synthesis'        // Sonnet: compressing context for next agent
  | 'architecture-decision'   // Opus: long-range consequence reasoning
  | 'hard-barrier-resolution' // Opus: arbitrating cross-lane conflicts
  | 'security-review';        // Opus: adversarial thinking

export type ModelFamily = 'haiku' | 'sonnet' | 'opus';

// ─── Core Interfaces ─────────────────────────────────────────────────────────

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMPrompt {
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  /**
   * Optional set of tools to expose to the LLM for tool-use / function calling.
   * Populated by `routeWithTools()` and `llm-tool` check handlers.
   */
  tools?: LLMTool[];
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMResponse {
  content: string;
  usage: LLMUsage;
  model: string;
  provider: string;
}

// ─── Tool types (function / tool calling) ─────────────────────────────────────

/**
 * JSON-Schema-based tool descriptor forwarded to the provider's function-calling
 * API (Anthropic tool_use, OpenAI function_call, etc.).
 */
export interface LLMTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

/**
 * A single tool invocation requested by the LLM during a tool-use loop.
 * Mirrors Anthropic's `tool_use` content block and OpenAI's `function_call`.
 */
export interface LLMToolCall {
  /** Tool call ID — must be echoed back in the tool result. */
  id: string;
  /** The name of the tool to call. */
  name: string;
  /** Parsed JSON arguments for the tool. */
  input: Record<string, unknown>;
}

/**
 * Function signature for a tool executor.
 * Receives one `LLMToolCall` and returns the result as a string.
 */
export type ToolExecutorFn = (call: LLMToolCall) => Promise<string>;

/**
 * A single token chunk yielded during streaming.
 * The last chunk has `done: true` and carries the final token usage.
 */
export interface LLMStreamChunk {
  /** Incremental token text (empty string on the final done chunk) */
  token: string;
  done: boolean;
  /** Present only on the final chunk */
  usage?: LLMUsage;
}

export interface LLMProvider {
  readonly name: string;
  complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse>;
  /**
   * Optional streaming interface. When not implemented the caller should
   * fall back to `complete()` and yield the full response as a single token.
   */
  stream?(prompt: LLMPrompt, modelId: string): AsyncIterable<LLMStreamChunk>;
  /**
   * Optional tool-use interface.  When not implemented the caller falls back
   * to a plain `complete()` call (no tool invocation loop).
   */
  completeWithTools?(
    prompt: LLMPrompt,
    modelId: string,
    executor: ToolExecutorFn,
  ): Promise<LLMResponse>;
  isAvailable(): Promise<boolean>;
}

// ─── Provider implementations (re-exported for backward compatibility) ────────

export { AnthropicProvider } from './providers/anthropic.provider.js'
export { MockProvider } from './providers/mock.provider.js'
export { OpenAIProvider } from './providers/openai.provider.js'
export { VSCodeSamplingProvider } from './providers/vscode-sampling.provider.js'
export type { SamplingCallback } from './providers/vscode-sampling.provider.js'

