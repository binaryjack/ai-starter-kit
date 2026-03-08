import type { LLMPrompt, LLMProvider, LLMResponse, LLMStreamChunk } from '../../llm-provider.js';

export interface IBedrockProvider extends LLMProvider {
  new(options?: {
    accessKeyId?:  string;
    secretKey?:    string;
    sessionToken?: string;
    region?:       string;
  }): IBedrockProvider;
  readonly name: 'bedrock';
  _accessKeyId:  string;
  _secretKey:    string;
  _sessionToken: string | undefined;
  _region:       string;
  isAvailable(): Promise<boolean>;
  complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse>;
  stream(prompt: LLMPrompt, modelId: string): AsyncIterable<LLMStreamChunk>;
  _endpoint(modelId: string, stream: boolean): { host: string; path: string };
  _buildConverseBody(prompt: LLMPrompt): ConverseRequest;
}

export interface ConverseMessage {
  role: 'user' | 'assistant';
  content: Array<{ text: string }>;
}

export interface ConverseRequest {
  messages:         ConverseMessage[];
  system?:          Array<{ text: string }>;
  inferenceConfig?: { maxTokens?: number; temperature?: number };
}

export interface ConverseResponse {
  output?: {
    message?: {
      role: string;
      content: Array<{ text: string }>;
    };
  };
  usage?: {
    inputTokens:  number;
    outputTokens: number;
    totalTokens:  number;
  };
  stopReason?: string;
}

export interface ConverseStreamEvent {
  contentBlockDelta?: { delta?: { text?: string } };
  metadata?:          { usage?: { inputTokens: number; outputTokens: number } };
  messageStop?:       { stopReason?: string };
}

export interface ConverseMessage {
  role: 'user' | 'assistant';
  content: Array<{ text: string }>;
}

export interface ConverseRequest {
  messages:         ConverseMessage[];
  system?:          Array<{ text: string }>;
  inferenceConfig?: { maxTokens?: number; temperature?: number };
}

export interface ConverseResponse {
  output?: {
    message?: {
      role: string;
      content: Array<{ text: string }>;
    };
  };
  usage?: {
    inputTokens:  number;
    outputTokens: number;
    totalTokens:  number;
  };
  stopReason?: string;
}

export interface ConverseStreamEvent {
  contentBlockDelta?: { delta?: { text?: string } };
  metadata?:          { usage?: { inputTokens: number; outputTokens: number } };
  messageStop?:       { stopReason?: string };
}
