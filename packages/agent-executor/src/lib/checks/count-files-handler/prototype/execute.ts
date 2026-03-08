import * as fs from 'fs/promises'
import type { CheckContext } from '../../check-context.js'
import type { RawCheckResult } from '../../check-handler.interface.js'

export async function execute(this: unknown, ctx: CheckContext): Promise<RawCheckResult> {
  try {
    const glob = ctx.check.glob ?? '**/*';
    const entries = (await fs.readdir(ctx.fullPath, { recursive: true })) as string[];
    const ext = glob.replace('**/*', '').replace('*', '');
    const matched = entries.filter((f) => typeof f === 'string' && f.endsWith(ext));
    const count = matched.length;
    return { passed: count > 0, value: count };
  } catch {
    return { passed: false, value: 0 };
  }
}
