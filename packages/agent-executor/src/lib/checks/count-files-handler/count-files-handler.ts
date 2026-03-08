import type { ICountFilesHandler } from './count-files-handler.types.js'
import { execute } from './prototype/index.js'

export const CountFilesHandler = function (this: ICountFilesHandler) {
} as unknown as ICountFilesHandler;

Object.assign(CountFilesHandler.prototype, {
  type: 'count-files' as const,
  execute,
});
