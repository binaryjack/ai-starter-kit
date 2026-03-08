import type { ICheckHandler, RawCheckResult } from '../check-handler.interface.js'

export interface IJsonFieldHandler extends ICheckHandler {
  new(): IJsonFieldHandler;
  readonly type: 'json-field';
  execute(ctx: import('../check-context.js').CheckContext): Promise<RawCheckResult>;
}
