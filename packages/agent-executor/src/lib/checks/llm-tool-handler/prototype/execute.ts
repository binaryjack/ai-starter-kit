import type { TaskType } from '../../../llm-provider.js'
import type { RoutedResponse } from '../../../model-router.js'
import { BUILTIN_TOOL_SCHEMAS, makeBuiltinExecutor } from '../../../tool-executor.js'
import type { CheckContext } from '../../check-context.js'
import type { RawCheckResult } from '../../check-handler.interface.js'

export async function execute(this: unknown, ctx: CheckContext): Promise<RawCheckResult> {
  const { check, projectRoot, modelRouter, onLlmResponse } = ctx;

  if (!modelRouter) {
    return {
      passed:        false,
      extraFindings: ['⚠️ llm-tool check skipped: no model router configured'],
      earlyReturn:   true,
    };
  }

  const taskType = (check.taskType ?? 'code-generation') as TaskType;

  const allowedNames = check.toolNames;
  const tools = allowedNames
    ? BUILTIN_TOOL_SCHEMAS.filter((t) => allowedNames.includes(t.name))
    : BUILTIN_TOOL_SCHEMAS;

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

  const value  = routedResponse.content.trim();
  const passed = value.length > 0;

  if (check.outputKey) {
    return {
      passed,
      value,
      detail:               { key: check.outputKey, value },
      extraFindings:        check.pass
        ? [check.pass]
        : [`💡 Tool analysis: ${value.slice(0, 200)}`],
      extraRecommendations: check.recommendations ?? [],
      earlyReturn:          true,
    };
  }

  return { passed, value };
}
