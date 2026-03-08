import type { CheckType } from '../../agent-types.js';
import type { StepResult } from '../../check-runner.js';
import type { CheckContext } from '../check-context.js';
import type { ICheckHandler } from '../check-handler.interface.js';

export interface ICheckHandlerRegistry {
  new(): ICheckHandlerRegistry;
  register(handler: ICheckHandler): ICheckHandlerRegistry;
  discover(nodeModulesDir?: string): Promise<void>;
  run(ctx: CheckContext): Promise<StepResult>;
  /** Internal instance state — not part of the public API. */
  _handlers: Map<CheckType, ICheckHandler>;
}
