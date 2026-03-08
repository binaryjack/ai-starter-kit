import type { IGrepHandler } from './grep-handler.types.js'
import { execute } from './prototype/index.js'

export const GrepHandler = function (this: IGrepHandler) {
} as unknown as IGrepHandler;

Object.assign(GrepHandler.prototype, {
  type: 'grep' as const,
  execute,
});
