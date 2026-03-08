import type { CheckContext } from '../check-context.js'
import type { ICheckHandler, RawCheckResult } from '../check-handler.interface.js'

export interface ICountFilesHandler extends ICheckHandler {
  new(): ICountFilesHandler;
  readonly type: 'count-files';
  execute(ctx: CheckContext): Promise<RawCheckResult>;
}
