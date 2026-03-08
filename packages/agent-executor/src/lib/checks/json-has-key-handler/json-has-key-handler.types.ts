import type { CheckContext } from '../check-context.js'
import type { ICheckHandler, RawCheckResult } from '../check-handler.interface.js'

export interface IJsonHasKeyHandler extends ICheckHandler {
  new(): IJsonHasKeyHandler;
  readonly type: 'json-has-key';
  execute(ctx: CheckContext): Promise<RawCheckResult>;
}
