import type { LLMPrompt, LLMProvider, LLMResponse, LLMStreamChunk } from '../llm-provider.js'

/**
 * OpenAI / Azure OpenAI provider.
 * The `baseUrl` parameter defaults to the public OpenAI endpoint but can
 * be overridden to point at an Azure OpenAI deployment or a local proxy.
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey  = apiKey  ?? process.env['OPENAI_API_KEY'] ?? '';
    this.baseUrl = baseUrl ?? 'https://api.openai.com/v1';
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY is not set');

    const body = {
      model: modelId,
      max_tokens: prompt.maxTokens ?? 4096,
      messages: prompt.messages.map((m) => ({ role: m.role, content: m.content })),
    };

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      content: data.choices?.[0]?.message?.content ?? '',
      usage: {
        inputTokens:  data.usage?.prompt_tokens      ?? 0,
        outputTokens: data.usage?.completion_tokens  ?? 0,
      },
      model:    modelId,
      provider: this.name,
    };
  }

  async *stream(prompt: LLMPrompt, modelId: string): AsyncIterable<LLMStreamChunk> {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY is not set');

    const body = {
      model: modelId,
      max_tokens: prompt.maxTokens ?? 4096,
      stream: true,
      stream_options: { include_usage: true },
      messages: prompt.messages.map((m) => ({ role: m.role, content: m.content })),
    };

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
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

          // usage is in the last non-[DONE] chunk when stream_options.include_usage is set
          if (chunk.usage) {
            inputTokens  = chunk.usage.prompt_tokens;
            outputTokens = chunk.usage.completion_tokens;
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
