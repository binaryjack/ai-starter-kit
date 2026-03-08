import type { IOpenAIProvider } from './openai-provider.types.js'
import { complete, isAvailable, stream } from './prototype/index.js'

export const OpenAIProvider = function(
  this: IOpenAIProvider,
  apiKey?: string,
  baseUrl?: string,
) {
  this._apiKey  = apiKey  ?? process.env['OPENAI_API_KEY'] ?? '';
  this._baseUrl = baseUrl ?? 'https://api.openai.com/v1';
} as unknown as IOpenAIProvider;

Object.assign(OpenAIProvider.prototype, {
  name: 'openai' as const,
  isAvailable,
  complete,
  stream,
});
