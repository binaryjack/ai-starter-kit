import * as fs from 'fs/promises';
import type { ICheckHandler, RawCheckResult } from './check-handler.interface.js';
import type { CheckContext } from './check-context.js';

/**
 * Checks for the existence of a key (dot-notation) in a JSON file.
 * `check.key` is the primary field name; falls back to `check.field`.
 */
export class JsonHasKeyHandler implements ICheckHandler {
  readonly type = 'json-has-key' as const;

  async execute(ctx: CheckContext): Promise<RawCheckResult> {
    try {
      const raw     = await fs.readFile(ctx.fullPath, 'utf-8');
      const json    = JSON.parse(raw);
      const keyPath = ctx.check.key ?? ctx.check.field ?? '';
      const parts   = keyPath.split('.');
      let   v: unknown = json;

      for (const part of parts) {
        v = (v as Record<string, unknown>)?.[part];
      }

      return { passed: v !== undefined && v !== null };
    } catch {
      return { passed: false };
    }
  }
}
