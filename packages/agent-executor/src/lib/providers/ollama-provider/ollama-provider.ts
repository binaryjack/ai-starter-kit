import { isAvailable, complete, stream } from './prototype/index.js';
import type { IOllamaProvider } from './ollama-provider.types.js';

export const OllamaProvider = function(
  this: IOllamaProvider,
  baseUrl?: string,
) {
  this._baseUrl = baseUrl ?? process.env['OLLAMA_HOST'] ?? 'http://localhost:11434';
} as unknown as IOllamaProvider;

Object.assign(OllamaProvider.prototype, {
  name: 'ollama' as const,
  isAvailable,
  complete,
  stream,
});
