/**
 * LlmToolHandler — handles the `llm-tool` check type.
 *
 * Like `llm-generate` but the LLM is given access to the built-in tools
 * (read_file, list_dir, run_shell, grep_project, write_file) and drives
 * a multi-turn tool-use loop before returning its final answer.
 *
 * Check definition example:
 * ```json
 * {
 *   "type": "llm-tool",
 *   "taskType": "code-review",
 *   "prompt": "Analyse the TypeScript source in src/ and list all exported functions.",
 *   "toolNames": ["read_file", "list_dir"],
 *   "outputKey": "exports_analysis",
 *   "pass": "✅ Analysis complete"
 * }
 * ```
 */

import type { TaskType } from '../llm-provider.js';
import type { RoutedResponse } from '../model-router.js';
import { BUILTIN_TOOL_SCHEMAS, makeBuiltinExecutor } from '../tool-executor.js';
import type { CheckContext } from './check-context.js';
import type { ICheckHandler, RawCheckResult } from './check-handler.interface.js';

export class LlmToolHandler implements ICheckHandler {
  readonly type = 'llm-tool' as const;

  async execute(ctx: CheckContext): Promise<RawCheckResult> {
    const { check, projectRoot, modelRouter, onLlmResponse } = ctx;

    if (!modelRouter) {
      return {
        passed:         false,
        extraFindings:  ['⚠️ llm-tool check skipped: no model router configured'],
        earlyReturn:    true,
      };
    }

    const taskType = (check.taskType ?? 'code-generation') as TaskType;

    // Resolve which tools to expose
    const allowedNames = check.toolNames;
    const tools = allowedNames
      ? BUILTIN_TOOL_SCHEMAS.filter((t) => allowedNames.includes(t.name))
      : BUILTIN_TOOL_SCHEMAS;

    // Prefer injected executor (allows test overrides); fall back to built-in
    const executor = ctx.toolExecutor ?? makeBuiltinExecutor(projectRoot);

    const prompt = check.prompt ?? 'Analyse this project.';
    const systemContent = [
      `You are a senior software engineer performing: ${taskType}.`,
      `Project root: ${projectRoot}`,
      check.path ? `Focus path: ${check.path}` : null,
      ctx.retryInstructions ? `\nCorrection requested: ${ctx.retryInstructions}` : null,
    ].filter(Boolean).join('\n');

    let routedResponse: RoutedResponse | undefined;

    try {
      routedResponse = await modelRouter.routeWithTools(
        taskType,
        {
          messages: [
            { role: 'system', content: systemContent },
            { role: 'user',   content: prompt },
          ],
          tools,
        },
        executor,
      );
    } catch (err) {
      return {
        passed:        false,
        extraFindings: [`❌ llm-tool failed: ${err}`],
        earlyReturn:   true,
      };
    }

    if (routedResponse) onLlmResponse?.(routedResponse);

    const value   = routedResponse.content.trim();
    const passed  = value.length > 0;

    if (check.outputKey) {
      return {
        passed,
        value,
        detail:      { key: check.outputKey, value },
        extraFindings: check.pass
          ? [check.pass]
          : [`💡 Tool analysis: ${value.slice(0, 200)}`],
        extraRecommendations: check.recommendations ?? [],
        earlyReturn: true,
      };
    }

    return { passed, value };
  }
}
