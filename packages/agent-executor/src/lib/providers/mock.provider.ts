import type { LLMPrompt, LLMProvider, LLMResponse, LLMStreamChunk } from '../llm-provider.js'

/**
 * Mock LLM provider for unit tests.
 *
 * Responses are keyed on the first 50 characters of the last user message
 * (same heuristic as in the original llm-provider.ts).  A `'default'` key
 * acts as a catch-all fallback.
 */
export class MockProvider implements LLMProvider {
  readonly name = 'mock';
  private readonly responses: Map<string, string>;

  constructor(responses: Record<string, string> = {}) {
    this.responses = new Map(Object.entries(responses));
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse> {
    // Match on the first 50 chars of the last user message, or fall back to 'default'
    const lastUser = [...prompt.messages].reverse().find((m) => m.role === 'user');
    const key      = lastUser?.content.slice(0, 50) ?? 'default';
    const content  =
      this.responses.get(key)    ??
      this.responses.get('default') ??
      '{"status":"ok","findings":[],"recommendations":[],"details":{}}';

    return {
      content,
      usage:    { inputTokens: 100, outputTokens: 50 },
      model:    modelId,
      provider: this.name,
    };
  }

  /**
   * Simulate streaming by splitting the response into word-level tokens.
   * Adds a 1ms delay between tokens so downstream consumers see incremental output.
   */
  async *stream(prompt: LLMPrompt, modelId: string): AsyncIterable<LLMStreamChunk> {
    const response = await this.complete(prompt, modelId);
    const words    = response.content.split(/(?<= )/);
    for (const word of words) {
      yield { token: word, done: false };
      // tiny async yield so the event loop can interleave other operations
      await new Promise<void>((r) => setImmediate(r));
    }
    yield { token: '', done: true, usage: response.usage };
  }
}
