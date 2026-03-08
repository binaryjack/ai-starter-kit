import { isAvailable, complete, stream, _buildContents } from './prototype/index.js';
import type { IGeminiProvider } from './gemini-provider.types.js';

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
