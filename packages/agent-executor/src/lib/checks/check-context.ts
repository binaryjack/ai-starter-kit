/**
 * CheckContext — the execution context passed to every ICheckHandler.
 *
 * This is the single argument object each handler receives so that adding
 * new fields never requires touching handler method signatures.
 */

import type { CheckDefinition } from '../agent-types.js'
import type { ToolExecutorFn } from '../llm-provider.js'
import type { ModelRouter, RoutedResponse } from '../model-router.js'

export interface CheckContext {
  /** The check definition from the agent JSON. */
  check: CheckDefinition;

  /** Absolute path to the project being analysed. */
  projectRoot: string;

  /**
   * Resolved absolute path to `check.path` within `projectRoot`.
   * Empty string when `check.path` is not set (e.g. run-command, llm-generate).
   */
  fullPath: string;

  /**
   * Corrective instructions injected by the supervisor when check runs on RETRY.
   * `undefined` on the first attempt.
   */
  retryInstructions?: string;

  /** Model router for LLM-backed check types. `undefined` when not configured. */
  modelRouter?: ModelRouter;

  /** Optional callback fired after every LLM completion (cost tracking). */
  onLlmResponse?: (response: RoutedResponse) => void;

  /**
   * Optional callback fired for each streamed token from an LLM call.
   * When provided, tokens are printed live to stdout during llm-generate
   * and llm-review checks instead of waiting for the full response.
   */
  onLlmStream?: (token: string) => void;

  /** Optional tool executor for llm-tool checks that call built-in tools. */
  toolExecutor?: ToolExecutorFn;
}
