import type { LLMPrompt, LLMResponse } from '../../../llm-provider.js';
import type { IVSCodeSamplingProvider } from '../vscode-sampling-provider.types.js';

const TOKENS_PER_CHAR = 4;

export async function complete(
  this: IVSCodeSamplingProvider,
  prompt: LLMPrompt,
  modelId: string,
): Promise<LLMResponse> {
  const result = await this._callback(prompt.messages, modelId, prompt.maxTokens ?? 4096);

  const inputChars  = prompt.messages.reduce((s, m) => s + m.content.length, 0);
  const outputChars = result.content.length;

  return {
    content: result.content,
    usage: {
      inputTokens:  Math.ceil(inputChars  / TOKENS_PER_CHAR),
      outputTokens: Math.ceil(outputChars / TOKENS_PER_CHAR),
    },
    model:    result.model,
    provider: this.name,
  };
}
