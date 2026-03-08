import type { CheckType } from '../../../agent-types.js';
import type { StepResult } from '../../../check-runner.js';
import type { CheckContext } from '../../check-context.js';
import type { ICheckHandler } from '../../check-handler.interface.js';
import { formatCheckResult } from '../../check-result-formatter.js';

export async function run(
  this: { _handlers: Map<CheckType, ICheckHandler> },
  ctx: CheckContext,
): Promise<StepResult> {
  const handler = this._handlers.get(ctx.check.type);

  if (!handler) {
    return {
      findings:        [`❌ Unknown check type: "${ctx.check.type}"`],
      recommendations: [],
    };
  }

  let raw;
  try {
    raw = await handler.execute(ctx);
  } catch (err) {
    return {
      findings:        [`❌ Check error: ${err}`],
      recommendations: [],
    };
  }

  if (raw.earlyReturn) {
    const findings:        string[] = [];
    const recommendations: string[] = [];
    if (ctx.retryInstructions)   findings.push(`ℹ️ Retry context: ${ctx.retryInstructions}`);
    if (raw.extraFindings)        findings.push(...raw.extraFindings);
    if (raw.extraRecommendations) recommendations.push(...raw.extraRecommendations);
    return { findings, recommendations, detail: raw.detail };
  }

  return formatCheckResult(raw, ctx.check, ctx.retryInstructions);
}
