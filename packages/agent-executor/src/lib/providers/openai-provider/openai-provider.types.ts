import type { LLMPrompt, LLMProvider, LLMResponse, LLMStreamChunk } from '../../llm-provider.js';

export interface IOpenAIProvider extends LLMProvider {
  new(apiKey?: string, baseUrl?: string): IOpenAIProvider;
  readonly name: 'openai';
  _apiKey: string;
  _baseUrl: string;
  isAvailable(): Promise<boolean>;
  complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse>;
  stream(prompt: LLMPrompt, modelId: string): AsyncIterable<LLMStreamChunk>;
}
