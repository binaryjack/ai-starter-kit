import type { IChatRenderer } from '../chat-renderer/chat-renderer.js';
import type { TaskType } from '../llm-provider.js';
import type { IModelRouter } from '../model-router/model-router.js';
import type { QualityGrade } from '../plan-types.js';

export const PHASE_TASK_MAP: Record<string, TaskType> = {
  discover:   'file-analysis',
  synthesize: 'architecture-decision',
  decompose:  'api-design',
  wire:       'hard-barrier-resolution',
  execute:    'code-generation',
};

export interface PhaseModelAdvice {
  phase:    string;
  taskType: TaskType;
  family:   string;
  modelId:  string;
  reason:   string;
  costNote: string;
}

export interface ModelAdvisorReport {
  availableProviders: string[];
  activeProvider:     string;
  phases:             PhaseModelAdvice[];
  totalEstimate:      string;
  warnings:           string[];
}

export const STATIC_REASONS: Record<string, { reason: string; costNote: string }> = {
  discover:   {
    reason:   'Discovery is structured Q&A + lightweight acknowledgement. Haiku is fast and cheap — no complex reasoning needed.',
    costNote: '~100-300 tokens per question. Negligible cost.',
  },
  synthesize: {
    reason:   'Plan synthesis requires understanding the full discovery context and making architectural judgements. Opus handles long-range reasoning best.',
    costNote: '~2000-4000 tokens for full plan JSON. ~$0.01-0.05.',
  },
  decompose:  {
    reason:   'Sprint planning backlog generation per agent needs balanced reasoning — Sonnet produces structured output reliably without the cost of Opus.',
    costNote: '~500-1500 tokens per agent. ~$0.01-0.03/agent.',
  },
  wire:       {
    reason:   'Conflict arbitration and dependency resolution requires multi-step reasoning. Opus avoids oversimplifying complex architectural decisions.',
    costNote: '~1000-2000 tokens per decision. ~$0.02-0.08/decision.',
  },
  execute:    {
    reason:   'Code generation tasks (DAG execution) use Sonnet — it produces production-quality TypeScript/JavaScript with good error handling at a reasonable cost.',
    costNote: 'Varies by lane complexity. ~$0.02-0.20/lane.',
  },
};

export interface IPlanModelAdvisor {
  _renderer:    IChatRenderer;
  _modelRouter: IModelRouter | undefined;
  display(grade?: QualityGrade): Promise<ModelAdvisorReport>;
  _render(report: ModelAdvisorReport): void;
  _estimateTotal(grade: QualityGrade, hasProvider: boolean): string;
}

export const PlanModelAdvisor = function (
  this: IPlanModelAdvisor,
  renderer: IChatRenderer,
  modelRouter?: IModelRouter,
) {
  this._renderer    = renderer;
  this._modelRouter = modelRouter;
} as unknown as new (renderer: IChatRenderer, modelRouter?: IModelRouter) => IPlanModelAdvisor;
