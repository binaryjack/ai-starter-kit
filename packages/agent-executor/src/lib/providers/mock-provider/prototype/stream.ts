import type { LLMPrompt, LLMStreamChunk } from '../../../llm-provider.js';
import type { IMockProvider } from '../mock-provider.types.js';

export async function* stream(
  this: IMockProvider,
  prompt: LLMPrompt,
  modelId: string,
): AsyncIterable<LLMStreamChunk> {
  const response = await this.complete(prompt, modelId);
  const words    = response.content.split(/(?<= )/);
  for (const word of words) {
    yield { token: word, done: false };
    await new Promise<void>((r) => setImmediate(r));
  }
  yield { token: '', done: true, usage: response.usage };
}
