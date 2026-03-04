/**
 * ICheckHandler — Strategy interface for individual check implementations.
 *
 * Each check type (file-exists, run-command, llm-review, …) is implemented
 * as a class that satisfies this interface.  The CheckHandlerRegistry
 * maps CheckType → ICheckHandler and dispatches accordingly.
 */

import type { CheckType } from '../agent-types.js';
import type { CheckContext } from './check-context.js';

// ─── Raw result ────────────────────────────────────────────────────────────────

/**
 * The primitive result returned by a handler's execute() method.
 * The CheckHandlerRegistry translates this into a full StepResult using
 * CheckResultFormatter after dispatch.
 */
export interface RawCheckResult {
  /** Whether the check passed. */
  passed: boolean;

  /**
   * Optional scalar value (count, matched path, command output snippet, …).
   * Used in `{value}` / `{count}` placeholder interpolation.
   */
  value?: string | number;

  /**
   * Key/value pair stored in StepResult.detail.
   * Used by LLM handlers to expose generated content for downstream lanes.
   */
  detail?: { key: string; value: unknown };

  /**
   * Pre-formatted findings to append verbatim (used by LLM handlers that
   * want custom formatting, e.g. llm-generate outputKey flow).
   */
  extraFindings?: string[];

  /**
   * Pre-formatted recommendations to append verbatim.
   */
  extraRecommendations?: string[];

  /**
   * When true, the caller (registry) should return this RawCheckResult as-is
   * without any further message interpolation.  Used by llm-generate outputKey.
   */
  earlyReturn?: boolean;
}

// ─── Handler interface ─────────────────────────────────────────────────────────

export interface ICheckHandler {
  /** The CheckType this handler is responsible for. */
  readonly type: CheckType;

  /**
   * Execute the check within the given context.
   * Must not throw — catch internal errors and reflect them in the returned result.
   */
  execute(ctx: CheckContext): Promise<RawCheckResult>;
}
