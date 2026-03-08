import type { LLMPrompt, LLMStreamChunk } from '../../../llm-provider.js';
import type { IVSCodeSamplingProvider } from '../vscode-sampling-provider.types.js';

export async function* stream(
  this: IVSCodeSamplingProvider,
  prompt: LLMPrompt,
  modelId: string,
): AsyncIterable<LLMStreamChunk> {
  const response = await this.complete(prompt, modelId);
  yield { token: response.content, done: false };
  yield { token: '', done: true, usage: response.usage };
}
