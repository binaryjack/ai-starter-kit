import * as fs from 'fs/promises'
import * as path from 'path'
import type { CheckContext } from '../../check-context.js'
import type { RawCheckResult } from '../../check-handler.interface.js'

export async function execute(this: unknown, ctx: CheckContext): Promise<RawCheckResult> {
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
