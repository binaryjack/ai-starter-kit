import { randomUUID } from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'
import { AuditLog } from './audit-log.js'
import { BarrierCoordinator } from './barrier-coordinator.js'
import { ContractRegistry } from './contract-registry.js'
import { CostTracker } from './cost-tracker.js'
import { getGlobalEventBus } from './dag-events.js'
import { DagPlanner } from './dag-planner.js'
import { DagResultBuilder } from './dag-result-builder.js'
import {
  DagDefinition,
  DagResult,
  LaneResult,
} from './dag-types.js'
import { runLane } from './lane-executor.js'
import { SamplingCallback } from './llm-provider.js'
import { ModelRouterFactory } from './model-router-factory.js'
import { ModelRouter } from './model-router.js'
import { getGlobalTracer } from './otel.js'
import { RbacPolicy } from './rbac.js'
import { createDefaultSecretsProvider, injectSecretsToEnv, SecretsProvider } from './secrets.js'
import { RunRegistry } from './run-registry.js'

// ─── DagRunOptions ──────────────────────────────────────────────────────────────

export interface DagRunOptions {
  verbose?: boolean;
  resultsDir?: string;
  /** USD spend cap for the entire run. Lanes stop when the cap is exceeded. */
  budgetCapUSD?: number;
  /** Pause at needs-human-review checkpoints and prompt the operator for a decision. */
  interactive?: boolean;
  /**
   * Path to a model-router.json file (relative to projectRoot).
   * Overrides dag.json's modelRouterFile field when provided.
   */
  modelRouterFile?: string;
  /**
   * Override the directory that contains agent/supervisor JSON files.
   * When not set, defaults to the directory of the dag.json file itself.
   */
  agentsBaseDir?: string;
  /**
   * Inject a VS Code sampling callback (MCP server context).
   * When provided a VSCodeSamplingProvider is registered as 'vscode' and set
   * as the default provider, bypassing the need for API keys.
   */
  samplingCallback?: SamplingCallback;
  /**
   * Force all lanes to use a specific provider regardless of model-router.json.
   * Use 'mock' to run without API keys (e.g. pnpm demo, CI dry-runs).
   * Valid values: 'anthropic' | 'openai' | 'vscode' | 'mock'
   */
  forceProvider?: string;
  /**
   * Override the resolved principal for RBAC checks.
   * Defaults to `RbacPolicy.resolvePrincipal()` (env var ? git author ? username).
   */
  principal?: string;
  /**
   * Pre-loaded RBAC policy.  When not provided the policy is loaded from
   * `.agents/rbac.json`; permissive if the file is absent.
   */
  rbacPolicy?: RbacPolicy;
  /**
   * Secrets provider used to inject API keys and credentials.
   * Defaults to a composite of `process.env` + `.env` / `.env.local` files.
   * Pass a `StaticSecretsProvider` in tests to avoid touching the filesystem.
   */
  secrets?: SecretsProvider;
  /**
   * Additional secret key names to inject into `process.env` beyond the
   * built-in list (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.).
   */
  extraSecretKeys?: string[];
}

// ─── DagOrchestrator ──────────────────────────────────────────────────────────

/**
 * Top-level DAG execution engine.
 *
 * Responsibilities:
 *   1. Load + validate a dag.json        → delegated to DagPlanner
 *   2. Topological sort → execution groups → delegated to DagPlanner
 *   3. Promise.allSettled per group       → parallel lane execution
 *   4. Shared ContractRegistry + BarrierCoordinator across all lanes
 *   5. Merge LaneResults → DagResult     → delegated to DagResultBuilder
 *   6. Persist result to .agents/results/ → delegated to DagResultBuilder
 *
 * Usage:
 *   const result = await DagOrchestrator.run('agents/dag.json', projectRoot);
 */
export class DagOrchestrator {
  private readonly projectRoot: string;
  private readonly resultsDir: string;
  private readonly options: DagRunOptions;
  private verbose: boolean;

  constructor(projectRoot: string, options?: DagRunOptions) {
    this.projectRoot = projectRoot;
    this.options     = options ?? {};
    this.verbose     = options?.verbose ?? false;
    this.resultsDir  =
      options?.resultsDir ?? path.join(projectRoot, '.agents', 'results');
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Load a dag.json file, validate it, then execute all lanes */
  async run(dagFile: string): Promise<DagResult> {
    const dagPath = path.isAbsolute(dagFile) ? dagFile : path.resolve(this.projectRoot, dagFile);
    const dagDir  = path.dirname(dagPath);
    const dag     = await this.loadDag(dagPath);
    return this.execute(dag, dagDir);
  }

  /**
   * Execute a pre-loaded DagDefinition.
   * @param dag    Parsed DAG definition
   * @param dagDir Directory of the dag.json — used to resolve agent/supervisor/router paths.
   *               Defaults to projectRoot when not provided.
   */
  async execute(dag: DagDefinition, dagDir?: string): Promise<DagResult> {
    const agentsBaseDir = this.options.agentsBaseDir ?? dagDir ?? this.projectRoot;
    const runId         = randomUUID();
    const startedAt     = new Date().toISOString();
    const startMs       = Date.now();

    this.log(`\n🚀  Starting DAG run: ${dag.name}  [${runId}]`);
    this.log(`   ${dag.description}\n`);
    // �"� Audit log �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�
    // Secrets: inject API keys from provider before any lane executes
    const secretsProvider = this.options.secrets ?? createDefaultSecretsProvider(this.projectRoot);
    await injectSecretsToEnv(secretsProvider, this.options.extraSecretKeys);

    // Run registry: provision isolated directories for this run
    const runRegistry = new RunRegistry(this.projectRoot);
    const runPaths    = await runRegistry.create(runId, dag.name);

    // Event bus: broadcast dag:start to all subscribers
    getGlobalEventBus().emitDagStart({
      runId,
      dagName:   dag.name,
      laneIds:   dag.lanes.map((l) => l.id),
      principal: this.options.principal,
      timestamp: startedAt,
    });

    const auditLog = new AuditLog(this.projectRoot, runId, runPaths.auditDir);
    await auditLog.open();
    await auditLog.runStart({ dagName: dag.name, lanes: dag.lanes.map((l) => l.id) });
    // �"� RBAC �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�
    const principal = this.options.principal ?? RbacPolicy.resolvePrincipal();
    const rbac      = this.options.rbacPolicy ?? await RbacPolicy.load(this.projectRoot);
    this.log(`   Principal: ${principal}`);
    void auditLog.decision(principal, 'run-start', JSON.stringify(rbac.summarize()));

    // �"� OpenTelemetry root span �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�
    const rootSpan = getGlobalTracer().startDagRun(runId, dag.name);
    // ─ Cost tracking ──────────────────────────────────────────────────────────
    let aborted = false;
    const costTracker =
      this.options.budgetCapUSD !== undefined
        ? new CostTracker(runId, this.options.budgetCapUSD, () => {
            aborted = true;
            this.log(`\n💸  Budget cap of $${this.options.budgetCapUSD} USD exceeded — aborting remaining lane groups`);
            getGlobalEventBus().emitBudgetExceeded({
              runId,
              limitUSD:  this.options.budgetCapUSD!,
              actualUSD: this.options.budgetCapUSD!, // cost has met or exceeded the cap
              scope:     'run',
              timestamp: new Date().toISOString(),
            });
          })
        : undefined;

    // ─ Model router ───────────────────────────────────────────────────────────
    const routerFile = this.options.modelRouterFile ?? dag.modelRouterFile;
    const modelRouter: ModelRouter | undefined = await ModelRouterFactory.create({
      routerFilePath:   routerFile,
      samplingCallback: this.options.samplingCallback,
      agentsBaseDir,
      forceProvider:    this.options.forceProvider,
      log: (msg) => this.log(msg),
    });

    // ─ Shared infrastructure ──────────────────────────────────────────────────
    const registry       = new ContractRegistry();
    const coordinator    = new BarrierCoordinator(registry);
    const capabilityRegistry = DagPlanner.buildCapabilityRegistry(dag);

    // ─ Topological execution order ────────────────────────────────────────────
    const groups = DagPlanner.topologicalSort(dag.lanes);
    this.log(
      `   Execution plan: ${groups
        .map((g, i) => `Group ${i + 1}: [${g.map((l) => l.id).join(', ')}]`)
        .join(' → ')}\n`,
    );

    const allLaneResults: LaneResult[] = [];

    for (let gi = 0; gi < groups.length; gi++) {
      if (aborted) break;

      const group          = groups[gi];
      // RBAC: skip lanes the current principal is not permitted to run
      const lanePerms      = rbac.checkLanes(principal, group.map((l) => l.id));
      const permittedGroup = group.filter((l) => {
        if (!lanePerms[l.id]) {
          this.log(`   ⛔ [${l.id}] skipped — principal "${principal}" does not have run permission`);
          getGlobalEventBus().emitRbacDenied({
            runId,
            principal,
            action:    `run-lane:${l.id}`,
            reason:    `Principal "${principal}" does not have run permission for lane "${l.id}"`,
            timestamp: new Date().toISOString(),
          });
          return false;
        }
        return true;
      });
      this.log(`▶  Group ${gi + 1}/${groups.length}: ${permittedGroup.map((l) => l.id).join(' + ')}`);

      const groupStartMs = Date.now();
      const settled = await Promise.allSettled(
        permittedGroup.map((lane) =>
          runLane(
            lane, this.projectRoot, registry, coordinator,
            capabilityRegistry, modelRouter, costTracker,
            this.options.interactive, agentsBaseDir, auditLog, runPaths.checkpointsDir, runId,
          ),
        ),
      );

      for (let li = 0; li < settled.length; li++) {
        const outcome = settled[li];
        const lane    = permittedGroup[li];

        if (outcome.status === 'fulfilled') {
          allLaneResults.push(outcome.value);
          const s    = outcome.value.status;
          const icon = s === 'success' ? '✅' : s === 'escalated' ? '🚨' : '❌';
          this.log(
            `   ${icon} [${lane.id}] ${s} — ${outcome.value.checkpoints.length} checkpoints, ` +
            `${outcome.value.totalRetries} retries, ${outcome.value.durationMs}ms`,
          );
        } else {
          allLaneResults.push({
            laneId:           lane.id,
            status:           'failed',
            checkpoints:      [],
            totalRetries:     0,
            handoffsReceived: 0,
            startedAt:        new Date().toISOString(),
            completedAt:      new Date().toISOString(),
            durationMs:       Date.now() - groupStartMs,
            error:            String(outcome.reason),
          });
          this.log(`   ❌ [${lane.id}] failed — ${outcome.reason}`);
        }
      }

      // Handle global barriers that follow this group
      if (dag.globalBarriers) {
        for (const barrier of dag.globalBarriers) {
          const groupLaneIds                 = new Set(group.map((l) => l.id));
          const barrierParticipantsInGroup   = barrier.participants.filter((p) =>
            groupLaneIds.has(p),
          );
          if (barrierParticipantsInGroup.length === barrier.participants.length) {
            this.log(`⏳  Global barrier "${barrier.name}" — waiting for all participants…`);
            const resolution = await coordinator.resolveGlobalBarrier(
              barrier.participants,
              barrier.timeoutMs,
            );
            if (!resolution.resolved) {
              this.log(`⚠️   Barrier "${barrier.name}" timed out for: ${resolution.timedOut.join(', ')}`);
            } else {
              this.log(`✅  Barrier "${barrier.name}" resolved`);
            }
          }
        }
      }
    }

    const completedAt    = new Date().toISOString();
    const totalDurationMs = Date.now() - startMs;

    const dagResult = DagResultBuilder.build({
      dagName: dag.name,
      runId,
      laneResults: allLaneResults,
      startedAt,
      completedAt,
      totalDurationMs,
    });

    // Event bus: broadcast dag:end to all subscribers
    getGlobalEventBus().emitDagEnd({
      runId,
      dagName:    dag.name,
      durationMs: totalDurationMs,
      status:     dagResult.status as 'success' | 'partial' | 'failed',
      timestamp:  completedAt,
    });

    this.log(
      `\n${dagResult.status === 'success' ? '✅' : dagResult.status === 'partial' ? '⚠️ ' : '❌'}` +
      `  DAG complete: ${dagResult.status.toUpperCase()} in ${totalDurationMs}ms`,
    );
    this.log(`   ${dagResult.findings.length} findings, ${dagResult.recommendations.length} recommendations\n`);

    await DagResultBuilder.save(dagResult, runPaths.resultsDir, this.projectRoot, (m) => this.log(m));

    // Cost report
    if (costTracker) {
      this.log(costTracker.formatReport());
      await costTracker.save(runPaths.resultsDir);
    }

    // ─ Close OTEL root span ────────────────────────────────────────────────────
    rootSpan
      .setAttribute('dag.name', dag.name)
      .setAttribute('dag.runId', runId)
      .setAttribute('dag.status', dagResult.status)
      .setStatus(dagResult.status === 'failed' ? 'error' : 'ok')
      .end();

    // ─ Close audit log ─────────────────────────────────────────────────────────
    await auditLog.runEnd(totalDurationMs, { status: dagResult.status, findings: dagResult.findings.length });
    await auditLog.close();

    // ─ Mark run complete in registry ──────────────────────────────────────────
    await runRegistry.complete(runId, dagResult.status as import('./run-registry.js').RunStatus, totalDurationMs);

    return dagResult;
  }

  // ─── Load & Validate ────────────────────────────────────────────────────────

  async loadDag(dagFilePath: string): Promise<DagDefinition> {
    const raw = await fs.readFile(dagFilePath, 'utf-8');
    const dag: DagDefinition = JSON.parse(raw);
    DagPlanner.validateDag(dag);
    return dag;
  }

  // ─── Logging ──────────────────────────────────────────────────────────────

  private log(msg: string): void {
    if (this.verbose) {
      process.stdout.write(msg + '\n');
    }
  }
}
