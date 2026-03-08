import type { TaskType } from '../../llm-provider.js'
import type { QualityGrade } from '../../plan-types.js'
import {
    IPlanModelAdvisor,
    ModelAdvisorReport,
    PHASE_TASK_MAP,
    PhaseModelAdvice,
    STATIC_REASONS,
} from '../plan-model-advisor.js'

export async function display(
  this: IPlanModelAdvisor,
  grade: QualityGrade = 'enterprise',
): Promise<ModelAdvisorReport> {
  const router    = this._modelRouter;
  const available = router?.registeredProviders() ?? [];
  const active    = router?.defaultProvider() ?? 'none';
  const warnings: string[] = [];

  if (available.length === 0) {
    warnings.push('No LLM provider available — all AI reasoning will use deterministic fallbacks.');
    warnings.push('Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable AI-backed planning.');
  }

  const phases: PhaseModelAdvice[] = [];
  for (const [phase, taskType] of Object.entries(PHASE_TASK_MAP)) {
    let family  = 'sonnet';
    let modelId = 'unavailable';

    if (router && available.length > 0) {
      try {
        const profile = router.profileFor(taskType);
        family  = profile.family;
        modelId = router.modelIdFor(taskType);
      } catch { /* provider not configured */ }
    } else {
      const familyMap: Record<TaskType, string> = {
        'file-analysis':           'haiku',
        'contract-extraction':     'haiku',
        'validation':              'haiku',
        'prompt-synthesis':        'sonnet',
        'code-generation':         'sonnet',
        'refactoring':             'sonnet',
        'api-design':              'sonnet',
        'architecture-decision':   'opus',
        'hard-barrier-resolution': 'opus',
        'security-review':         'opus',
      };
      family  = familyMap[taskType] ?? 'sonnet';
      modelId = `[${family}]`;
    }

    const staticReason = STATIC_REASONS[phase]!;
    let reason   = staticReason.reason;
    let costNote = staticReason.costNote;

    if (router && available.length > 0) {
      try {
        const resp = await router.route('file-analysis', {
          messages: [
            {
              role: 'system',
              content:
                'You are an AI architecture advisor. In 1-2 sentences, explain why '
                + `using the ${family} model family is optimal for the "${phase}" phase `
                + 'of an AI-driven project planning system. Be specific about the '
                + 'capability vs cost trade-off. No markdown.',
            },
            { role: 'user', content: `Phase: ${phase}, task type: ${taskType}, grade: ${grade}` },
          ],
          maxTokens: 120,
        });
        if (resp.content.trim().length > 10) {
          reason = resp.content.trim();
        }
      } catch { /* use static reason */ }
    }

    phases.push({ phase, taskType, family, modelId, reason, costNote });
  }

  const totalEstimate = this._estimateTotal(grade, available.length > 0);
  const report: ModelAdvisorReport = {
    availableProviders: available,
    activeProvider:     active,
    phases,
    totalEstimate,
    warnings,
  };

  this._render(report);
  return report;
}

export function _render(this: IPlanModelAdvisor, report: ModelAdvisorReport): void {
  const r = this._renderer;

  r.separator('═');
  r.say('system', '🧠 MODEL ADVISOR — Phase-by-Phase Recommendation');
  r.separator('─');

  if (report.availableProviders.length > 0) {
    r.say('system', `Active provider : ${report.activeProvider}`);
    r.say('system', `Available       : ${report.availableProviders.join(', ')}`);
  } else {
    r.warn('No providers registered — running in heuristic (no-LLM) mode');
    r.say('system', 'To enable AI: set ANTHROPIC_API_KEY or OPENAI_API_KEY');
  }

  r.newline();
  r.say('system', 'Recommended model per phase:');
  r.newline();

  for (const p of report.phases) {
    const familyIcon = p.family === 'opus' ? '🔵' : p.family === 'sonnet' ? '🟡' : '🟢';
    r.say('system', `  ${familyIcon} ${p.phase.padEnd(12)} ${p.family.padEnd(8)} ${p.modelId}`);
    r.say('system', `     ↳ ${p.reason}`);
    r.say('system', `     💰 ${p.costNote}`);
    r.newline();
  }

  r.separator('─');
  r.say('system', `Total plan estimate: ${report.totalEstimate}`);

  if (report.warnings.length > 0) {
    r.newline();
    for (const w of report.warnings) r.warn(w);
  }

  r.say('system', 'Override provider with: --provider anthropic | openai | vscode');
  r.separator('═');
  r.newline();
}

export function _estimateTotal(
  this: IPlanModelAdvisor,
  grade: QualityGrade,
  hasProvider: boolean,
): string {
  if (!hasProvider) return '$0.00 (no LLM provider — heuristic mode)';
  switch (grade) {
    case 'poc-stub':   return '~$0.01–0.05 (haiku throughout)';
    case 'mvp':        return '~$0.05–0.30 (haiku + sonnet mix)';
    case 'enterprise': return '~$0.30–2.00 (haiku + sonnet + opus)';
  }
}
