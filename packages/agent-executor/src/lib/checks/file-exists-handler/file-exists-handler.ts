import type { IFileExistsHandler } from './file-exists-handler.types.js'
import { execute } from './prototype/index.js'

export const FileExistsHandler = function (this: IFileExistsHandler) {
} as unknown as IFileExistsHandler;

Object.assign(FileExistsHandler.prototype, {
  type: 'file-exists' as const,
  execute,
});
