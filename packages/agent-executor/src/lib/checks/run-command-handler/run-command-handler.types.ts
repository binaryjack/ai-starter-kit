import type { ICheckHandler, RawCheckResult } from '../check-handler.interface.js'

export interface IRunCommandHandler extends ICheckHandler {
  new(): IRunCommandHandler;
  readonly type: 'run-command';
  execute(ctx: import('../check-context.js').CheckContext): Promise<RawCheckResult>;
}
