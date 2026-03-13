import type { IModelRouter, PlanPhase, PlanResult } from '@ai-agencee/engine';
import { ModelRouter, PlanOrchestrator } from '@ai-agencee/engine';
import * as fs from 'fs';
import * as path from 'path';
import { PHASE_ORDER } from './phase-order.js';
import type { PlanOptions } from './plan-options.types.js';
import { printPlanSummary } from './print-plan-summary.js';

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

  let modelRouter: IModelRouter | undefined;
  try {
    const routerConfigPath = options.modelRouterConfig
      ?? path.join(agentsBaseDir, 'model-router.json');

    const router = fs.existsSync(routerConfigPath)
      ? await ModelRouter.fromFile(routerConfigPath)
      : ModelRouter.fromConfig({
          defaultProvider: options.provider ?? 'anthropic',
          taskProfiles: {},
          providers: {},
        });

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
    console.log(`  LLM provider : ${modelRouter.registeredProviders().join(', ')} (${modelRouter.defaultProvider()})`);
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
