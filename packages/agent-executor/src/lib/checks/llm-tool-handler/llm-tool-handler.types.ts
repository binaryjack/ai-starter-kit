import type { ICheckHandler, RawCheckResult } from '../check-handler.interface.js'

export interface ILlmToolHandler extends ICheckHandler {
  new(): ILlmToolHandler;
  readonly type: 'llm-tool';
  execute(ctx: import('../check-context.js').CheckContext): Promise<RawCheckResult>;
}
