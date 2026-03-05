import { CheckDefinition } from './agent-types.js';
import { CheckHandlerRegistry } from './checks/check-handler-registry.js';
import { ModelRouter, RoutedResponse } from './model-router.js';

// ─── StepResult ───────────────────────────────────────────────────────────────

export interface StepResult {
  findings: string[];
  recommendations: string[];
  detail?: { key: string; value: unknown };
}

// ─── runCheckStep ─────────────────────────────────────────────────────────────

/**
 * Execute a single check against the project root.
 *
 * Supports:
 *   - Filesystem checks: file-exists, dir-exists, count-dirs, count-files,
 *     json-field, json-has-key, grep
 *   - Shell checks: run-command (safe, timeout-bounded)
 *   - LLM checks: llm-generate, llm-review (gracefully skipped when no router)
 *
 * @param check             Check definition from the agent JSON
 * @param projectRoot       Absolute path to the project being analysed
 * @param retryInstructions Corrective context injected by the supervisor on RETRY
 * @param modelRouter       Optional router — required for llm-* check types
 * @param onLlmResponse     Optional callback fired after every LLM call (cost tracking)
 * @param onLlmStream       Optional callback fired for each streamed token (live output)
 */
export async function runCheckStep(
  check: CheckDefinition,
  projectRoot: string,
  retryInstructions?: string,
  modelRouter?: ModelRouter,
  onLlmResponse?: (response: RoutedResponse) => void,
  onLlmStream?: (token: string) => void,
): Promise<StepResult> {
  const registry = CheckHandlerRegistry.createDefault(modelRouter, onLlmResponse);
  const ctx      = CheckHandlerRegistry.buildContext(
    check,
    projectRoot,
    retryInstructions,
    modelRouter,
    onLlmResponse,
    onLlmStream,
  );
  return registry.run(ctx);
}

