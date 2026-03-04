#!/usr/bin/env node
import { Command } from 'commander';
import { runDag } from '../src/commands/agents.js';
import { runCheck } from '../src/commands/check.js';
import { runInit } from '../src/commands/init.js';
import { runMcp } from '../src/commands/mcp.js';
import { runPlan } from '../src/commands/plan.js';
import { runSync } from '../src/commands/sync.js';

const program = new Command();

program
  .name('ai-kit')
  .description('AI starter kit CLI - Scaffolding, validation, MCP server, and agent orchestration')
  .version('1.2.1');

program
  .command('init')
  .description('Scaffold AI rule files into the current project')
  .option('-t, --strict', 'Initialize with ULTRA_HIGH strict standards (TADEO rules)')
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
  .option('-p, --project <path>',     'Project root directory (default: cwd)')
  .option('-a, --agents-dir <path>',  'Directory containing agent/supervisor JSON files (default: <project>/agents)')
  .option('--start-from <phase>',     'Resume from a specific phase: discover · synthesize · decompose · wire · execute')
  .option('--skip-approval',          'Skip user approval gates (non-interactive / CI mode)')
  .option('-v, --verbose',            'Enable verbose DAG output during execution phase')
  .action((options) =>
    runPlan({
      project:      options.project,
      agentsDir:    options.agentsDir,
      startFrom:    options.startFrom,
      skipApproval: options.skipApproval,
      verbose:      options.verbose,
    }),
  );

program.parse(process.argv);
