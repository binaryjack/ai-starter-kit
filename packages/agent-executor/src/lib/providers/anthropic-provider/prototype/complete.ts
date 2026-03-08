import type { LLMPrompt, LLMResponse } from '../../../llm-provider.js'
import type { IAnthropicProvider } from '../anthropic-provider.types.js'

export async function complete(
  this: IAnthropicProvider,
  prompt: LLMPrompt,
  modelId: string,
): Promise<LLMResponse> {
  if (!this._apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const systemMsg = prompt.messages.find((m) => m.role === 'system');
  const userMsgs  = prompt.messages.filter((m) => m.role !== 'system');

  const body = {
    model: modelId,
    max_tokens: prompt.maxTokens ?? 4096,
    ...(systemMsg ? { system: systemMsg.content } : {}),
    messages: userMsgs.map((m) => ({ role: m.role, content: m.content })),
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': this._apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ text: string }>;
    usage?: { input_tokens: number; output_tokens: number };
  };

  return {
    content: data.content?.[0]?.text ?? '',
    usage: {
      inputTokens:  data.usage?.input_tokens  ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    },
    model:    modelId,
    provider: this.name,
  };
}
