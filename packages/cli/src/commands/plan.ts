/**
 * CLI command handler: agent:plan
 *
 * Runs the full 5-phase Plan System interactively.
 * Each phase can be individually skipped via --start-from.
 */

import * as path from 'path';
import * as fs from 'fs';
import { PlanOrchestrator } from '@ai-agencee/ai-kit-agent-executor';
import type { PlanPhase, PlanResult } from '@ai-agencee/ai-kit-agent-executor';

const PHASE_ORDER: PlanPhase[] = ['discover', 'synthesize', 'decompose', 'wire', 'execute'];

export interface PlanOptions {
  project?: string;
  startFrom?: string;
  agentsDir?: string;
  verbose?: boolean;
  skipApproval?: boolean;
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

  console.log('\n📋  AI Plan Orchestrator');
  console.log('─'.repeat(52));
  console.log(`  Project      : ${projectRoot}`);
  console.log(`  Agents dir   : ${agentsBaseDir}`);
  console.log(`  Start phase  : ${startFrom}`);
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
