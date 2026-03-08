import type { LLMPrompt, LLMResponse } from '../../../llm-provider.js'
import type { IOpenAIProvider } from '../openai-provider.types.js'

export async function complete(
  this: IOpenAIProvider,
  prompt: LLMPrompt,
  modelId: string,
): Promise<LLMResponse> {
  if (!this._apiKey) throw new Error('OPENAI_API_KEY is not set');

  const body = {
    model:      modelId,
    max_tokens: prompt.maxTokens ?? 4096,
    messages:   prompt.messages.map((m) => ({ role: m.role, content: m.content })),
  };

  const res = await fetch(`${this._baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this._apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message: { content: string } }>;
    usage?:   { prompt_tokens: number; completion_tokens: number };
  };

  return {
    content: data.choices?.[0]?.message?.content ?? '',
    usage: {
      inputTokens:  data.usage?.prompt_tokens     ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    },
    model:    modelId,
    provider: this.name,
  };
}
