import type { LLMPrompt, LLMProvider, LLMResponse } from '../llm-provider.js';

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
}
