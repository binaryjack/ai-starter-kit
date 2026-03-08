import type { ICheckHandler, RawCheckResult } from '../check-handler.interface.js'

export interface ILlmReviewHandler extends ICheckHandler {
  new(): ILlmReviewHandler;
  readonly type: 'llm-review';
  execute(ctx: import('../check-context.js').CheckContext): Promise<RawCheckResult>;
}
