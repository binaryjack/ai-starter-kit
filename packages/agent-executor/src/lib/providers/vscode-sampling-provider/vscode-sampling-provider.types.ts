import type { LLMMessage, LLMPrompt, LLMProvider, LLMResponse, LLMStreamChunk } from '../../llm-provider.js'

export type SamplingCallback = (
  messages: LLMMessage[],
  modelHint: string,
  maxTokens: number,
) => Promise<{ content: string; model: string }>;

export interface IVSCodeSamplingProvider extends LLMProvider {
  new(callback: SamplingCallback): IVSCodeSamplingProvider;
  readonly name: 'vscode';
  _callback: SamplingCallback;
  isAvailable(): Promise<boolean>;
  complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse>;
  stream(prompt: LLMPrompt, modelId: string): AsyncIterable<LLMStreamChunk>;
}
