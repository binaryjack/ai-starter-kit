import type { IDirExistsHandler } from './dir-exists-handler.types.js'
import { execute } from './prototype/index.js'

export const DirExistsHandler = function (this: IDirExistsHandler) {
} as unknown as IDirExistsHandler;

Object.assign(DirExistsHandler.prototype, {
  type: 'dir-exists' as const,
  execute,
});
