import type { ILlmToolHandler } from './llm-tool-handler.types.js'
import { execute } from './prototype/index.js'

export const LlmToolHandler = function(this: ILlmToolHandler) {
  // no-op constructor
} as unknown as ILlmToolHandler;

Object.assign(LlmToolHandler.prototype, {
  type: 'llm-tool' as const,
  execute,
});
