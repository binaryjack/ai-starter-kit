import * as fs from 'fs/promises';
import type { ICheckHandler, RawCheckResult } from './check-handler.interface.js';
import type { CheckContext } from './check-context.js';

/**
 * Reads a field from a JSON file using dot-notation (`check.field`).
 * Passes when the field exists and — for objects — has at least one key.
 */
export class JsonFieldHandler implements ICheckHandler {
  readonly type = 'json-field' as const;

  async execute(ctx: CheckContext): Promise<RawCheckResult> {
    try {
      const raw   = await fs.readFile(ctx.fullPath, 'utf-8');
      const json  = JSON.parse(raw);
      const parts = (ctx.check.field ?? '').split('.');
      let   v: unknown = json;

      for (const part of parts) {
        v = (v as Record<string, unknown>)?.[part];
      }

      if (v === undefined || v === null) {
        return { passed: false };
      }

      if (typeof v === 'object') {
        const count = Object.keys(v as object).length;
        return { passed: count > 0, value: count };
      }

      return { passed: true, value: String(v) };
    } catch {
      return { passed: false };
    }
  }
}
