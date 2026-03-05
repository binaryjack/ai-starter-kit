/**
 * PlanOrchestrator — drives all five phases of the Plan System
 *
 *   Phase 0  DISCOVER    DiscoverySession  — BA ↔ User interview
 *   Phase 1  SYNTHESIZE  PlanSynthesizer   — BA produces plan skeleton
 *   Phase 2  DECOMPOSE   PlanSynthesizer   — agents fill in tasks (backlog)
 *   Phase 3  WIRE        Arbiter           — dependency + decision pass
 *   Phase 4  EXECUTE     DagOrchestrator   — runs each step's DAG
 *
 * All state is persisted to .agents/plan-state/ after each phase so the
 * plan can be resumed from any phase.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Arbiter } from './arbiter.js';
import { BacklogBoard } from './backlog.js';
import { ChatRenderer } from './chat-renderer.js';
import { DagOrchestrator } from './dag-orchestrator.js';
import type { DagResult } from './dag-types.js';
import { DiscoverySession } from './discovery-session.js';
import type { ModelRouter } from './model-router.js';
import { PlanModelAdvisor } from './plan-model-advisor.js';
import { PlanSynthesizer } from './plan-synthesizer.js';
import { SprintPlanner } from './sprint-planner.js';
import type {
    DiscoveryResult,
    PlanDefinition,
    PlanPhase,
    PlanRunOptions,
    StepDefinition,
} from './plan-types.js';

// ─── PlanResult ───────────────────────────────────────────────────────────────

export interface PlanStepResult {
  stepId: string;
  stepName: string;
  status: 'success' | 'failed' | 'skipped' | 'gated';
  dagResult?: DagResult;
  durationMs: number;
  artifacts: string[];
}

export interface PlanResult {
  planId: string;
  planName: string;
  status: 'success' | 'partial' | 'failed' | 'gated';
  phase: PlanPhase;
  steps: PlanStepResult[];
  totalDurationMs: number;
  artifacts: string[];
  savedTo: string;
}

// ─── PlanOrchestrator ─────────────────────────────────────────────────────────

export class PlanOrchestrator {
  private readonly projectRoot: string;
  private readonly options: Required<Omit<PlanRunOptions, 'modelRouter'>> & { modelRouter?: ModelRouter };
  private readonly renderer: ChatRenderer;
  private readonly stateDir: string;
  private readonly modelRouter?: ModelRouter;

  constructor(projectRoot: string, options: PlanRunOptions = {}) {
    this.projectRoot   = path.resolve(projectRoot);
    this.modelRouter   = options.modelRouter as ModelRouter | undefined;
    this.options = {
      startFrom:    options.startFrom    ?? 'discover',
      skipApproval: options.skipApproval ?? false,
      projectRoot:  this.projectRoot,
      agentsBaseDir: options.agentsBaseDir ?? this.projectRoot,
      verbose:      options.verbose      ?? true,
    };
    this.renderer  = new ChatRenderer();
    this.stateDir  = path.join(this.projectRoot, '.agents', 'plan-state');
  }

  // ─── Public: run a full plan from scratch (or resume) ─────────────────────

  async run(): Promise<PlanResult> {
    const startMs = Date.now();
    fs.mkdirSync(this.stateDir, { recursive: true });

    const r = this.renderer;
    r.say('system', `PlanOrchestrator  ·  project: ${this.projectRoot}`);
    r.say('system', `Start phase: ${this.options.startFrom}`);
    r.newline();
    // ── Model Advisor (before Phase 0) ───────────────────────────────────────
    if (this.modelRouter) {
      const advisor = new PlanModelAdvisor(r, this.modelRouter);
      await advisor.display();
    } else {
      r.say('system', '⚠  No ModelRouter configured — phases will run in heuristic mode.');
      r.say('system', 'Tip: set ANTHROPIC_API_KEY or OPENAI_API_KEY for LLM-backed phase reasoning.');
    }
    r.newline();
    let discovery: DiscoveryResult | null = null;
    let plan: PlanDefinition | null = null;

    // ── Phase 0: DISCOVER ─────────────────────────────────────────────────
    if (this._shouldRun('discover')) {
      const session = new DiscoverySession(r, this.projectRoot, this.modelRouter);
      const saved = DiscoverySession.load(this.projectRoot);
      if (saved && this.options.startFrom !== 'discover') {
        r.system('Resuming — discovery.json found, skipping Phase 0');
        discovery = saved;
      } else {
        discovery = await session.run();
      }
    } else {
      discovery = DiscoverySession.load(this.projectRoot);
      if (!discovery) throw new Error('Cannot skip Phase 0: no discovery.json found in .agents/plan-state/');
    }

    // ── Phase 1: SYNTHESIZE ───────────────────────────────────────────────
    if (this._shouldRun('synthesize')) {
      const synth = new PlanSynthesizer(r, this.projectRoot, this.modelRouter);
      const saved = PlanSynthesizer.load(this.projectRoot);
      if (saved && this.options.startFrom !== 'synthesize') {
        r.system('Resuming — plan.json found, skipping Phase 1');
        plan = saved;
      } else {
        plan = await synth.synthesize(discovery!);
      }
    } else {
      plan = PlanSynthesizer.load(this.projectRoot);
      if (!plan) throw new Error('Cannot skip Phase 1: no plan.json found in .agents/plan-state/');
    }

    // ── Phase 2: DECOMPOSE (sprint planning / backlog) ────────────────────
    const board = new BacklogBoard(r, this.projectRoot);
    if (this._shouldRun('decompose')) {
      board.load();
      await new SprintPlanner(r, this.projectRoot, this.modelRouter).run(plan!, discovery!, board);
    }

    // ── Phase 3: WIRE (decisions + dependency pass) ───────────────────────
    if (this._shouldRun('wire')) {
      r.phaseHeader('wire');
      const arbiter = new Arbiter(r, this.projectRoot, this.modelRouter);
      await arbiter.runStandardDecisions(plan!, board);

      // Micro-alignments from standard cross-agent boundaries
      await arbiter.microAlign('architecture', 'backend', 'API contract ownership', 'API spec produced by Architecture, consumed by Backend');
      await arbiter.microAlign('architecture', 'frontend', 'Auth flow handoff', 'Auth strategy from Architecture determines Frontend routing logic');
      if (plan!.steps.some((s) => s.agent === 'backend') && plan!.steps.some((s) => s.agent === 'testing')) {
        await arbiter.microAlign('backend', 'testing', 'Integration test boundaries', 'Backend declares which endpoints are integration-testable');
      }

      // Mark plan as wired
      plan!.phase = 'wire';
      plan!.updatedAt = new Date().toISOString();
      this._savePlan(plan!);

      r.phaseSummary('wire', [
        `${arbiter.getDecisions().length} decisions recorded`,
        `All parallel groups confirmed`,
        `Alignment gates positioned`,
      ]);
    }

    // ── Phase 4: EXECUTE ──────────────────────────────────────────────────
    const stepResults: PlanStepResult[] = [];
    if (this._shouldRun('execute')) {
      r.phaseHeader('execute');
      plan!.phase = 'execute';
      this._savePlan(plan!);

      stepResults.push(...await this._executeSteps(plan!, r));
    }

    // ── Final summary ─────────────────────────────────────────────────────
    const allArtifacts = stepResults.flatMap((s) => s.artifacts);
    const failed = stepResults.filter((s) => s.status === 'failed');
    const gated  = stepResults.filter((s) => s.status === 'gated');

    const status: PlanResult['status'] =
      failed.length > 0 ? 'failed' :
      gated.length  > 0 ? 'gated'  :
      stepResults.some((s) => s.status === 'skipped') ? 'partial' :
      'success';

    const planObj = plan!;
    planObj.phase     = status === 'success' ? 'complete' : planObj.phase;
    planObj.artifacts = allArtifacts;
    planObj.updatedAt = new Date().toISOString();
    this._savePlan(planObj);

    const result: PlanResult = {
      planId:          planObj.id,
      planName:        planObj.name,
      status,
      phase:           planObj.phase,
      steps:           stepResults,
      totalDurationMs: Date.now() - startMs,
      artifacts:       allArtifacts,
      savedTo:         this.stateDir,
    };

    this._printSummary(result, r);
    return result;
  }

  // ─── Execute steps in dependency order ────────────────────────────────────

  private async _executeSteps(plan: PlanDefinition, r: ChatRenderer): Promise<PlanStepResult[]> {
    const results: PlanStepResult[] = [];
    const completed = new Set<string>();

    // Build execution groups (topological order, parallel within each group)
    const groups = this._topoGroups(plan.steps);

    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      const groupIds = group.map((s) => s.id).join(', ');
      r.say('system', `Group ${gi + 1}/${groups.length}: ${groupIds}`);

      // Check for alignment gate before this group
      for (const step of group) {
        const precedingStep = plan.steps.find((s) =>
          s.alignmentGate && s.alignmentGate.blocksStepIds.includes(step.id)
        );
        if (precedingStep?.alignmentGate && !precedingStep.alignmentGate.resolved) {
          const gate = precedingStep.alignmentGate;
          if (gate.type === 'user') {
            r.approvalPrompt(`Gate "${gate.id}": ${gate.description}  (type Enter to continue)`);
            // In non-interactive mode skip the gate
            if (process.stdout.isTTY) {
              await this._waitForAnyInput();
            }
            gate.resolved = true;
            gate.resolvedAt = new Date().toISOString();
          } else if (gate.type === 'auto') {
            gate.resolved = true;
            gate.resolvedAt = new Date().toISOString();
          }
        }
      }

      // Run group steps (parallel where marked)
      const parallelSteps  = group.filter((s) => s.parallel);
      const sequentialSteps = group.filter((s) => !s.parallel);

      // Sequential first, then parallel batch
      for (const step of sequentialSteps) {
        const res = await this._runStep(step, plan);
        results.push(res);
        if (res.status === 'success') completed.add(step.id);
      }

      if (parallelSteps.length > 0) {
        r.say('system', `Running ${parallelSteps.length} parallel steps: ${parallelSteps.map((s) => s.id).join(', ')}`);
        const parallelResults = await Promise.all(parallelSteps.map((s) => this._runStep(s, plan)));
        for (const res of parallelResults) {
          results.push(res);
          if (res.status === 'success') completed.add(res.stepId);
        }
      }
    }

    return results;
  }

  private async _runStep(step: StepDefinition, plan: PlanDefinition): Promise<PlanStepResult> {
    const r = this.renderer;
    const startMs = Date.now();
    r.say('system', `▶ Step: ${step.id} — ${step.name}`);

    // Find the DAG file for this step (if any task has one)
    const dagFile = step.tasks.find((t) => t.dagFile)?.dagFile
      ?? this._inferDagFile(step, plan);

    if (!dagFile) {
      r.say(step.agent, `No DAG file for step "${step.id}" — marking as skipped.`);
      return {
        stepId: step.id, stepName: step.name,
        status: 'skipped', durationMs: Date.now() - startMs, artifacts: [],
      };
    }

    const dagPath = path.isAbsolute(dagFile)
      ? dagFile
      : path.join(this.options.agentsBaseDir, dagFile);

    if (!fs.existsSync(dagPath)) {
      r.warn(`DAG file not found: ${dagPath} — skipping step "${step.id}"`);
      return {
        stepId: step.id, stepName: step.name,
        status: 'skipped', durationMs: Date.now() - startMs, artifacts: [],
      };
    }

    try {
      const orchestrator = new DagOrchestrator(this.projectRoot, {
        verbose: this.options.verbose,
      });
      const dagResult = await orchestrator.run(dagPath);
      step.status = dagResult.status === 'success' ? 'complete' : 'failed';
      step.completedAt = new Date().toISOString();

      r.say( step.agent,
        dagResult.status === 'success'
          ? `✅ ${step.name} complete — ${dagResult.lanes?.length ?? 0} lane(s)`
          : `❌ ${step.name} failed`,
      );

      return {
        stepId:     step.id,
        stepName:   step.name,
        status:     dagResult.status === 'success' ? 'success' : 'failed',
        dagResult,
        durationMs: Date.now() - startMs,
        artifacts:  step.outputs,
      };
    } catch (err) {
      r.error(`Step "${step.id}" threw: ${err}`);
      step.status = 'failed';
      return {
        stepId: step.id, stepName: step.name,
        status: 'failed', durationMs: Date.now() - startMs, artifacts: [],
      };
    }
  }

  // ─── Topological sort → groups ────────────────────────────────────────────

  private _topoGroups(steps: StepDefinition[]): StepDefinition[][] {
    const remaining = new Set(steps.map((s) => s.id));
    const groups: StepDefinition[][] = [];
    const maxIter = steps.length + 1;
    let i = 0;

    while (remaining.size > 0 && i++ < maxIter) {
      const ready = steps.filter(
        (s) => remaining.has(s.id) && s.dependsOn.every((d) => !remaining.has(d)),
      );
      if (ready.length === 0) break; // cycle guard
      groups.push(ready);
      for (const s of ready) remaining.delete(s.id);
    }
    return groups;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private _shouldRun(phase: PlanPhase): boolean {
    const order: PlanPhase[] = ['discover', 'synthesize', 'decompose', 'wire', 'execute', 'complete'];
    return order.indexOf(phase) >= order.indexOf(this.options.startFrom);
  }

  private _inferDagFile(step: StepDefinition, _plan: PlanDefinition): string | null {
    // Map step agents to known DAG files
    const knownDags: Partial<Record<string, string>> = {
      requirements: 'dag.json',
      architecture: 'dag.json',
      backend:      'dag.json',
      frontend:     'dag.json',
      testing:      'dag.json',
      e2e:          'dag.json',
      security:     'audit.dag.json',
    };
    return knownDags[step.id] ?? null;
  }

  private _savePlan(plan: PlanDefinition): void {
    fs.mkdirSync(this.stateDir, { recursive: true });
    fs.writeFileSync(path.join(this.stateDir, 'plan.json'), JSON.stringify(plan, null, 2));
  }

  private async _waitForAnyInput(): Promise<void> {
    return new Promise((resolve) => {
      process.stdin.once('data', () => resolve());
    });
  }

  private _printSummary(result: PlanResult, r: ChatRenderer): void {
    const statusIcon = result.status === 'success' ? '✅' : result.status === 'partial' ? '⚠️' : '❌';
    r.newline();
    r.separator('═');
    r.say('system', `${statusIcon} PLAN ${result.status.toUpperCase()}: ${result.planName}`);
    r.separator('─');
    r.say('system', `  Steps:    ${result.steps.length}`);
    r.say('system', `  Duration: ${(result.totalDurationMs / 1000).toFixed(1)}s`);
    r.say('system', `  Saved to: ${result.savedTo}`);
    r.separator('─');
    for (const s of result.steps) {
      const icon = s.status === 'success' ? '✅' : s.status === 'skipped' ? '⊘' : s.status === 'gated' ? '⏸' : '❌';
      r.say('system', `  ${icon}  ${s.stepName.padEnd(28)} ${(s.durationMs / 1000).toFixed(1)}s`);
    }
    r.separator('═');
    r.newline();
  }
}
