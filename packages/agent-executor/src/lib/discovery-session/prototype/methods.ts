import * as fs from 'fs'
import * as path from 'path'
import { promptUser } from '../../chat-renderer.js'
import type { DiscoveryResult, StoryDefinition } from '../../plan-types.js'
import {
    buildModelRecommendation,
    DiscoverySession,
    IDiscoverySession,
    parseLayers,
    parseQuality,
    parseStoryTypes,
    QUESTION_BANK,
} from '../discovery-session.js'

// ─── run ─────────────────────────────────────────────────────────────────────

export async function run(this: IDiscoverySession): Promise<DiscoveryResult> {
  const r = this._renderer;

  r.phaseHeader('discover');
  r.say('ba',
    'Hello! I\'m your Business Analyst and Scrum Master for this project. '
    + 'We\'ll work together through five question blocks to build a solid plan. '
    + 'No other agents are involved yet — this is just you and me.',
  );
  r.newline();
  r.say('ba', 'Let\'s start. Answer as freely as you like — I\'ll extract the structure.');
  r.newline();

  const answers: Record<string, string> = {};
  let currentBlock = '';

  for (const q of this._questions) {
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
    q.answer   = answers[q.id];

    if (answer && answer !== '(skipped)') {
      const ack = await this._acknowledgeAnswer(q.id, answer, answers);
      r.say('ba', ack);
    }
    r.newline();
  }

  const rawStories = (answers['q-stories'] ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  const storyTypeList = parseStoryTypes(answers['q-story-types'] ?? '');

  const stories: StoryDefinition[] = rawStories
    .filter((s) => s.toLowerCase() !== 'no' && s.toLowerCase() !== 'n')
    .map((title, i) => ({
      id:          `story-${i + 1}`,
      title,
      type:        storyTypeList[i] ?? 'feature',
      description: '',
    }));

  const grade             = parseQuality(answers['q-quality'] ?? 'B');
  const budgetSensitivity = (answers['q-budget'] ?? 'medium').toLowerCase().trim() as 'low' | 'medium' | 'high';
  const rec               = buildModelRecommendation(grade, budgetSensitivity);

  const result: DiscoveryResult = {
    projectName:           await this._extractProjectName(answers['q-problem'] ?? ''),
    problem:               answers['q-problem']      ?? '',
    primaryUser:           answers['q-user']         ?? '',
    successCriteria:       answers['q-success']      ?? '',
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

  const insights = await this._synthesizeInsights(result);
  if (insights) {
    r.newline();
    r.say('ba', insights);
  }

  r.newline();
  r.say('ba', 'Here is the model recommendation based on your quality grade and budget sensitivity:');
  r.modelRecommendation(rec);

  r.phaseSummary('discover', [
    `Project:  ${result.projectName}`,
    `Stories:  ${stories.length > 0 ? stories.map((s) => s.title).join(', ') : '(single story)'}`,
    `Layers:   ${result.layers.join(', ')}`,
    `Grade:    ${grade}`,
    `Timeline: ${result.timelinePressure}  ·  Team: ${result.teamSize}`,
  ]);

  this._save(result);
  return result;
}

// ─── _acknowledgeAnswer ───────────────────────────────────────────────────────

export async function _acknowledgeAnswer(
  this: IDiscoverySession,
  qId:        string,
  answer:     string,
  allAnswers: Record<string, string>,
): Promise<string> {
  if (this._modelRouter) {
    try {
      const questionText = QUESTION_BANK.find((q) => q.id === qId)?.text ?? qId;
      const ctx = Object.entries(allAnswers)
        .filter(([, v]) => v && v !== '(skipped)')
        .map(([k, v]) => `${k}: ${v.slice(0, 80)}`)
        .join('\n');
      const resp = await this._modelRouter.route('file-analysis', {
        messages: [
          {
            role:    'system',
            content: 'You are a Business Analyst conducting a project discovery interview. '
              + 'Respond with a single concise acknowledgement (1-2 sentences max). '
              + 'Show you understood the answer. Optionally note ONE brief concern or '
              + 'insight if relevant. Be conversational, not formal. No markdown.',
          },
          {
            role:    'user',
            content: `Question asked: ${questionText}\n`
              + `User answered: "${answer}"\n`
              + `Conversation so far:\n${ctx}\n\nAcknowledge in 1-2 sentences:`,
          },
        ],
        maxTokens: 120,
      });
      const text = resp.content.trim();
      if (text.length > 5) return text;
    } catch { /* fall through */ }
  }

  const short = answer.slice(0, 60) + (answer.length > 60 ? '…' : '');
  switch (qId) {
    case 'q-problem':  return `Understood — "${short}". Good problem statement.`;
    case 'q-user':     return `Got it. Primary user: ${short}.`;
    case 'q-success':  return 'Good success criteria. I\'ll align agents to that.';
    case 'q-stories':  return `I see ${answer.split('\n').filter(Boolean).length} potential story line(s).`;
    case 'q-quality':  return 'Quality grade noted. This shapes the model recommendations.';
    case 'q-stack':    return answer.toLowerCase().includes('no constrain')
                             ? 'No constraints — agents will make optimal choices.'
                             : `Stack: ${short}. Noted.`;
    default:           return 'Noted.';
  }
}

// ─── _synthesizeInsights ──────────────────────────────────────────────────────

export async function _synthesizeInsights(
  this: IDiscoverySession,
  result: DiscoveryResult,
): Promise<string | null> {
  if (!this._modelRouter) return null;
  try {
    const resp = await this._modelRouter.route('api-design', {
      messages: [
        {
          role:    'system',
          content: 'You are a senior Business Analyst reviewing a completed project discovery. '
            + 'Based on the discovery document, identify 2-3 key risks or open questions '
            + 'that the team should address early. Be specific and actionable. '
            + 'Format as a short numbered list. No markdown headers.',
        },
        {
          role:    'user',
          content: `Discovery document:\n${JSON.stringify(result, null, 2)}`,
        },
      ],
      maxTokens: 300,
    });
    const text = resp.content.trim();
    return text.length > 10 ? `Key insights from discovery:\n${text}` : null;
  } catch {
    return null;
  }
}

// ─── _extractProjectName ──────────────────────────────────────────────────────

export async function _extractProjectName(
  this: IDiscoverySession,
  problem: string,
): Promise<string> {
  if (this._modelRouter && problem.length > 10) {
    try {
      const resp = await this._modelRouter.route('file-analysis', {
        messages: [
          {
            role:    'system',
            content: 'Extract a short, memorable project name (2-4 words, title case) from '
              + 'this problem statement. Reply with ONLY the name, nothing else.',
          },
          { role: 'user', content: problem },
        ],
        maxTokens: 20,
      });
      const name = resp.content.trim().replace(/["']/g, '');
      if (name.length > 2 && name.length < 50) return name;
    } catch { /* fall through */ }
  }
  return problem.split(/\s+/).slice(0, 4).join(' ') || 'Unnamed Project';
}

// ─── _save ────────────────────────────────────────────────────────────────────

export function _save(this: IDiscoverySession, result: DiscoveryResult): void {
  fs.mkdirSync(this._stateDir, { recursive: true });
  const file = path.join(this._stateDir, 'discovery.json');
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
}

// ─── Static load ──────────────────────────────────────────────────────────────

(DiscoverySession as unknown as Record<string, unknown>).load = function load(
  projectRoot: string,
): DiscoveryResult | null {
  const file = path.join(projectRoot, '.agents', 'plan-state', 'discovery.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as DiscoveryResult;
};
