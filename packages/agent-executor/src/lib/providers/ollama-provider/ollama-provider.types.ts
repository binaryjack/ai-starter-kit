import type { LLMPrompt, LLMProvider, LLMResponse, LLMStreamChunk } from '../../llm-provider.js';

export interface IOllamaProvider extends LLMProvider {
  new(baseUrl?: string): IOllamaProvider;
  readonly name: 'ollama';
  _baseUrl: string;
  isAvailable(): Promise<boolean>;
  complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse>;
  stream(prompt: LLMPrompt, modelId: string): AsyncIterable<LLMStreamChunk>;
}
