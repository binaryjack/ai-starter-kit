import type { LLMPrompt, LLMProvider, LLMResponse, LLMStreamChunk } from '../../llm-provider.js';

export interface IAnthropicProvider extends LLMProvider {
  new(apiKey?: string): IAnthropicProvider;
  readonly name: 'anthropic';
  _apiKey: string;
  isAvailable(): Promise<boolean>;
  complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse>;
  stream(prompt: LLMPrompt, modelId: string): AsyncIterable<LLMStreamChunk>;
}
