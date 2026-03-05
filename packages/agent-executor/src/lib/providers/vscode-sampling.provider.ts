import type { LLMMessage, LLMPrompt, LLMProvider, LLMResponse, LLMStreamChunk } from '../llm-provider.js'

// ─── SamplingCallback ─────────────────────────────────────────────────────────
//
// Injected by the MCP bridge (packages/mcp/src/vscode-lm-bridge.ts).
// The MCP client (VS Code Copilot) makes the actual LLM call on our behalf — no
// API key required; uses the user's existing VS Code model configuration.

export type SamplingCallback = (
  messages: LLMMessage[],
  modelHint: string,
  maxTokens: number,
) => Promise<{ content: string; model: string }>;

// Approximate character-to-token ratio used when counting tokens locally.
// The VS Code sampling API does not return exact token counts.
const TOKENS_PER_CHAR = 4;

/**
 * VS Code Language Model provider.
 * Delegates completion to a `SamplingCallback` supplied by the MCP bridge.
 * Does not require any API key.
 */
export class VSCodeSamplingProvider implements LLMProvider {
  readonly name = 'vscode';
  private readonly callback: SamplingCallback;

  constructor(callback: SamplingCallback) {
    this.callback = callback;
  }

  async isAvailable(): Promise<boolean> {
    return true; // callback injected at construction — always available
  }

  async complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse> {
    const result = await this.callback(prompt.messages, modelId, prompt.maxTokens ?? 4096);

    // VS Code sampling doesn't return exact token counts — estimate from chars
    const inputChars  = prompt.messages.reduce((s, m) => s + m.content.length, 0);
    const outputChars = result.content.length;

    return {
      content: result.content,
      usage: {
        inputTokens:  Math.ceil(inputChars  / TOKENS_PER_CHAR),
        outputTokens: Math.ceil(outputChars / TOKENS_PER_CHAR),
      },
      model:    result.model,
      provider: this.name,
    };
  }

  /**
   * VS Code Sampling API does not expose a streaming endpoint.
   * We fall back to `complete()` and yield the full response as a single token,
   * then a done sentinel — callers see one big chunk but the interface is satisfied.
   */
  async *stream(prompt: LLMPrompt, modelId: string): AsyncIterable<LLMStreamChunk> {
    const response = await this.complete(prompt, modelId);
    yield { token: response.content, done: false };
    yield { token: '', done: true, usage: response.usage };
  }
}
