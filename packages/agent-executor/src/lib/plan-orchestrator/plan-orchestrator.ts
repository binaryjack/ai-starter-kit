import * as path from 'path';
import type { ChatRenderer } from '../chat-renderer.js';
import type { DagResult } from '../dag-types.js';
import type { ModelRouter } from '../model-router.js';
import type {
    DiscoveryResult,
    PlanDefinition,
    PlanPhase,
    PlanRunOptions,
    StepDefinition,
} from '../plan-types.js';

export type { DagResult, DiscoveryResult, PlanDefinition, PlanPhase, StepDefinition };

export interface PlanStepResult {
  stepId:     string;
  stepName:   string;
  status:     'success' | 'failed' | 'skipped' | 'gated';
  dagResult?: DagResult;
  durationMs: number;
  artifacts:  string[];
}

export interface PlanResult {
  planId:          string;
  planName:        string;
  status:          'success' | 'partial' | 'failed' | 'gated';
  phase:           PlanPhase;
  steps:           PlanStepResult[];
  totalDurationMs: number;
  artifacts:       string[];
  savedTo:         string;
}

export interface IPlanOrchestrator {
  _projectRoot: string;
  _options:     Required<Omit<PlanRunOptions, 'modelRouter'>> & { modelRouter?: ModelRouter };
  _renderer:    ChatRenderer;
  _stateDir:    string;
  _modelRouter: ModelRouter | undefined;

  run():                                                                        Promise<PlanResult>;
  _executeSteps(plan: PlanDefinition, r: ChatRenderer):                        Promise<PlanStepResult[]>;
  _runStep(step: StepDefinition, plan: PlanDefinition):                        Promise<PlanStepResult>;
  _topoGroups(steps: StepDefinition[]):                                        StepDefinition[][];
  _shouldRun(phase: PlanPhase):                                                boolean;
  _inferDagFile(step: StepDefinition, plan: PlanDefinition):                  string | null;
  _savePlan(plan: PlanDefinition):                                              void;
  _waitForAnyInput():                                                           Promise<void>;
  _printSummary(result: PlanResult, r: ChatRenderer):                          void;
}

export const PlanOrchestrator = function PlanOrchestrator(
  this: IPlanOrchestrator,
  projectRoot: string,
  options: PlanRunOptions = {},
) {
  const ChatRendererCtor = require('../chat-renderer.js').ChatRenderer as new () => ChatRenderer;

  this._projectRoot = path.resolve(projectRoot);
  this._modelRouter = options.modelRouter as ModelRouter | undefined;
  this._options     = {
    startFrom:    options.startFrom    ?? 'discover',
    skipApproval: options.skipApproval ?? false,
    projectRoot:  this._projectRoot,
    agentsBaseDir: options.agentsBaseDir ?? this._projectRoot,
    verbose:      options.verbose      ?? true,
  };
  this._renderer = new ChatRendererCtor();
  this._stateDir = path.join(this._projectRoot, '.agents', 'plan-state');
} as unknown as new (projectRoot: string, options?: PlanRunOptions) => IPlanOrchestrator;
