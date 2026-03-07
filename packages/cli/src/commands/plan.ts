/**
 * CLI command handler: agent:plan
 *
 * Runs the full 5-phase Plan System interactively.
 * Each phase can be individually skipped via --start-from.
 *
 * LLM provider selection:
 *   --provider anthropic   Use ANTHROPIC_API_KEY  (default when key is set)
 *   --provider openai      Use OPENAI_API_KEY
 *   --provider vscode      Use VS Code Copilot via MCP sampling (no key needed)
 *
 *   If no --provider flag is given we auto-detect from env ($ANTHROPIC_API_KEY,
 *   $OPENAI_API_KEY) at startup.  When no provider is available the plan runs
 *   completely offline in heuristic mode.
 */

import type { PlanPhase, PlanResult } from '@ai-agencee/engine';
import { ModelRouter, PlanOrchestrator } from '@ai-agencee/engine';
import * as fs from 'fs';
import * as path from 'path';

const PHASE_ORDER: PlanPhase[] = ['discover', 'synthesize', 'decompose', 'wire', 'execute'];

export interface PlanOptions {
  project?: string;
  startFrom?: string;
  agentsDir?: string;
  verbose?: boolean;
  skipApproval?: boolean;
  /** Force a specific LLM provider: anthropic | openai | vscode */
  provider?: string;
  /** Path to a custom model-router.json config file */
  modelRouterConfig?: string;
}

export const runPlan = async (options: PlanOptions): Promise<void> => {
  const projectRoot = options.project ? path.resolve(options.project) : process.cwd();
  const agentsBaseDir = options.agentsDir
    ? path.resolve(options.agentsDir)
    : path.join(projectRoot, 'agents');

  const startFrom = (options.startFrom ?? 'discover') as PlanPhase;
  if (!PHASE_ORDER.includes(startFrom)) {
    console.error(`❌ Invalid --start-from value: "${startFrom}"`);
    console.error(`   Valid phases: ${PHASE_ORDER.join(' · ')}`);
    process.exit(1);
  }

  // ── ModelRouter setup ────────────────────────────────────────────────────
  let modelRouter: ModelRouter | undefined;
  try {
    const routerConfigPath = options.modelRouterConfig
      ?? path.join(agentsBaseDir, 'model-router.json');

    const router = fs.existsSync(routerConfigPath)
      ? await ModelRouter.fromFile(routerConfigPath)
      // Minimal in-memory fallback config  
      : ModelRouter.fromConfig({
          defaultProvider: options.provider ?? 'anthropic',
          taskProfiles: {},
          providers: {},
        });

    // Auto-detect providers from env vars (ANTHROPIC_API_KEY, OPENAI_API_KEY)
    await router.autoRegister();

    if (router.registeredProviders.length > 0) {
      modelRouter = router;
    }
  } catch {
    // Non-fatal — plan runs offline if router init fails
  }

  console.log('\n📋  AI Plan Orchestrator');
  console.log('─'.repeat(52));
  console.log(`  Project      : ${projectRoot}`);
  console.log(`  Agents dir   : ${agentsBaseDir}`);
  console.log(`  Start phase  : ${startFrom}`);
  if (modelRouter) {
    console.log(`  LLM provider : ${modelRouter.registeredProviders.join(', ')} (${modelRouter.defaultProvider})`);
  } else {
    console.log(`  LLM provider : none — heuristic mode`);
    if (!options.provider) {
      console.log(`  Tip          : set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable AI reasoning`);
    }
  }
  if (options.skipApproval) {
    console.log(`  Mode         : non-interactive (--skip-approval)`);
  }
  console.log('');

  // Check agents dir exists
  if (!fs.existsSync(agentsBaseDir)) {
    console.warn(`⚠️  Agents directory not found: ${agentsBaseDir}`);
    console.warn('   Plan phases 0-3 will still run; Phase 4 (execute) will skip steps without DAG files.');
    console.log('');
  }

  try {
    const orchestrator = new PlanOrchestrator(projectRoot, {
      startFrom,
      skipApproval: options.skipApproval ?? false,
      agentsBaseDir,
      verbose: options.verbose ?? true,
      modelRouter,
    });

    const result: PlanResult = await orchestrator.run();
    printPlanSummary(result);

    if (result.status === 'failed') {
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ Plan execution failed: ${err}\n`);
    process.exit(1);
  }
};

function printPlanSummary(result: PlanResult): void {
  const icon = result.status === 'success' ? '✅' : result.status === 'partial' ? '⚠️' : '❌';
  console.log('\n' + '═'.repeat(52));
  console.log(`  ${icon}  PLAN ${result.status.toUpperCase()}: ${result.planName}`);
  console.log('═'.repeat(52));
  console.log(`  Plan ID  : ${result.planId}`);
  console.log(`  Phase    : ${result.phase}`);
  console.log(`  Duration : ${(result.totalDurationMs / 1000).toFixed(1)}s`);
  console.log(`  Steps    : ${result.steps.length}`);
  console.log(`  Saved to : ${result.savedTo}`);
  if (result.steps.length > 0) {
    console.log('');
    console.log('  Step Results:');
    for (const s of result.steps) {
      const sIcon = s.status === 'success' ? '✅' : s.status === 'skipped' ? '⊘ ' : s.status === 'gated' ? '⏸' : '❌';
      console.log(`    ${sIcon}  ${s.stepName}`);
    }
  }
  console.log('═'.repeat(52));
  console.log(`\n  💾 Full state saved → ${result.savedTo}\n`);
}
