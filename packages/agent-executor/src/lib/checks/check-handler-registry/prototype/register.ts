import type { CheckType } from '../../agent-types.js'
import type { ICheckHandler } from '../check-handler.interface.js'

export function register(
  this: { _handlers: Map<CheckType, ICheckHandler> },
  handler: ICheckHandler,
): typeof this {
  this._handlers.set(handler.type, handler);
  return this;
}
