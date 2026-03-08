import * as fs from 'fs/promises'
import type { CheckContext } from '../../check-context.js'
import type { RawCheckResult } from '../../check-handler.interface.js'

export async function execute(this: unknown, ctx: CheckContext): Promise<RawCheckResult> {
  try {
    await fs.access(ctx.fullPath);
    return { passed: true };
  } catch {
    return { passed: false };
  }
}
