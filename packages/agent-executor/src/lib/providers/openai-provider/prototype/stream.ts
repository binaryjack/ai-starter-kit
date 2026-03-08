import type { LLMPrompt, LLMStreamChunk } from '../../../llm-provider.js'
import type { IOpenAIProvider } from '../openai-provider.types.js'

export async function* stream(
  this: IOpenAIProvider,
  prompt: LLMPrompt,
  modelId: string,
): AsyncIterable<LLMStreamChunk> {
  if (!this._apiKey) throw new Error('OPENAI_API_KEY is not set');

  const body = {
    model:          modelId,
    max_tokens:     prompt.maxTokens ?? 4096,
    stream:         true,
    stream_options: { include_usage: true },
    messages:       prompt.messages.map((m) => ({ role: m.role, content: m.content })),
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
    throw new Error(`OpenAI stream error ${res.status}: ${err}`);
  }

  if (!res.body) throw new Error('OpenAI stream: no response body');

  let inputTokens  = 0;
  let outputTokens = 0;
  const decoder    = new TextDecoder();
  let   buffer     = '';

  for await (const raw of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(raw, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;

      try {
        const chunk = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
          usage?:   { prompt_tokens: number; completion_tokens: number };
        };

        const token = chunk.choices?.[0]?.delta?.content;
        if (token) yield { token, done: false };

        if (chunk.usage) {
          inputTokens  = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }
      } catch {
        // skip malformed SSE lines
      }
    }
  }

  yield { token: '', done: true, usage: { inputTokens, outputTokens } };
}
