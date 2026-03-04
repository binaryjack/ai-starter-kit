/**
 * Plan Synthesizer — Phase 1
 *
 * The BA agent reads the DiscoveryResult and produces a PlanDefinition
 * skeleton (steps assigned, tasks empty — filled in Phase 2).
 *
 * The skeleton is presented to the user for approval.  The user can
 * request modifications; the BA re-synthesises until approved.
 *
 * Also drives the Sprint Planning backlog session: seeds the backlog,
 * displays it live, and runs the alignment loop with all agents.
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type {
  DiscoveryResult,
  PlanDefinition,
  StepDefinition,
  AlignmentGate,
  ActorId,
  PlanItemStatus,
  QualityGrade,
} from './plan-types.js';
import { ChatRenderer, promptUser } from './chat-renderer.js';
import { BacklogBoard } from './backlog.js';

// ─── Agent roster ─────────────────────────────────────────────────────────────

const AGENT_FILES: Partial<Record<ActorId, { agentFile: string; supervisorFile: string }>> = {
  'ba':           { agentFile: '01-business-analyst.agent.json', supervisorFile: 'business-analyst.supervisor.json' },
  'architecture': { agentFile: '02-architecture.agent.json',     supervisorFile: 'architecture.supervisor.json' },
  'backend':      { agentFile: '03-backend.agent.json',          supervisorFile: 'backend.supervisor.json' },
  'frontend':     { agentFile: '04-frontend.agent.json',         supervisorFile: 'frontend.supervisor.json' },
  'testing':      { agentFile: '05-testing.agent.json',          supervisorFile: 'testing.supervisor.json' },
  'e2e':          { agentFile: '06-e2e.agent.json',              supervisorFile: 'e2e.supervisor.json' },
};

// ─── Layer → agents mapping ───────────────────────────────────────────────────

function selectAgents(discovery: DiscoveryResult): ActorId[] {
  const agents: ActorId[] = ['ba', 'architecture'];
  if (discovery.layers.includes('backend') || discovery.layers.includes('fullstack')) {
    agents.push('backend');
  }
  if (discovery.layers.includes('frontend') || discovery.layers.includes('fullstack')) {
    agents.push('frontend');
  }
  if (discovery.qualityGrade !== 'poc-stub') {
    agents.push('testing');
  }
  if (discovery.qualityGrade === 'enterprise') {
    agents.push('e2e', 'security');
  }
  return agents;
}

// ─── Step templates per agent / quality ──────────────────────────────────────

function buildSteps(discovery: DiscoveryResult, agents: ActorId[]): StepDefinition[] {
  const steps: StepDefinition[] = [];
  const has = (a: ActorId) => agents.includes(a);
  const status: PlanItemStatus = 'pending';

  // ── Step 0: Requirements (BA)
  steps.push({
    id: 'requirements',
    name: 'Requirements Analysis',
    goal: 'Define user stories, acceptance criteria, data model outline',
    agent: 'ba',
    ...AGENT_FILES['ba'],
    dependsOn: [],
    parallel: false,
    outputs: ['user-stories.md', 'acceptance-criteria.md'],
    alignmentGate: {
      id: 'gate-requirements',
      type: 'user',
      description: 'PO reviews and approves requirements before architecture starts',
      participants: ['user', 'ba'],
      afterStepId: 'requirements',
      blocksStepIds: ['architecture'],
      resolved: false,
    },
    tasks: [],
    status,
  });

  // ── Step 1: Architecture
  if (has('architecture')) {
    const outputs = ['api-spec.yaml', 'architecture-decision.md'];
    if (discovery.layers.includes('database') || discovery.layers.includes('fullstack')) {
      outputs.push('schema.json');
    }
    if (discovery.layers.includes('infra') || discovery.qualityGrade === 'enterprise') {
      outputs.push('infra-diagram.md');
    }
    steps.push({
      id: 'architecture',
      name: 'System Architecture',
      goal: 'Define API contracts, system design, data model, infrastructure',
      agent: 'architecture',
      ...AGENT_FILES['architecture'],
      dependsOn: ['requirements'],
      parallel: false,
      outputs,
      alignmentGate: {
        id: 'gate-architecture',
        type: 'cross-agent',
        description: 'Backend + Frontend align on API contracts before implementation',
        participants: ['architecture', 'backend', 'frontend'],
        afterStepId: 'architecture',
        blocksStepIds: ['backend', 'frontend'],
        resolved: false,
      },
      tasks: [],
      status,
    });
  }

  // ── Step 2: Implementation (Backend + Frontend in parallel)
  const implDeps = ['architecture'];
  if (has('backend')) {
    steps.push({
      id: 'backend',
      name: 'Backend Implementation',
      goal: 'Implement API endpoints, business logic, database layer',
      agent: 'backend',
      ...AGENT_FILES['backend'],
      dependsOn: implDeps,
      parallel: true,
      outputs: ['backend-impl.md', 'api-endpoints.md'],
      tasks: [],
      status,
    });
  }
  if (has('frontend')) {
    steps.push({
      id: 'frontend',
      name: 'Frontend Implementation',
      goal: 'Implement UI components, pages, state management, API integration',
      agent: 'frontend',
      ...AGENT_FILES['frontend'],
      dependsOn: implDeps,
      parallel: true,
      outputs: ['frontend-impl.md', 'component-tree.md'],
      tasks: [],
      status,
    });
  }

  // ── Step 3: Quality (test + e2e + security in parallel)
  const qualityDeps = [
    ...(has('backend') ? ['backend'] : []),
    ...(has('frontend') ? ['frontend'] : []),
  ];

  if (has('testing')) {
    steps.push({
      id: 'testing',
      name: 'Test Suite',
      goal: 'Unit tests, integration tests, coverage targets',
      agent: 'testing',
      ...AGENT_FILES['testing'],
      dependsOn: qualityDeps,
      parallel: true,
      outputs: ['test-strategy.md', 'coverage-report.md'],
      tasks: [],
      status,
    });
  }
  if (has('e2e')) {
    steps.push({
      id: 'e2e',
      name: 'E2E Testing',
      goal: 'End-to-end user journey tests',
      agent: 'e2e',
      ...AGENT_FILES['e2e'],
      dependsOn: qualityDeps,
      parallel: true,
      outputs: ['e2e-test-suite.md'],
      tasks: [],
      status,
    });
  }
  if (has('security')) {
    steps.push({
      id: 'security',
      name: 'Security Audit',
      goal: 'Security review, dependency audit, hardening recommendations',
      agent: 'security',
      dependsOn: qualityDeps,
      parallel: true,
      outputs: ['security-report.md'],
      tasks: [],
      status,
    });
  }

  return steps;
}

// ─── PlanSynthesizer ──────────────────────────────────────────────────────────

export class PlanSynthesizer {
  private readonly renderer: ChatRenderer;
  private readonly stateDir: string;

  constructor(renderer: ChatRenderer, projectRoot: string) {
    this.renderer = renderer;
    this.stateDir = path.join(projectRoot, '.agents', 'plan-state');
  }

  async synthesize(discovery: DiscoveryResult): Promise<PlanDefinition> {
    const r = this.renderer;

    r.phaseHeader('synthesize');
    r.say('ba',
      `Based on our discovery session I'm now assembling the team and building the plan skeleton. `
      + `Project: "${discovery.projectName}" — Quality grade: ${discovery.qualityGrade.toUpperCase()}`
    );
    r.newline();

    // ── Select agents ───────────────────────────────────────────────────────
    const agents = selectAgents(discovery);
    r.say('ba', `Selected agents: ${agents.map((a) => `${a}`).join(' · ')}`);
    r.newline();

    // ── Announce team ───────────────────────────────────────────────────────
    r.separator();
    for (const agentId of agents.filter((a) => a !== 'ba')) {
      r.say(agentId as ActorId, 'Ready to contribute to this plan.');
    }
    r.separator();
    r.newline();

    // ── Build skeleton ──────────────────────────────────────────────────────
    const steps = buildSteps(discovery, agents);

    r.say('ba', `Plan skeleton ready — ${steps.length} steps:`);
    r.newline();
    for (const step of steps) {
      const deps = step.dependsOn.length > 0 ? ` (after: ${step.dependsOn.join(', ')})` : ' (starts immediately)';
      const par  = step.parallel ? ' ⇒ runs in parallel with siblings' : '';
      r.system(`  ${step.id.padEnd(16)} ${step.name}${deps}${par}`);
    }
    r.newline();

    // ── Approval loop ───────────────────────────────────────────────────────
    let approved = false;
    while (!approved) {
      r.approvalPrompt(
        'Review the plan above. Type "ok" to approve, or describe changes.'
      );
      const response = await promptUser(r, '');
      if (!response || ['ok', 'yes', 'y', 'approve', 'looks good', 'lgtm'].includes(response.toLowerCase())) {
        approved = true;
        r.say('ba', 'Plan skeleton approved. Moving to sprint planning.');
      } else {
        r.say('ba', `Understood — "${response}". Let me adjust…`);
        r.warn('Plan modification loop is not yet fully automated. Proceeding with current skeleton.');
        r.say('ba', 'Type "ok" to continue with the current plan, or Ctrl+C to abort.');
      }
    }

    // ── Build plan object ───────────────────────────────────────────────────
    const allGates: AlignmentGate[] = steps
      .filter((s) => s.alignmentGate)
      .map((s) => s.alignmentGate!);

    const plan: PlanDefinition = {
      id:              randomUUID(),
      name:            discovery.projectName,
      description:     discovery.problem,
      version:         '1.0',
      phase:           'synthesize',
      qualityGrade:    discovery.qualityGrade as QualityGrade,
      discoveryRef:    path.join('.agents', 'plan-state', 'discovery.json'),
      steps,
      alignmentGates:  allGates,
      artifacts:       [],
      createdAt:       new Date().toISOString(),
      updatedAt:       new Date().toISOString(),
    };

    this._save(plan);

    r.phaseSummary('synthesize', [
      `Plan ID: ${plan.id}`,
      `Steps:   ${steps.length}`,
      `Gates:   ${allGates.length}`,
    ]);

    return plan;
  }

  // ── Sprint Planning ────────────────────────────────────────────────────────

  /**
   * Run the live backlog session: seed, display, answer loop.
   * Returns the populated backlog board.
   */
  async runSprintPlanning(
    plan: PlanDefinition,
    discovery: DiscoveryResult,
    board: BacklogBoard,
  ): Promise<void> {
    const r = this.renderer;

    r.phaseHeader('decompose');
    r.say('ba',
      'Sprint planning session open. Each agent has posted their prerequisite questions. '
      + 'We\'ll work through them together — you\'re the PO, I\'m the Scrum Master.'
    );
    r.newline();

    // Seed backlog with standard items per story
    if (discovery.stories.length > 0) {
      for (const story of discovery.stories) {
        board.seedStandardItems(story.id);
      }
    } else {
      board.seedStandardItems();
    }

    // Show initial board
    board.display('INITIAL BACKLOG — all items open');

    // Announce each agent's questions
    const agentOrder: ActorId[] = ['architecture', 'backend', 'frontend', 'testing', 'e2e', 'security'];
    for (const agentId of agentOrder) {
      const items = board.getByOwner(agentId);
      if (items.length === 0) continue;
      r.say(agentId, `I need ${items.length} question(s) answered before I can start:`);
      for (const item of items) {
        const waiting = item.waitingFor ? ` (waiting on: ${item.waitingFor})` : '';
        r.system(`  □  ${item.question}${waiting}`);
      }
      r.newline();
    }

    // BA resolves open items interactively
    r.say('ba', 'Let\'s resolve the open items. I\'ll handle what I can; you\'ll be asked for product decisions.');

    const maxRounds = 50;
    let round = 0;
    while (board.getOpen().length > 0 && round < maxRounds) {
      round++;
      const openItem = board.getOpen()[0];
      r.question('ba', `[${openItem.owner.toUpperCase()}]  ${openItem.question}`);
      const answer = await promptUser(r, '');
      if (answer) {
        board.resolve(openItem.id, answer);
        r.say('ba', `✅ Noted: "${answer.slice(0, 60)}"`);
      } else {
        board.skip(openItem.id);
        r.say('ba', 'Skipped — moving on.');
      }
      const prog = board.progress();
      if (prog.pct % 25 === 0 && prog.pct > 0) {
        board.display(`BACKLOG UPDATE — ${prog.pct}% resolved`);
      }
    }

    board.display('BACKLOG FINAL — sprint planning complete');

    r.phaseSummary('decompose', [
      `${board.progress().done}/${board.progress().total} backlog items resolved`,
      `${board.getOpen().length} items still open (will be carried forward)`,
    ]);
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  private _save(plan: PlanDefinition): void {
    fs.mkdirSync(this.stateDir, { recursive: true });
    fs.writeFileSync(path.join(this.stateDir, 'plan.json'), JSON.stringify(plan, null, 2));
  }

  static load(projectRoot: string): PlanDefinition | null {
    const file = path.join(projectRoot, '.agents', 'plan-state', 'plan.json');
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as PlanDefinition;
  }
}
