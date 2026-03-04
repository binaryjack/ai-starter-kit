import * as fs from 'fs/promises';
import type { ICheckHandler, RawCheckResult } from './check-handler.interface.js';
import type { CheckContext } from './check-context.js';

/** Passes when the file or directory at `check.path` exists on disk. */
export class FileExistsHandler implements ICheckHandler {
  readonly type = 'file-exists' as const;

  async execute(ctx: CheckContext): Promise<RawCheckResult> {
    try {
      await fs.access(ctx.fullPath);
      return { passed: true };
    } catch {
      return { passed: false };
    }
  }
}
