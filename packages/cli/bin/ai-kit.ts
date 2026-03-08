#!/usr/bin/env node
import { Command } from 'commander'
import { runDag } from '../src/commands/agents.js'
import { runBenchmark } from '../src/commands/benchmark.js'
import { runCheck } from '../src/commands/check.js'
import { runDataDelete, runDataExport, runDataListTenants } from '../src/commands/data.js'
import { runInit } from '../src/commands/init.js'
import { runMcp } from '../src/commands/mcp.js'
import { runPlan } from '../src/commands/plan.js'
import { runSync } from '../src/commands/sync.js'
import { runVisualize } from '../src/commands/visualize.js'

const program = new Command();

program
  .name('ai-kit')
  .description('AI starter kit CLI - Scaffolding, validation, MCP server, and agent orchestration')
  .version('1.2.1');

program
  .command('init')
  .description('Scaffold AI rule files into the current project')
  .option('-t, --strict', 'Initialize with ULTRA_HIGH strict standards (OWNER rules)')
  .action((options) => runInit({ strict: options.strict }));

program
  .command('sync')
  .description('Sync AI rule files with the latest template')
  .action(runSync);

program
  .command('check')
  .description('Validate project structure against AI rules')
  .action(runCheck);

program
  .command('mcp')
  .description('Start MCP server for AI assistant integration')
  .action(runMcp);

// Agent commands
program
  .command('agent:dag [dag-file]')
  .description('Run multi-lane supervised DAG execution (default: agents/dag.json)')
  .option('-p, --project <path>', 'Project root directory (default: cwd)')
  .option('-v, --verbose', 'Enable verbose output with per-checkpoint details')
  .option('--dry-run', 'Validate the DAG config and print execution plan without running')
  .option('-i, --interactive', 'Pause at needs-human-review checkpoints and prompt for operator decision')
  .option('--budget <usd>', 'Abort the run when estimated LLM spend exceeds this USD amount')
  .option('--provider <name>', 'Override the LLM provider for all lanes (e.g. anthropic, openai, mock)')
  .action((dagFile, options) =>
    runDag(dagFile ?? 'agents/dag.json', {
      project: options.project,
      verbose: options.verbose,
      dryRun: options.dryRun,
      interactive: options.interactive,
      budget: options.budget,
      provider: options.provider,
    }),
  );

// Plan commands
program
  .command('agent:plan')
  .description('Run the interactive 5-phase Plan System (Discovery → Synthesize → Decompose → Wire → Execute)')
  .option('-p, --project <path>',           'Project root directory (default: cwd)')
  .option('-a, --agents-dir <path>',        'Directory containing agent/supervisor JSON files (default: <project>/agents)')
  .option('--start-from <phase>',           'Resume from a specific phase: discover · synthesize · decompose · wire · execute')
  .option('--skip-approval',                'Skip user approval gates (non-interactive / CI mode)')
  .option('-v, --verbose',                  'Enable verbose DAG output during execution phase')
  .option('--provider <name>',              'LLM provider to use: anthropic · openai · vscode (auto-detect from env if omitted)')
  .option('--model-router-config <path>',   'Path to a custom model-router.json config file')
  .action((options) =>
    runPlan({
      project:           options.project,
      agentsDir:         options.agentsDir,
      startFrom:         options.startFrom,
      skipApproval:      options.skipApproval,
      verbose:           options.verbose,
      provider:          options.provider,
      modelRouterConfig: options.modelRouterConfig,
    }),
  );

// Benchmark command
program
  .command('agent:benchmark')
  .description('Benchmark registered LLM providers — latency, throughput, cost per request')
  .option('--providers <names>', 'Comma-separated provider names to test (default: all registered)')
  .option('--suite <name>', 'Prompt suite: minimal | code-review (default: minimal)')
  .option('--runs <n>', 'Repetitions per prompt', '1')
  .option('--router-file <path>', 'Path to model-router.json (default: agents/model-router.json)')
  .option('-p, --project <path>', 'Project root directory (default: cwd)')
  .option('--output <file>', 'Write JSON report to this file')
  .action((options) =>
    runBenchmark({
      providers: options.providers,
      suite: options.suite,
      runs: options.runs ? parseInt(options.runs, 10) : 1,
      routerFile: options.routerFile,
      project: options.project,
      output: options.output,
    }),
  );

// DAG visualizer (E7)
program
  .command('dag:visualize <dag-file>')
  .description('Render a DAG JSON as a Mermaid flowchart or Graphviz DOT diagram')
  .option('-o, --output <file>', 'Write diagram to a file instead of printing to stdout')
  .option('-f, --format <fmt>', 'Output format: mermaid (default) or dot', 'mermaid')
  .action((dagFile, options) =>
    runVisualize(dagFile, {
      output: options.output,
      format: options.format,
    }),
  );

// GDPR data commands (E4)
program
  .command('data:export')
  .description('Export all run data for a tenant (GDPR Art. 20 — Data Portability)')
  .option('-t, --tenant <id>', 'Tenant ID (default: AIKIT_TENANT_ID env var or "default")')
  .requiredOption('-d, --dest <dir>', 'Destination directory for the export')
  .action((options) =>
    runDataExport({
      tenant: options.tenant,
      dest: options.dest,
    }),
  );

program
  .command('data:delete')
  .description('Permanently delete all run data for a tenant (GDPR Art. 17 — Erasure)')
  .option('-t, --tenant <id>', 'Tenant ID (default: AIKIT_TENANT_ID env var or "default")')
  .option('--confirm', 'Required: confirm you intend to delete all data irreversibly')
  .action((options) =>
    runDataDelete({
      tenant: options.tenant,
      confirm: options.confirm,
    }),
  );

program
  .command('data:list-tenants')
  .description('List all tenant IDs stored under .agents/tenants/')
  .action(runDataListTenants);

program.parse(process.argv);
