import * as fs   from 'fs/promises';
import * as path from 'path';
import type { ICheckHandler, RawCheckResult } from './check-handler.interface.js';
import type { CheckContext } from './check-context.js';

/**
 * Recursively searches files under `check.path` for `check.pattern`.
 * Passes when at least one file contains the pattern.
 * `value` is set to the relative path of the first matching file.
 */
export class GrepHandler implements ICheckHandler {
  readonly type = 'grep' as const;

  async execute(ctx: CheckContext): Promise<RawCheckResult> {
    try {
      const entries = (await fs.readdir(ctx.fullPath, { recursive: true })) as string[];
      const pattern = ctx.check.pattern ?? '';

      for (const entry of entries) {
        if (typeof entry !== 'string') continue;
        try {
          const content = await fs.readFile(path.join(ctx.fullPath, entry), 'utf-8');
          if (content.includes(pattern)) {
            return { passed: true, value: entry };
          }
        } catch {
          // skip unreadable files
        }
      }

      return { passed: false };
    } catch {
      return { passed: false };
    }
  }
}
