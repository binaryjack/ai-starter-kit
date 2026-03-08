import * as path from 'path';
import type { ChatRenderer } from '../chat-renderer.js';
import type { ModelRouter } from '../model-router.js';
import type {
    DiscoveryQuestion,
    DiscoveryResult,
    ModelRecommendation,
    ProjectLayer,
    QualityGrade,
    StoryType
} from '../plan-types.js';

export type { DiscoveryQuestion, DiscoveryResult };

// ─── Constants ────────────────────────────────────────────────────────────────

export const QUESTION_BANK: Omit<DiscoveryQuestion, 'answered' | 'answer'>[] = [
  {
    id: 'q-problem',
    block: 'Problem Framing',
    text: 'What problem does this project solve?  Be as specific as you can.',
    hint: 'e.g. "Freelancers waste hours creating and tracking invoices manually"',
  },
  {
    id: 'q-user',
    block: 'Problem Framing',
    text: 'Who is the primary user?  Describe the persona or role.',
    hint: 'e.g. "Freelance developers and small agencies (1–10 people)"',
  },
  {
    id: 'q-success',
    block: 'Problem Framing',
    text: 'What does success look like?  Ideally something measurable.',
    hint: 'e.g. "User can create and send an invoice in under 2 minutes"',
  },
  {
    id: 'q-stories',
    block: 'Scope Split',
    text: 'Can this be broken into independent stories or phases? (yes/no)\n'
        + '  If yes — name them briefly, one per line, then an empty line.',
    hint: 'e.g.  "Invoice CRUD\\n  Payment integration\\n  Reporting dashboard"',
  },
  {
    id: 'q-story-types',
    block: 'Scope Split',
    text: 'For each story — what type is it?\n'
        + '  Options: feature · fix · migration · poc · spike · refactor',
  },
  {
    id: 'q-layers',
    block: 'Technical Surface',
    text: 'Which layers are in scope?\n'
        + '  Comma-separated: frontend · backend · database · infra · fullstack',
  },
  {
    id: 'q-greenfield',
    block: 'Technical Surface',
    text: 'Greenfield (new codebase) or existing project?  (greenfield/existing)',
  },
  {
    id: 'q-stack',
    block: 'Technical Surface',
    text: 'Any stack constraints?  Language, framework, cloud provider.',
    hint: 'e.g. "TypeScript + React + Node + PostgreSQL on AWS"  or  "no constraints"',
  },
  {
    id: 'q-integrations',
    block: 'Technical Surface',
    text: 'External integrations?  Auth providers, payment gateways, third-party APIs.',
    hint: 'e.g. "Stripe, GitHub OAuth"  or  "none"',
  },
  {
    id: 'q-quality',
    block: 'Quality Bar',
    text: 'Expected quality grade?\n'
        + '  A) MVP         — working, minimal error handling\n'
        + '  B) Enterprise  — tested, documented, scalable, security-hardened\n'
        + '  C) POC / Stub  — structure only, implementations are stubs',
    hint: 'Type A, B, or C',
  },
  {
    id: 'q-timeline',
    block: 'Constraints',
    text: 'Timeline pressure?  (low · medium · high)',
  },
  {
    id: 'q-team',
    block: 'Constraints',
    text: 'Team size or skill constraints?  (solo · small · large)',
  },
  {
    id: 'q-budget',
    block: 'Constraints',
    text: 'Budget/cost sensitivity for LLM usage?  (low · medium · high)',
  },
];

// ─── Parsing helpers ──────────────────────────────────────────────────────────

export function parseStoryTypes(answer: string): StoryType[] {
  const map: Record<string, StoryType> = {
    feature: 'feature', fix: 'fix', migration: 'migration',
    poc: 'poc', spike: 'spike', refactor: 'refactor',
  };
  return answer.split(',').map((s) => s.trim().toLowerCase()).map((s) => map[s] ?? 'feature');
}

export function parseLayers(answer: string): ProjectLayer[] {
  const map: Record<string, ProjectLayer> = {
    frontend: 'frontend', backend: 'backend', database: 'database',
    infra: 'infra', fullstack: 'fullstack', db: 'database',
  };
  return answer.split(',').map((s) => s.trim().toLowerCase()).map((s) => map[s] ?? 'fullstack');
}

export function parseQuality(answer: string): QualityGrade {
  const a = answer.trim().toUpperCase();
  if (a === 'A' || a.includes('MVP'))                                return 'mvp';
  if (a === 'C' || a.includes('POC') || a.includes('STUB'))         return 'poc-stub';
  return 'enterprise';
}

export function buildModelRecommendation(
  grade: QualityGrade,
  budgetSensitivity: 'low' | 'medium' | 'high',
): ModelRecommendation {
  if (budgetSensitivity === 'high' || grade === 'poc-stub') {
    return {
      discovery:       'claude-haiku   (cheapest, structured Q&A)',
      planning:        'claude-haiku   (fast plan generation)',
      implementation:  'claude-haiku   (budget-first)',
      review:          'claude-haiku   (pattern matching only)',
      estimatedCostNote: 'Cost-optimised profile — haiku for all phases. ~$0.01–0.05/plan.',
    };
  }
  if (grade === 'mvp' || budgetSensitivity === 'medium') {
    return {
      discovery:       'claude-haiku   (cheap, fast)',
      planning:        'claude-sonnet  (balanced)',
      implementation:  'claude-sonnet  (code quality)',
      review:          'claude-haiku   (fast review)',
      estimatedCostNote: 'Balanced profile — sonnet for code, haiku for discovery. ~$0.10–0.50/plan.',
    };
  }
  return {
    discovery:       'claude-haiku   (cheap, fast)',
    planning:        'claude-opus    (complex reasoning)',
    implementation:  'claude-sonnet  (balanced quality)',
    review:          'claude-haiku   (audit pass)',
    estimatedCostNote: 'Enterprise profile — opus for design, sonnet for implement. ~$0.50–2.00/plan.',
  };
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IDiscoverySession {
  _renderer:    ChatRenderer;
  _stateDir:    string;
  _modelRouter: ModelRouter | undefined;
  _questions:   DiscoveryQuestion[];

  run():                                                         Promise<DiscoveryResult>;
  _acknowledgeAnswer(
    qId:        string,
    answer:     string,
    allAnswers: Record<string, string>,
  ):                                                             Promise<string>;
  _synthesizeInsights(result: DiscoveryResult):                  Promise<string | null>;
  _extractProjectName(problem: string):                          Promise<string>;
  _save(result: DiscoveryResult):                                void;
}

export const DiscoverySession = function DiscoverySession(
  this: IDiscoverySession,
  renderer:    ChatRenderer,
  projectRoot: string,
  modelRouter?: ModelRouter,
) {
  this._renderer    = renderer;
  this._stateDir    = path.join(projectRoot, '.agents', 'plan-state');
  this._modelRouter = modelRouter;
  this._questions   = QUESTION_BANK.map((q) => ({ ...q, answered: false }));
} as unknown as {
  new (renderer: ChatRenderer, projectRoot: string, modelRouter?: ModelRouter): IDiscoverySession;
  load(projectRoot: string): DiscoveryResult | null;
};
