import * as fs from 'fs/promises';
import type { ICheckHandler, RawCheckResult } from './check-handler.interface.js';
import type { CheckContext } from './check-context.js';

/** Counts sub-directories inside `check.path`. Passes when count > 0. */
export class CountDirsHandler implements ICheckHandler {
  readonly type = 'count-dirs' as const;

  async execute(ctx: CheckContext): Promise<RawCheckResult> {
    try {
      const entries = await fs.readdir(ctx.fullPath, { withFileTypes: true });
      const count   = entries.filter((e) => e.isDirectory()).length;
      return { passed: count > 0, value: count };
    } catch {
      return { passed: false, value: 0 };
    }
  }
}
