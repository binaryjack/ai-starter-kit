import type { LLMPrompt, LLMProvider, LLMResponse, LLMStreamChunk } from '../../llm-provider.js';

export interface IGeminiProvider extends LLMProvider {
  new(apiKey?: string): IGeminiProvider;
  readonly name: 'gemini';
  _apiKey: string;
  isAvailable(): Promise<boolean>;
  complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse>;
  stream(prompt: LLMPrompt, modelId: string): AsyncIterable<LLMStreamChunk>;
  _buildContents(prompt: LLMPrompt): {
    systemInstruction?: string;
    contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
  };
}
