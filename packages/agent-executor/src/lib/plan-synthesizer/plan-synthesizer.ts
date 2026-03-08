import * as path from 'path';
import type { ChatRenderer } from '../chat-renderer.js';
import type { ModelRouter } from '../model-router.js';
import type {
    ActorId,
    DiscoveryResult,
    PlanDefinition,
    PlanItemStatus,
    StepDefinition,
} from '../plan-types.js';
import { PromptRegistry } from '../prompt-registry.js';

export type { ActorId, DiscoveryResult, PlanDefinition, StepDefinition };

// ─── Module-level helpers (preserved as exports) ─────────────────────────────

export const AGENT_FILES: Partial<Record<ActorId, { agentFile: string; supervisorFile: string }>> = {
  'ba':           { agentFile: '01-business-analyst.agent.json', supervisorFile: 'business-analyst.supervisor.json' },
  'architecture': { agentFile: '02-architecture.agent.json',     supervisorFile: 'architecture.supervisor.json' },
  'backend':      { agentFile: '03-backend.agent.json',          supervisorFile: 'backend.supervisor.json' },
  'frontend':     { agentFile: '04-frontend.agent.json',         supervisorFile: 'frontend.supervisor.json' },
  'testing':      { agentFile: '05-testing.agent.json',          supervisorFile: 'testing.supervisor.json' },
  'e2e':          { agentFile: '06-e2e.agent.json',              supervisorFile: 'e2e.supervisor.json' },
};

export function selectAgents(discovery: DiscoveryResult): ActorId[] {
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

export function buildSteps(discovery: DiscoveryResult, agents: ActorId[]): StepDefinition[] {
  const steps: StepDefinition[] = [];
  const has = (a: ActorId) => agents.includes(a);
  const status: PlanItemStatus = 'pending';

  steps.push({
    id:    'requirements',
    name:  'Requirements Analysis',
    goal:  'Define user stories, acceptance criteria, data model outline',
    agent: 'ba',
    ...AGENT_FILES['ba'],
    dependsOn: [],
    parallel:  false,
    outputs:   ['user-stories.md', 'acceptance-criteria.md'],
    alignmentGate: {
      id:           'gate-requirements',
      type:         'user',
      description:  'PO reviews and approves requirements before architecture starts',
      participants: ['user', 'ba'],
      afterStepId:  'requirements',
      blocksStepIds: ['architecture'],
      resolved:     false,
    },
    tasks: [],
    status,
  });

  if (has('architecture')) {
    const outputs = ['api-spec.yaml', 'architecture-decision.md'];
    if (discovery.layers.includes('database') || discovery.layers.includes('fullstack')) outputs.push('schema.json');
    if (discovery.layers.includes('infra') || discovery.qualityGrade === 'enterprise')   outputs.push('infra-diagram.md');
    steps.push({
      id:    'architecture',
      name:  'System Architecture',
      goal:  'Define API contracts, system design, data model, infrastructure',
      agent: 'architecture',
      ...AGENT_FILES['architecture'],
      dependsOn: ['requirements'],
      parallel:  false,
      outputs,
      alignmentGate: {
        id:           'gate-architecture',
        type:         'cross-agent',
        description:  'Backend + Frontend align on API contracts before implementation',
        participants: ['architecture', 'backend', 'frontend'],
        afterStepId:  'architecture',
        blocksStepIds: ['backend', 'frontend'],
        resolved:     false,
      },
      tasks: [],
      status,
    });
  }

  const implDeps = ['architecture'];
  if (has('backend')) {
    steps.push({
      id:    'backend',
      name:  'Backend Implementation',
      goal:  'Implement API endpoints, business logic, database layer',
      agent: 'backend',
      ...AGENT_FILES['backend'],
      dependsOn: implDeps,
      parallel:  true,
      outputs:   ['backend-impl.md', 'api-endpoints.md'],
      tasks:     [],
      status,
    });
  }
  if (has('frontend')) {
    steps.push({
      id:    'frontend',
      name:  'Frontend Implementation',
      goal:  'Implement UI components, pages, state management, API integration',
      agent: 'frontend',
      ...AGENT_FILES['frontend'],
      dependsOn: implDeps,
      parallel:  true,
      outputs:   ['frontend-impl.md', 'component-tree.md'],
      tasks:     [],
      status,
    });
  }

  const qualityDeps = [
    ...(has('backend')  ? ['backend']  : []),
    ...(has('frontend') ? ['frontend'] : []),
  ];

  if (has('testing')) {
    steps.push({
      id:    'testing',
      name:  'Test Suite',
      goal:  'Unit tests, integration tests, coverage targets',
      agent: 'testing',
      ...AGENT_FILES['testing'],
      dependsOn: qualityDeps,
      parallel:  true,
      outputs:   ['test-strategy.md', 'coverage-report.md'],
      tasks:     [],
      status,
    });
  }
  if (has('e2e')) {
    steps.push({
      id:    'e2e',
      name:  'E2E Testing',
      goal:  'End-to-end user journey tests',
      agent: 'e2e',
      ...AGENT_FILES['e2e'],
      dependsOn: qualityDeps,
      parallel:  true,
      outputs:   ['e2e-test-suite.md'],
      tasks:     [],
      status,
    });
  }
  if (has('security')) {
    steps.push({
      id:        'security',
      name:      'Security Audit',
      goal:      'Security review, dependency audit, hardening recommendations',
      agent:     'security',
      dependsOn: qualityDeps,
      parallel:  true,
      outputs:   ['security-report.md'],
      tasks:     [],
      status,
    });
  }

  return steps;
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IPlanSynthesizer {
  _renderer:       ChatRenderer;
  _stateDir:       string;
  _modelRouter:    ModelRouter | undefined;
  _promptsDir:     string;
  _promptRegistry: PromptRegistry | undefined;

  synthesize(discovery: DiscoveryResult):                                         Promise<PlanDefinition>;
  _buildStepsWithFallback(discovery: DiscoveryResult, agents: ActorId[]):        Promise<StepDefinition[]>;
  _agentIntroduction(agent: ActorId, discovery: DiscoveryResult):                Promise<string>;
  _processApprovalFeedback(
    feedback:  string,
    steps:     StepDefinition[],
    discovery: DiscoveryResult,
  ):                                                                               Promise<string>;
  _ensurePromptRegistry():                                                        Promise<PromptRegistry>;
  _save(plan: PlanDefinition):                                                    void;
}

export const PlanSynthesizer = function PlanSynthesizer(
  this: IPlanSynthesizer,
  renderer:    ChatRenderer,
  projectRoot: string,
  modelRouter?: ModelRouter,
  promptsDir?:  string,
) {
  this._renderer       = renderer;
  this._stateDir       = path.join(projectRoot, '.agents', 'plan-state');
  this._modelRouter    = modelRouter;
  this._promptsDir     = promptsDir ?? path.join(projectRoot, 'agents', 'prompts');
  this._promptRegistry = undefined;
} as unknown as {
  new (renderer: ChatRenderer, projectRoot: string, modelRouter?: ModelRouter, promptsDir?: string): IPlanSynthesizer;
  load(projectRoot: string): PlanDefinition | null;
};
