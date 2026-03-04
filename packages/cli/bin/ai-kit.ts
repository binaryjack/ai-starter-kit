#!/usr/bin/env node
import { Command } from 'commander';
import { runInit } from '../src/commands/init.js';
import { runSync } from '../src/commands/sync.js';
import { runCheck } from '../src/commands/check.js';
import { runMcp } from '../src/commands/mcp.js';
import { runBreakdown, runWorkflow, runValidate, runStatus } from '../src/commands/agents.js';

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
  .command('agent:breakdown <spec-file>')
  .description('Break down specification using Business Analyst agent')
  .action(runBreakdown);

program
  .command('agent:workflow <spec-file>')
  .description('Run full workflow: BA → Architecture → Backend → Frontend → Testing → E2E')
  .action(runWorkflow);

program
  .command('agent:validate <output-file>')
  .description('Validate output against ULTRA_HIGH standards using Supervisor agent')
  .action(runValidate);

program
  .command('agent:status <session-id>')
  .description('Check workflow status')
  .action(runStatus);

program.parse(process.argv);
