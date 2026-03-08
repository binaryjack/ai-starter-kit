import type { CheckContext } from '../check-context.js'
import type { ICheckHandler, RawCheckResult } from '../check-handler.interface.js'

export interface ICountDirsHandler extends ICheckHandler {
  new(): ICountDirsHandler;
  readonly type: 'count-dirs';
  execute(ctx: CheckContext): Promise<RawCheckResult>;
}
