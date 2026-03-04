import type { TaskType } from '../llm-provider.js';
import type { ICheckHandler, RawCheckResult } from './check-handler.interface.js';
import type { CheckContext } from './check-context.js';

/**
 * Generates content via LLM and stores the result.
 *
 * When `check.outputKey` is set the full LLM response is stored in
 * `detail` and an early-return is signalled so the registry bypasses
 * standard message interpolation (the handler provides its own findings).
 */
export class LlmGenerateHandler implements ICheckHandler {
  readonly type = 'llm-generate' as const;

  async execute(ctx: CheckContext): Promise<RawCheckResult> {
    if (!ctx.modelRouter) {
      return {
        passed:       true, // gracefully degrade — don't block the pipeline
        extraFindings: ['⚠️ llm-generate skipped: no ModelRouter provided'],
      };
    }

    try {
      const taskType   = (ctx.check.taskType as TaskType | undefined) ?? 'code-generation';
      const promptText = (ctx.check.prompt ?? 'Analyze the project and provide actionable findings.')
        .replace('{retryContext}', ctx.retryInstructions ?? 'N/A')
        .replace('{path}',        ctx.check.path        ?? '');

      const response = await ctx.modelRouter.route(taskType, {
        messages: [
          {
            role:    'system',
            content: 'You are an expert software engineer. Be concise and specific. Output plain text findings only.',
          },
          { role: 'user', content: promptText },
        ],
      });

      ctx.onLlmResponse?.(response);

      const value  = response.content.trim();
      const passed = value.length > 0;

      if (ctx.check.outputKey) {
        return {
          passed,
          value,
          detail:      { key: ctx.check.outputKey, value: response.content },
          extraFindings: ctx.check.pass
            ? [ctx.check.pass]
            : [`💡 Generated: ${value.slice(0, 200)}`],
          extraRecommendations: ctx.check.recommendations ?? [],
          earlyReturn: true,
        };
      }

      return { passed, value };
    } catch (err) {
      return {
        passed:       false,
        extraFindings: [`❌ LLM generate failed: ${err}`],
      };
    }
  }
}
