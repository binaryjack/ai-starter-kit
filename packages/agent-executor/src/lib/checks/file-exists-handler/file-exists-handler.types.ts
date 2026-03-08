import type { CheckContext } from '../check-context.js'
import type { ICheckHandler, RawCheckResult } from '../check-handler.interface.js'

export interface IFileExistsHandler extends ICheckHandler {
  new(): IFileExistsHandler;
  readonly type: 'file-exists';
  execute(ctx: CheckContext): Promise<RawCheckResult>;
}
