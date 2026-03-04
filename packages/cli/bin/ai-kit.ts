#!/usr/bin/env node
import { Command } from 'commander';
import { runInit } from '../src/commands/init.js';
import { runSync } from '../src/commands/sync.js';
import { runCheck } from '../src/commands/check.js';

const program = new Command();

program
  .name('ai-kit')
  .description('AI starter kit CLI')
  .version('1.0.0');

program
  .command('init')
  .description('Scaffold AI rule files into the current project')
  .action(runInit);

program
  .command('sync')
  .description('Sync AI rule files with the latest template')
  .action(runSync);

program
  .command('check')
  .description('Validate project structure against AI rules')
  .action(runCheck);

program.parse(process.argv);
