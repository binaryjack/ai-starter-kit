import type { TaskType } from '../../../llm-provider.js'
import type { RoutedResponse } from '../../../model-router.js'
import type { CheckContext } from '../../check-context.js'
import type { RawCheckResult } from '../../check-handler.interface.js'

export async function execute(this: unknown, ctx: CheckContext): Promise<RawCheckResult> {
  if (!ctx.modelRouter) {
    return {
      passed:        true,
      extraFindings: ['⚠️ llm-generate skipped: no ModelRouter provided'],
    };
  }

  try {
    const taskType   = (ctx.check.taskType as TaskType | undefined) ?? 'code-generation';
    const promptText = (ctx.check.prompt ?? 'Analyze the project and provide actionable findings.')
      .replace('{retryContext}', ctx.retryInstructions ?? 'N/A')
      .replace('{path}',        ctx.check.path        ?? '');

    const messages = [
      {
        role:    'system' as const,
        content: 'You are an expert software engineer. Be concise and specific. Output plain text findings only.',
      },
      { role: 'user' as const, content: promptText },
    ];

    let fullContent = '';
    let routedResponse: RoutedResponse | undefined;

    if (ctx.onLlmStream) {
      await (async () => {
        for await (const token of ctx.modelRouter!.streamRoute(
          taskType,
          { messages },
          undefined,
          (r) => { routedResponse = r; },
        )) {
          fullContent += token;
          ctx.onLlmStream!(token);
        }
      })();
    } else {
      const response = await ctx.modelRouter!.route(taskType, { messages });
      routedResponse = response;
      fullContent    = response.content.trim();
    }

    if (routedResponse) ctx.onLlmResponse?.(routedResponse);

    const value  = fullContent.trim();
    const passed = value.length > 0;

    if (ctx.check.outputKey) {
      return {
        passed,
        value,
        detail:               { key: ctx.check.outputKey, value: fullContent },
        extraFindings:        ctx.check.pass
          ? [ctx.check.pass]
          : [`💡 Generated: ${value.slice(0, 200)}`],
        extraRecommendations: ctx.check.recommendations ?? [],
        earlyReturn:          true,
      };
    }

    return { passed, value };
  } catch (err) {
    return {
      passed:        false,
      extraFindings: [`❌ LLM generate failed: ${err}`],
    };
  }
}
