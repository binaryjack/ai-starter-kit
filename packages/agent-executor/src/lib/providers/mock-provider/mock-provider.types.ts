import type { LLMPrompt, LLMProvider, LLMResponse, LLMStreamChunk } from '../../llm-provider.js';

export interface IMockProvider extends LLMProvider {
  new(responses?: Record<string, string>): IMockProvider;
  readonly name: 'mock';
  _responses: Map<string, string>;
  isAvailable(): Promise<boolean>;
  complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse>;
  stream(prompt: LLMPrompt, modelId: string): AsyncIterable<LLMStreamChunk>;
}
