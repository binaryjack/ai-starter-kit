import type { LLMPrompt, LLMProvider, LLMResponse, LLMStreamChunk } from '../llm-provider.js'

/**
 * Anthropic Claude provider.
 * Communicates directly with api.anthropic.com.
 * Requires ANTHROPIC_API_KEY environment variable.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '';
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

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
        'x-api-key': this.apiKey,
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

  async *stream(prompt: LLMPrompt, modelId: string): AsyncIterable<LLMStreamChunk> {
    if (!this.apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

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
        'x-api-key': this.apiKey,
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
            index?: number;
            delta?: { type: string; text?: string };
            usage?: { input_tokens?: number; output_tokens?: number };
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

    yield {
      token: '',
      done:  true,
      usage: { inputTokens, outputTokens },
    };
  }
}
