import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { promptUser } from '../../chat-renderer.js'
import type {
    ActorId,
    AlignmentGate,
    DiscoveryResult,
    PlanDefinition,
    QualityGrade,
    StepDefinition,
} from '../../plan-types.js'
import { PromptRegistry } from '../../prompt-registry.js'
import {
    buildSteps,
    IPlanSynthesizer,
    PlanSynthesizer,
    selectAgents,
} from '../plan-synthesizer.js'

// ─── synthesize ───────────────────────────────────────────────────────────────

export async function synthesize(
  this: IPlanSynthesizer,
  discovery: DiscoveryResult,
): Promise<PlanDefinition> {
  const r = this._renderer;

  r.phaseHeader('synthesize');
  r.say('ba',
    `Based on our discovery session I'm now assembling the team and building the plan skeleton. `
    + `Project: "${discovery.projectName}" — Quality grade: ${discovery.qualityGrade.toUpperCase()}`,
  );
  r.newline();

  const agents = selectAgents(discovery);
  r.say('ba', `Selected agents: ${agents.map((a) => `${a}`).join(' · ')}`);
  r.newline();

  r.separator();
  for (const agentId of agents.filter((a) => a !== 'ba')) {
    const intro = await this._agentIntroduction(agentId as ActorId, discovery);
    r.say(agentId as ActorId, intro);
  }
  r.separator();
  r.newline();

  const steps = await this._buildStepsWithFallback(discovery, agents);

  r.say('ba', `Plan skeleton ready — ${steps.length} steps:`);
  r.newline();
  for (const step of steps) {
    const deps = step.dependsOn.length > 0 ? ` (after: ${step.dependsOn.join(', ')})` : ' (starts immediately)';
    const par  = step.parallel ? ' ⇒ runs in parallel with siblings' : '';
    r.system(`  ${step.id.padEnd(16)} ${step.name}${deps}${par}`);
  }
  r.newline();

  let approved = false;
  while (!approved) {
    r.approvalPrompt('Review the plan above. Type "ok" to approve, or describe changes.');
    const response = await promptUser(r, '');
    if (!response || ['ok', 'yes', 'y', 'approve', 'looks good', 'lgtm'].includes(response.toLowerCase())) {
      approved = true;
      r.say('ba', 'Plan skeleton approved. Moving to sprint planning.');
    } else {
      r.say('ba', `Understood — "${response}". Let me adjust…`);
      const feedback = await this._processApprovalFeedback(response, steps, discovery);
      r.say('ba', feedback);
      r.say('ba', 'Type "ok" to continue with the current plan, or describe another change.');
    }
  }

  const allGates: AlignmentGate[] = steps
    .filter((s) => s.alignmentGate)
    .map((s) => s.alignmentGate!);

  const plan: PlanDefinition = {
    id:             randomUUID(),
    name:           discovery.projectName,
    description:    discovery.problem,
    version:        '1.0',
    phase:          'synthesize',
    qualityGrade:   discovery.qualityGrade as QualityGrade,
    discoveryRef:   path.join('.agents', 'plan-state', 'discovery.json'),
    steps,
    alignmentGates: allGates,
    artifacts:      [],
    createdAt:      new Date().toISOString(),
    updatedAt:      new Date().toISOString(),
  };

  this._save(plan);

  r.phaseSummary('synthesize', [
    `Plan ID: ${plan.id}`,
    `Steps:   ${steps.length}`,
    `Gates:   ${allGates.length}`,
  ]);

  return plan;
}

// ─── _buildStepsWithFallback ──────────────────────────────────────────────────

export async function _buildStepsWithFallback(
  this: IPlanSynthesizer,
  discovery: DiscoveryResult,
  agents:    ActorId[],
): Promise<StepDefinition[]> {
  const deterministic = buildSteps(discovery, agents);
  if (!this._modelRouter) return deterministic;

  try {
    const reg      = await this._ensurePromptRegistry();
    const resolved = reg.resolve('plan-architect', 'opus');
    const systemPrompt = resolved?.systemPrompt
      ?? (
        'You are a senior software architect building a project plan skeleton. '
        + 'Given a discovery document, return ONLY a JSON array of step objects. '
        + 'Each object must have these exact keys: id, name, goal, outputs (string[]), parallel (bool). '
        + 'Use these step ids: ' + deterministic.map((s) => s.id).join(', ') + '. '
        + 'Tailor name, goal, and outputs to the specific project. No markdown, no explanation.'
      );

    const resp = await this._modelRouter.route('architecture-decision', {
      messages: [
        {
          role:    'system',
          content: systemPrompt + '\nUse these step ids: ' + deterministic.map((s) => s.id).join(', ') + '.',
        },
        {
          role:    'user',
          content: `Discovery:\n${JSON.stringify(discovery, null, 2)}`,
        },
      ],
      maxTokens: resolved?.frontmatter.maxTokens ?? 800,
    });

    const raw      = resp.content.replace(/```(?:json)?/gi, '').trim();
    const llmSteps = JSON.parse(raw) as Array<{
      id: string; name: string; goal: string; outputs: string[]; parallel: boolean;
    }>;

    return deterministic.map((det) => {
      const llm = llmSteps.find((l) => l.id === det.id);
      if (!llm) return det;
      return {
        ...det,
        name:     llm.name     ?? det.name,
        goal:     llm.goal     ?? det.goal,
        outputs:  llm.outputs  ?? det.outputs,
        parallel: llm.parallel ?? det.parallel,
      };
    });
  } catch {
    return deterministic;
  }
}

// ─── _agentIntroduction ───────────────────────────────────────────────────────

export async function _agentIntroduction(
  this: IPlanSynthesizer,
  agent:     ActorId,
  discovery: DiscoveryResult,
): Promise<string> {
  if (this._modelRouter) {
    try {
      const reg      = await this._ensurePromptRegistry();
      const resolved = reg.resolve('plan-agent-intro', 'haiku');
      const systemPrompt = resolved?.systemPrompt
        ?? (
          'You are roleplaying as a software development agent. '
          + 'Write ONE sentence (20-40 words) introducing yourself and what you will contribute '
          + 'to this specific project. Be specific about the project, not generic. No markdown.'
        );

      const resp = await this._modelRouter.route('file-analysis', {
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role:    'user',
            content: `Agent role: ${agent}\nProject: ${discovery.projectName}\nProblem: ${discovery.problem}\nStack: ${discovery.stackConstraints || 'not specified'}\nLayers: ${discovery.layers.join(', ')}`,
          },
        ],
        maxTokens: resolved?.frontmatter.maxTokens ?? 80,
      });
      const text = resp.content.trim();
      if (text.length > 10) return text;
    } catch { /* fall through */ }
  }
  return 'Ready to contribute to this plan.';
}

// ─── _processApprovalFeedback ─────────────────────────────────────────────────

export async function _processApprovalFeedback(
  this: IPlanSynthesizer,
  feedback:  string,
  steps:     StepDefinition[],
  discovery: DiscoveryResult,
): Promise<string> {
  if (this._modelRouter) {
    try {
      const reg      = await this._ensurePromptRegistry();
      const resolved = reg.resolve('plan-ba-feedback', 'sonnet');
      const systemPrompt = resolved?.systemPrompt
        ?? (
          'You are a Business Analyst. The user has requested changes to a plan skeleton. '
          + 'Acknowledge the change request, explain what would need to change in the plan, '
          + 'and recommend whether the change requires re-running discovery or can be applied inline. '
          + 'Be concise (2-3 sentences). No markdown.'
        );

      const stepList = steps.map((s) => `${s.id}: ${s.name} — ${s.goal}`).join('\n');
      const resp = await this._modelRouter.route('api-design', {
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role:    'user',
            content: `User change request: "${feedback}"\n\nCurrent plan steps:\n${stepList}\n\nProject context: ${discovery.problem.slice(0, 200)}`,
          },
        ],
        maxTokens: resolved?.frontmatter.maxTokens ?? 200,
      });
      const text = resp.content.trim();
      if (text.length > 10) return text;
    } catch { /* fall through */ }
  }
  return 'Plan modification noted — proceeding with current skeleton. Type "ok" to approve.';
}

// ─── _ensurePromptRegistry ────────────────────────────────────────────────────

export async function _ensurePromptRegistry(this: IPlanSynthesizer): Promise<PromptRegistry> {
  if (!this._promptRegistry) {
    this._promptRegistry = new PromptRegistry(this._promptsDir);
    await this._promptRegistry.loadAll();
  }
  return this._promptRegistry;
}

// ─── _save ────────────────────────────────────────────────────────────────────

export function _save(this: IPlanSynthesizer, plan: PlanDefinition): void {
  fs.mkdirSync(this._stateDir, { recursive: true });
  fs.writeFileSync(path.join(this._stateDir, 'plan.json'), JSON.stringify(plan, null, 2));
}

// ─── Static load ──────────────────────────────────────────────────────────────

(PlanSynthesizer as unknown as Record<string, unknown>).load = function load(
  projectRoot: string,
): PlanDefinition | null {
  const file = path.join(projectRoot, '.agents', 'plan-state', 'plan.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as PlanDefinition;
};
