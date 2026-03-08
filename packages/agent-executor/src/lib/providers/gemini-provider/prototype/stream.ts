import type { LLMPrompt, LLMStreamChunk } from '../../../llm-provider.js';
import type { IGeminiProvider } from '../gemini-provider.types.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiResponse {
  candidates?: Array<{
    content: { parts: Array<{ text: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

export async function* stream(
  this: IGeminiProvider,
  prompt: LLMPrompt,
  modelId: string,
): AsyncIterable<LLMStreamChunk> {
  if (!this._apiKey) throw new Error('GEMINI_API_KEY is not set');

  const { systemInstruction, contents } = this._buildContents(prompt);

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: prompt.maxTokens   ?? 4096,
      temperature:     prompt.temperature ?? 0.7,
    },
  };
  if (systemInstruction) {
    body['systemInstruction'] = { parts: [{ text: systemInstruction }] };
  }

  const url = `${GEMINI_BASE}/${modelId}:streamGenerateContent?alt=sse&key=${this._apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const err = await res.text();
    throw new Error(`Gemini stream error ${res.status}: ${err}`);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let inputTokens  = 0;
  let outputTokens = 0;

  try {
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;
        try {
          const chunk = JSON.parse(jsonStr) as GeminiResponse;
          const text = chunk.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
          if (text) yield { token: text, done: false };
          if (chunk.usageMetadata) {
            inputTokens  = chunk.usageMetadata.promptTokenCount     ?? inputTokens;
            outputTokens = chunk.usageMetadata.candidatesTokenCount ?? outputTokens;
          }
        } catch {
          // skip unparseable
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { token: '', done: true, usage: { inputTokens, outputTokens } };
}
