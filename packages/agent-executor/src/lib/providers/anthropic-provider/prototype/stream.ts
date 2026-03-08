import type { LLMPrompt, LLMStreamChunk } from '../../../llm-provider.js'
import type { IAnthropicProvider } from '../anthropic-provider.types.js'

export async function* stream(
  this: IAnthropicProvider,
  prompt: LLMPrompt,
  modelId: string,
): AsyncIterable<LLMStreamChunk> {
  if (!this._apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const systemMsg = prompt.messages.find((m) => m.role === 'system');
  const userMsgs  = prompt.messages.filter((m) => m.role !== 'system');

  const body = {
    model: modelId,
    max_tokens: prompt.maxTokens ?? 4096,
    stream: true,
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
    throw new Error(`Anthropic stream error ${res.status}: ${err}`);
  }

  if (!res.body) throw new Error('Anthropic stream: no response body');

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
        const evt = JSON.parse(payload) as {
          type: string;
          delta?: { type: string; text?: string };
          usage?: { output_tokens?: number };
          message?: { usage?: { input_tokens: number; output_tokens: number } };
        };

        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
          yield { token: evt.delta.text, done: false };
        } else if (evt.type === 'message_delta' && evt.usage) {
          outputTokens = evt.usage.output_tokens ?? 0;
        } else if (evt.type === 'message_start' && evt.message?.usage) {
          inputTokens  = evt.message.usage.input_tokens  ?? 0;
          outputTokens = evt.message.usage.output_tokens ?? 0;
        }
      } catch {
        // skip malformed SSE lines
      }
    }
  }

  yield { token: '', done: true, usage: { inputTokens, outputTokens } };
}
