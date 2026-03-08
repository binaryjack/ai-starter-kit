import type { IMockProvider } from './mock-provider.types.js'
import { complete, isAvailable, stream } from './prototype/index.js'

export const MockProvider = function(
  this: IMockProvider,
  responses: Record<string, string> = {},
) {
  this._responses = new Map(Object.entries(responses));
} as unknown as IMockProvider;

Object.assign(MockProvider.prototype, {
  name: 'mock' as const,
  isAvailable,
  complete,
  stream,
});
