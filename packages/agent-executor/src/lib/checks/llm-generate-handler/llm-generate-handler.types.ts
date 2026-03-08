import type { ICheckHandler, RawCheckResult } from '../check-handler.interface.js'

export interface ILlmGenerateHandler extends ICheckHandler {
  new(): ILlmGenerateHandler;
  readonly type: 'llm-generate';
  execute(ctx: import('../check-context.js').CheckContext): Promise<RawCheckResult>;
}
