import type { IAnthropicProvider } from './anthropic-provider.types.js'
import { complete, isAvailable, stream } from './prototype/index.js'

export const AnthropicProvider = function(
  this: IAnthropicProvider,
  apiKey?: string,
) {
  this._apiKey = apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '';
} as unknown as IAnthropicProvider;

Object.assign(AnthropicProvider.prototype, {
  name: 'anthropic' as const,
  isAvailable,
  complete,
  stream,
});
