import * as fs from 'fs/promises'
import type { CheckContext } from '../../check-context.js'
import type { RawCheckResult } from '../../check-handler.interface.js'

export async function execute(this: unknown, ctx: CheckContext): Promise<RawCheckResult> {
  try {
    const entries = await fs.readdir(ctx.fullPath, { withFileTypes: true });
    const count = entries.filter((e) => e.isDirectory()).length;
    return { passed: count > 0, value: count };
  } catch {
    return { passed: false, value: 0 };
  }
}
