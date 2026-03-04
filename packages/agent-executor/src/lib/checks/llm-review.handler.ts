import * as fs   from 'fs/promises';
import type { TaskType } from '../llm-provider.js';
import type { ICheckHandler, RawCheckResult } from './check-handler.interface.js';
import type { CheckContext } from './check-context.js';

/**
 * Reviews a file or directory via LLM and reports findings.
 *
 * Passes unless the LLM response contains explicit critical-security markers.
 * When `check.outputKey` is set the full review text is stored in detail
 * and an early-return is signalled.
 */
export class LlmReviewHandler implements ICheckHandler {
  readonly type = 'llm-review' as const;

  async execute(ctx: CheckContext): Promise<RawCheckResult> {
    if (!ctx.modelRouter) {
      return {
        passed:       true,
        extraFindings: ['⚠️ llm-review skipped: no ModelRouter provided'],
      };
    }

    try {
      // Read target (file or directory listing)
      let content = '';
      try {
        const stat = await fs.stat(ctx.fullPath);
        if (stat.isFile()) {
          content = await fs.readFile(ctx.fullPath, 'utf-8');
        } else {
          const entries = (await fs.readdir(ctx.fullPath, { recursive: true })) as string[];
          content =
            `Directory listing (${entries.length} entries):\n` +
            entries.slice(0, 50).join('\n');
        }
      } catch {
        // path not found — run the review with empty context
      }

      const taskType        = (ctx.check.taskType as TaskType | undefined) ?? 'validation';
      const promptTemplate  =
        ctx.check.prompt ??
        'Review the following and identify issues:\n\n{content}\n\nProvide specific, actionable findings.';
      const promptText = promptTemplate
        .replace('{content}',      content.slice(0, 6_000))
        .replace('{retryContext}', ctx.retryInstructions ?? 'N/A')
        .replace('{path}',         ctx.check.path        ?? '');

      const response = await ctx.modelRouter.route(taskType, {
        messages: [
          {
            role:    'system',
            content: 'You are a code reviewer. Reply with findings as a bullet list. Be specific and actionable.',
          },
          { role: 'user', content: promptText },
        ],
      });

      ctx.onLlmResponse?.(response);

      const reviewText = response.content.trim();
      const passed     =
        !reviewText.includes('CRITICAL:') &&
        !reviewText.toLowerCase().includes('security vulnerability found');

      if (ctx.check.outputKey) {
        return {
          passed,
          value:       reviewText,
          detail:      { key: ctx.check.outputKey, value: reviewText },
          extraFindings: ctx.check.pass
            ? [reviewText.slice(0, 200), ctx.check.pass]
            : [reviewText.slice(0, 300)],
          extraRecommendations: ctx.check.recommendations ?? [],
          earlyReturn: true,
        };
      }

      return { passed, value: reviewText };
    } catch (err) {
      return {
        passed:       false,
        extraFindings: [`❌ LLM review failed: ${err}`],
      };
    }
  }
}
