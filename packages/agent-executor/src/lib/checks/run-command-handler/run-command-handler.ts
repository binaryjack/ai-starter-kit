import { execute } from './prototype/index.js'
import type { IRunCommandHandler } from './run-command-handler.types.js'

export const RunCommandHandler = function(this: IRunCommandHandler) {
  // no-op constructor
} as unknown as IRunCommandHandler;

Object.assign(RunCommandHandler.prototype, {
  type: 'run-command' as const,
  execute,
});
