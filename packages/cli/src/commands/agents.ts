import { DagOrchestrator, DagResult } from '@ai-agencee/ai-kit-agent-executor';
import * as path from 'path';

// ─── agent:dag ────────────────────────────────────────────────────────────────

export const runDag = async (
  dagFile: string,
  options: {
    project?: string;
    verbose?: boolean;
    dryRun?: boolean;
    interactive?: boolean;
    budget?: string;   // raw string from CLI, parsed as float
    provider?: string;
  },
): Promise<void> => {
  const projectRoot = options.project ? path.resolve(options.project) : process.cwd();
  const dagFilePath = path.isAbsolute(dagFile) ? dagFile : path.resolve(projectRoot, dagFile);

  console.log('\n🗂️  DAG Supervised Agent Executor');
  console.log('─'.repeat(52));
  console.log(`  DAG file   : ${path.relative(projectRoot, dagFilePath)}`);
  console.log(`  Project    : ${projectRoot}`);

  if (options.dryRun) {
    try {
      const orchestrator = new DagOrchestrator(projectRoot, { verbose: false });
      const dag = await orchestrator.loadDag(dagFilePath);
      console.log(`\n✅ DAG validated: "${dag.name}"`);
      console.log(`   ${dag.lanes.length} lane(s):`);
      for (const lane of dag.lanes) {
        const deps = lane.dependsOn?.length ? ` (after: ${lane.dependsOn.join(', ')})` : '';
        const sup = lane.supervisorFile ? ' 🔍' : '';
        console.log(`     • ${lane.id}${deps}${sup}`);
      }
      if (dag.globalBarriers?.length) {
        console.log(`   ${dag.globalBarriers.length} global barrier(s):`);
        for (const b of dag.globalBarriers) {
          console.log(`     ⏸  ${b.name} [${b.participants.join(', ')}] timeout=${b.timeoutMs}ms`);
        }
      }
      console.log('\n  (dry-run — no lanes executed)\n');
    } catch (err) {
      console.error(`\n❌ DAG validation failed: ${err}\n`);
      process.exit(1);
    }
    return;
  }

  console.log('');

  const budgetCapUSD = options.budget !== undefined ? parseFloat(options.budget) : undefined;
  if (options.budget !== undefined) {
    console.log(`  Budget cap  : $${budgetCapUSD} USD`);
  }
  if (options.interactive) {
    console.log('  Interactive : enabled (needs-human-review prompts will pause for operator input)');
  }
  if (options.provider) {
    console.log(`  Provider    : ${options.provider}`);
  }

  try {
    const orchestrator = new DagOrchestrator(projectRoot, {
      verbose: options.verbose ?? true,
      budgetCapUSD,
      interactive: options.interactive,
      forceProvider: options.provider,
    });
    const result: DagResult = await orchestrator.run(dagFilePath);
    printDagSummary(result, projectRoot);
    if (result.status === 'failed') {
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ DAG execution failed: ${err}\n`);
    process.exit(1);
  }
};

// ─── Summary renderer ─────────────────────────────────────────────────────

function printDagSummary(result: DagResult, projectRoot: string): void {
  const W = 60;
  const line = '─'.repeat(W);

  console.log(`\n${'\u2550'.repeat(W)}`);
  console.log(`  📊  DAG RESULT: ${result.dagName}`);
  console.log(`${'\u2550'.repeat(W)}`);

  const statusIcon =
    result.status === 'success' ? '✅' : result.status === 'partial' ? '⚠️ ' : '❌';
  console.log(`  Status     : ${statusIcon}  ${result.status.toUpperCase()}`);
  console.log(`  Run ID     : ${result.runId}`);
  console.log(`  Duration   : ${result.totalDurationMs}ms`);
  console.log(`  Lanes      : ${result.lanes.length}`);

  console.log(`\n${line}`);
  console.log(
    `  ${'Lane'.padEnd(22)} ${'Status'.padEnd(12)} ${'Chk'.padStart(4)} ${'Ret'.padStart(4)} ${'ms'.padStart(7)}`,
  );
  console.log(line);

  for (const lane of result.lanes) {
    const icon =
      lane.status === 'success'
        ? '✅'
        : lane.status === 'escalated'
          ? '🚨'
          : lane.status === 'timed-out'
            ? '⏱️ '
            : '❌';
    const name = lane.laneId.padEnd(22);
    const status = (icon + ' ' + lane.status).padEnd(12);
    const chk = String(lane.checkpoints.length).padStart(4);
    const ret = String(lane.totalRetries).padStart(4);
    const ms = String(lane.durationMs).padStart(7);
    console.log(`  ${name} ${status} ${chk} ${ret} ${ms}`);
    if (lane.error) {
      console.log(`     └─ ${lane.error}`);
    }
  }
  console.log(line);

  if (result.findings.length > 0) {
    console.log(`\n  📋 Findings (${result.findings.length}):`);
    result.findings.slice(0, 20).forEach((f) => console.log(`    ${f}`));
    if (result.findings.length > 20) {
      console.log(`    … and ${result.findings.length - 20} more`);
    }
  }

  if (result.recommendations.length > 0) {
    console.log(`\n  💡 Recommendations (${result.recommendations.length}):`);
    result.recommendations.slice(0, 10).forEach((r) => console.log(`    • ${r}`));
    if (result.recommendations.length > 10) {
      console.log(`    • … and ${result.recommendations.length - 10} more`);
    }
  }

  const resultFile = path.join('.agents', 'results', `dag-${result.runId}.json`);
  console.log(`\n  💾 Full result: ${resultFile}`);
  console.log(`${'\u2550'.repeat(W)}\n`);
}
