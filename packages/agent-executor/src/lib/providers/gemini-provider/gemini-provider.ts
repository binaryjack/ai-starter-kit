import type { IGeminiProvider } from './gemini-provider.types.js';
import { _buildContents, complete, isAvailable, stream } from './prototype/index.js';

export const GeminiProvider = function(
  this: IGeminiProvider,
  apiKey?: string,
) {
  this._apiKey = apiKey ?? process.env['GEMINI_API_KEY'] ?? '';
} as unknown as IGeminiProvider;

Object.assign(GeminiProvider.prototype, {
  name: 'gemini' as const,
  isAvailable,
  complete,
  stream,
  _buildContents,
});
