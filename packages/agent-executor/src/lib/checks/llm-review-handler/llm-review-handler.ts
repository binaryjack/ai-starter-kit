import type { ILlmReviewHandler } from './llm-review-handler.types.js'
import { execute } from './prototype/index.js'

export const LlmReviewHandler = function(this: ILlmReviewHandler) {
  // no-op constructor
} as unknown as ILlmReviewHandler;

Object.assign(LlmReviewHandler.prototype, {
  type: 'llm-review' as const,
  execute,
});
