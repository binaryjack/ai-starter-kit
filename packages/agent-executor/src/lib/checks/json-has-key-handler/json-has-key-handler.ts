import type { IJsonHasKeyHandler } from './json-has-key-handler.types.js'
import { execute } from './prototype/index.js'

export const JsonHasKeyHandler = function (this: IJsonHasKeyHandler) {
} as unknown as IJsonHasKeyHandler;

Object.assign(JsonHasKeyHandler.prototype, {
  type: 'json-has-key' as const,
  execute,
});
