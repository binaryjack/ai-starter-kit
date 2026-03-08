import type { CheckContext } from '../check-context.js'
import type { ICheckHandler, RawCheckResult } from '../check-handler.interface.js'

export interface IDirExistsHandler extends ICheckHandler {
  new(): IDirExistsHandler;
  readonly type: 'dir-exists';
  execute(ctx: CheckContext): Promise<RawCheckResult>;
}
