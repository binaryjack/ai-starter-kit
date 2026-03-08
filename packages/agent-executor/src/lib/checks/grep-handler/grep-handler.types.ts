import type { CheckContext } from '../check-context.js'
import type { ICheckHandler, RawCheckResult } from '../check-handler.interface.js'

export interface IGrepHandler extends ICheckHandler {
  new(): IGrepHandler;
  readonly type: 'grep';
  execute(ctx: CheckContext): Promise<RawCheckResult>;
}
