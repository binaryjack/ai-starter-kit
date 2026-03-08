import type { LLMPrompt, LLMResponse } from '../../../llm-provider.js'
import type { IMockProvider } from '../mock-provider.types.js'

export async function complete(
  this: IMockProvider,
  prompt: LLMPrompt,
  modelId: string,
): Promise<LLMResponse> {
  const lastUser = [...prompt.messages].reverse().find((m) => m.role === 'user');
  const key      = lastUser?.content.slice(0, 50) ?? 'default';
  const content  =
    this._responses.get(key)       ??
    this._responses.get('default') ??
    '{"status":"ok","findings":[],"recommendations":[],"details":{}}';

  return {
    content,
    usage:    { inputTokens: 100, outputTokens: 50 },
    model:    modelId,
    provider: this.name,
  };
}
