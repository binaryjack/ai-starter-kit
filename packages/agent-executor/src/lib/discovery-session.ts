/**
 * Discovery Session — Phase 0
 *
 * The BA interviews the user through five structured question blocks.
 * No other agents are involved at this stage.
 *
 * Output: DiscoveryResult — saved to .agents/plan-state/discovery.json
 *
 * Runs fully without LLM when no ModelRouter is provided (structured
 * questionnaire mode).  When a ModelRouter is provided the BA's follow-up
 * comments and reflections are LLM-generated.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ChatRenderer, promptUser } from './chat-renderer.js';
import type {
    DiscoveryQuestion,
    DiscoveryResult,
    ModelRecommendation,
    ProjectLayer,
    QualityGrade,
    StoryDefinition,
    StoryType,
} from './plan-types.js';

// ─── Question bank ─────────────────────────────────────────────────────────────

const QUESTION_BANK: Omit<DiscoveryQuestion, 'answered' | 'answer'>[] = [
  // Block 1 — Problem framing
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
  // Block 2 — Scope
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
  // Block 3 — Technical surface
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
  // Block 4 — Quality bar
  {
    id: 'q-quality',
    block: 'Quality Bar',
    text: 'Expected quality grade?\n'
        + '  A) MVP         — working, minimal error handling\n'
        + '  B) Enterprise  — tested, documented, scalable, security-hardened\n'
        + '  C) POC / Stub  — structure only, implementations are stubs',
    hint: 'Type A, B, or C',
  },
  // Block 5 — Constraints
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

function parseStoryTypes(answer: string): StoryType[] {
  const map: Record<string, StoryType> = {
    feature: 'feature', fix: 'fix', migration: 'migration',
    poc: 'poc', spike: 'spike', refactor: 'refactor',
  };
  return answer.split(',').map((s) => s.trim().toLowerCase()).map((s) => map[s] ?? 'feature');
}

function parseLayers(answer: string): ProjectLayer[] {
  const map: Record<string, ProjectLayer> = {
    frontend: 'frontend', backend: 'backend', database: 'database',
    infra: 'infra', fullstack: 'fullstack', db: 'database',
  };
  return answer.split(',').map((s) => s.trim().toLowerCase()).map((s) => map[s] ?? 'fullstack');
}

function parseQuality(answer: string): QualityGrade {
  const a = answer.trim().toUpperCase();
  if (a === 'A' || a.includes('MVP'))        return 'mvp';
  if (a === 'C' || a.includes('POC') || a.includes('STUB')) return 'poc-stub';
  return 'enterprise';
}

function buildModelRecommendation(
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

// ─── DiscoverySession ─────────────────────────────────────────────────────────

export class DiscoverySession {
  private readonly renderer: ChatRenderer;
  private readonly stateDir: string;
  private questions: DiscoveryQuestion[];

  constructor(renderer: ChatRenderer, projectRoot: string) {
    this.renderer = renderer;
    this.stateDir = path.join(projectRoot, '.agents', 'plan-state');
    this.questions = QUESTION_BANK.map((q) => ({ ...q, answered: false }));
  }

  async run(): Promise<DiscoveryResult> {
    const r = this.renderer;

    r.phaseHeader('discover');
    r.say('ba',
      'Hello! I\'m your Business Analyst and Scrum Master for this project. '
      + 'We\'ll work together through five question blocks to build a solid plan. '
      + 'No other agents are involved yet — this is just you and me.'
    );
    r.newline();
    r.say('ba', 'Let\'s start. Answer as freely as you like — I\'ll extract the structure.');
    r.newline();

    const answers: Record<string, string> = {};
    let currentBlock = '';

    for (const q of this.questions) {
      // Print block header on first question of each block
      if (q.block !== currentBlock) {
        currentBlock = q.block;
        r.separator();
        r.say('system', `Block: ${currentBlock}`);
        r.separator();
        r.newline();
      }

      r.question('ba', q.text);
      if (q.hint) r.system(`Hint: ${q.hint}`);

      const answer = await promptUser(r, '');
      answers[q.id] = answer || '(skipped)';
      q.answered = true;
      q.answer = answers[q.id];

      // Brief BA acknowledgement
      if (answer && answer !== '(skipped)') {
        r.say('ba', this._acknowledgeAnswer(q.id, answer));
      }
      r.newline();
    }

    // ── Parse stories ───────────────────────────────────────────────────────
    const rawStories = (answers['q-stories'] ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
    const storyTypesRaw = answers['q-story-types'] ?? '';
    const storyTypeList = parseStoryTypes(storyTypesRaw);

    const stories: StoryDefinition[] = rawStories
      .filter((s) => s.toLowerCase() !== 'no' && s.toLowerCase() !== 'n')
      .map((title, i) => ({
        id: `story-${i + 1}`,
        title,
        type: storyTypeList[i] ?? 'feature',
        description: '',
      }));

    const grade = parseQuality(answers['q-quality'] ?? 'B');
    const budgetSensitivity = (answers['q-budget'] ?? 'medium').toLowerCase().trim() as 'low' | 'medium' | 'high';
    const rec = buildModelRecommendation(grade, budgetSensitivity);

    const result: DiscoveryResult = {
      projectName: this._extractProjectName(answers['q-problem'] ?? ''),
      problem:               answers['q-problem']      ?? '',
      primaryUser:           answers['q-user']         ?? '',
      successCriteria:       answers['q-success']       ?? '',
      stories,
      layers:                parseLayers(answers['q-layers'] ?? 'fullstack'),
      isGreenfield:          (answers['q-greenfield'] ?? '').toLowerCase().includes('green'),
      stackConstraints:      answers['q-stack']        ?? '',
      externalIntegrations:  answers['q-integrations'] ?? '',
      qualityGrade:          grade,
      timelinePressure:      (['low', 'medium', 'high'].includes((answers['q-timeline'] ?? '').toLowerCase())
                               ? answers['q-timeline']!.toLowerCase()
                               : 'medium') as 'low' | 'medium' | 'high',
      teamSize:              (['solo', 'small', 'large'].includes((answers['q-team'] ?? '').toLowerCase())
                               ? answers['q-team']!.toLowerCase()
                               : 'small') as 'solo' | 'small' | 'large',
      budgetSensitivity,
      openQuestions:         [],
      modelRecommendation:   rec,
      completedAt:           new Date().toISOString(),
    };

    // ── Display model recommendation ────────────────────────────────────────
    r.newline();
    r.say('ba', 'Great — I have everything I need. Here\'s the model recommendation based on your quality grade and budget sensitivity:');
    r.modelRecommendation(rec);

    // ── Discovery summary ───────────────────────────────────────────────────
    r.phaseSummary('discover', [
      `Project:  ${result.projectName}`,
      `Stories:  ${stories.length > 0 ? stories.map((s) => s.title).join(', ') : '(single story)'}`,
      `Layers:   ${result.layers.join(', ')}`,
      `Grade:    ${grade}`,
      `Timeline: ${result.timelinePressure}  ·  Team: ${result.teamSize}`,
    ]);

    // ── Persist ─────────────────────────────────────────────────────────────
    this._save(result);

    return result;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private _acknowledgeAnswer(qId: string, answer: string): string {
    const short = answer.slice(0, 60) + (answer.length > 60 ? '…' : '');
    switch (qId) {
      case 'q-problem':  return `Understood — "${short}". Good problem statement.`;
      case 'q-user':     return `Got it. Primary user: ${short}.`;
      case 'q-success':  return `Good success criteria. I'll align agents to that.`;
      case 'q-stories':  return `I see ${answer.split('\n').filter(Boolean).length} potential story lines. Good.`;
      case 'q-quality':  return `Quality grade noted. This will affect which models I recommend.`;
      case 'q-stack':    return answer.includes('no constraint')
                               ? 'No constraints — agents will make optimal choices.'
                               : `Stack: ${short}. Noted.`;
      default:           return `Noted.`;
    }
  }

  private _extractProjectName(problem: string): string {
    // Take first 4 words as a rough project name
    const words = problem.split(/\s+/).slice(0, 4).join(' ');
    return words || 'Unnamed Project';
  }

  private _save(result: DiscoveryResult): void {
    fs.mkdirSync(this.stateDir, { recursive: true });
    const file = path.join(this.stateDir, 'discovery.json');
    fs.writeFileSync(file, JSON.stringify(result, null, 2));
  }

  /** Load a previously saved discovery result */
  static load(projectRoot: string): DiscoveryResult | null {
    const file = path.join(projectRoot, '.agents', 'plan-state', 'discovery.json');
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as DiscoveryResult;
  }
}
