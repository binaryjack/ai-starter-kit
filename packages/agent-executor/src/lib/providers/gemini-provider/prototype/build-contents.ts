import type { LLMPrompt } from '../../../llm-provider.js';
import type { IGeminiProvider } from '../gemini-provider.types.js';

type GeminiContent = { role: 'user' | 'model'; parts: Array<{ text: string }> };

export function _buildContents(
  this: IGeminiProvider,
  prompt: LLMPrompt,
): { systemInstruction?: string; contents: GeminiContent[] } {
  const systemMsg  = prompt.messages.find((m) => m.role === 'system');
  const nonSystem  = prompt.messages.filter((m) => m.role !== 'system');

  const contents: GeminiContent[] = nonSystem.map((m) => ({
    role:  m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));

  return { systemInstruction: systemMsg?.content, contents };
}
