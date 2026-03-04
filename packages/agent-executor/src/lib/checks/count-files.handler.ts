import * as fs from 'fs/promises';
import type { ICheckHandler, RawCheckResult } from './check-handler.interface.js';
import type { CheckContext } from './check-context.js';

/**
 * Counts files under `check.path` matching `check.glob`.
 * The glob is simplified to a file-extension filter (e.g. `**\/*.ts` → `.ts`).
 * Passes when the count > 0.
 */
export class CountFilesHandler implements ICheckHandler {
  readonly type = 'count-files' as const;

  async execute(ctx: CheckContext): Promise<RawCheckResult> {
    try {
      const glob    = ctx.check.glob ?? '**/*';
      const entries = (await fs.readdir(ctx.fullPath, { recursive: true })) as string[];
      const ext     = glob.replace('**/*', '').replace('*', '');
      const matched = entries.filter((f) => typeof f === 'string' && f.endsWith(ext));
      const count   = matched.length;
      return { passed: count > 0, value: count };
    } catch {
      return { passed: false, value: 0 };
    }
  }
}
