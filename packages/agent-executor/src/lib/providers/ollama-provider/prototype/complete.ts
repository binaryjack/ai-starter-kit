import type { LLMPrompt, LLMResponse } from '../../../llm-provider.js';
import type { IOllamaProvider } from '../ollama-provider.types.js';

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatResponse {
  message: { role: string; content: string };
  eval_count?: number;
  prompt_eval_count?: number;
  done: boolean;
}

export async function complete(
  this: IOllamaProvider,
  prompt: LLMPrompt,
  modelId: string,
): Promise<LLMResponse> {
  const messages: OllamaMessage[] = prompt.messages.map((m) => ({
    role:    m.role as OllamaMessage['role'],
    content: m.content,
  }));

  const res = await fetch(`${this._baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:    modelId,
      messages,
      stream:   false,
      options: {
        num_predict: prompt.maxTokens   ?? 4096,
        temperature: prompt.temperature ?? 0.7,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as OllamaChatResponse;

  return {
    content: data.message.content,
    usage: {
      inputTokens:  data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count        ?? 0,
    },
    model:    modelId,
    provider: this.name,
  };
}
