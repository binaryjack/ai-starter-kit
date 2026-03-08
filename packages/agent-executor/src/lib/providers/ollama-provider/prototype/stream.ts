import type { LLMPrompt, LLMStreamChunk } from '../../../llm-provider.js';
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

export async function* stream(
  this: IOllamaProvider,
  prompt: LLMPrompt,
  modelId: string,
): AsyncIterable<LLMStreamChunk> {
  const messages: OllamaMessage[] = prompt.messages.map((m) => ({
    role:    m.role as OllamaMessage['role'],
    content: m.content,
  }));

  const res = await fetch(`${this._baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:   modelId,
      messages,
      stream:  true,
      options: {
        num_predict: prompt.maxTokens   ?? 4096,
        temperature: prompt.temperature ?? 0.7,
      },
    }),
  });

  if (!res.ok || !res.body) {
    const err = await res.text();
    throw new Error(`Ollama stream error ${res.status}: ${err}`);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let inputTokens  = 0;
  let outputTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value, { stream: true }).split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const chunk = JSON.parse(line) as OllamaChatResponse;
          if (chunk.message?.content) {
            outputTokens++;
            yield { token: chunk.message.content, done: false };
          }
          if (chunk.done) {
            inputTokens  = chunk.prompt_eval_count ?? inputTokens;
            outputTokens = chunk.eval_count        ?? outputTokens;
            yield { token: '', done: true, usage: { inputTokens, outputTokens } };
          }
        } catch {
          // skip unparseable lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
