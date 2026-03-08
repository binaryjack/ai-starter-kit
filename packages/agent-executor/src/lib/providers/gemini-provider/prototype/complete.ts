import type { LLMPrompt, LLMResponse } from '../../../llm-provider.js';
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

export async function complete(
  this: IGeminiProvider,
  prompt: LLMPrompt,
  modelId: string,
): Promise<LLMResponse> {
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

  const url = `${GEMINI_BASE}/${modelId}:generateContent?key=${this._apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';

  return {
    content: text,
    usage: {
      inputTokens:  data.usageMetadata?.promptTokenCount     ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    },
    model:    modelId,
    provider: this.name,
  };
}
