import * as fs from 'fs/promises'
import type { CheckContext } from '../../check-context.js'
import type { RawCheckResult } from '../../check-handler.interface.js'

export async function execute(this: unknown, ctx: CheckContext): Promise<RawCheckResult> {
  try {
    const raw = await fs.readFile(ctx.fullPath, 'utf-8');
    const json = JSON.parse(raw);
    const keyPath = ctx.check.key ?? ctx.check.field ?? '';
    const parts = keyPath.split('.');
    let v: unknown = json;

    for (const part of parts) {
      v = (v as Record<string, unknown>)?.[part];
    }

    return { passed: v !== undefined && v !== null };
  } catch {
    return { passed: false };
  }
}
