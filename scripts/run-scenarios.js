#!/usr/bin/env node
/**
 * run-scenarios.js — Interactive menu runner for advanced demo scenarios
 *
 * Runs one of the 6 demo scenarios (or all) using the built-in MockProvider
 * so no API keys are required.
 *
 * Usage:
 *   node scripts/run-scenarios.js          # interactive menu
 *   node scripts/run-scenarios.js 1        # run scenario 01 directly
 *   node scripts/run-scenarios.js all      # run all scenarios in sequence
 *
 * Convenience scripts (after pnpm build):
 *   pnpm demo:01  through  pnpm demo:06
 *   pnpm demo:menu
 *   pnpm demo:all
 */

'use strict';

const { spawnSync }   = require('child_process');
const readline        = require('readline');
const path            = require('path');

const root  = path.resolve(__dirname, '..');
const cliJs = path.join(root, 'packages', 'cli', 'dist', 'bin', 'ai-kit.js');

// ─── Scenario registry ────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    id: '01',
    label: 'App Boilerplate',
    description: 'RETRY × 2 (scaffold lane)  ·  parallel backend+frontend  ·  hard-barrier before integration',
    dag: path.join(root, 'agents', 'demos', '01-app-boilerplate', 'boilerplate.dag.json'),
    tags: ['retry', 'hard-barrier', 'parallel'],
  },
  {
    id: '02',
    label: 'Enterprise Skeleton',
    description: 'HANDOFF (db-schema → auth-module)  ·  needs-human-review gate  ·  parallel first group',
    dag: path.join(root, 'agents', 'demos', '02-enterprise-skeleton', 'enterprise.dag.json'),
    tags: ['handoff', 'human-review', 'parallel'],
  },
  {
    id: '03',
    label: 'Website Build',
    description: 'ESCALATE terminal 🚨 (SEO lane)  ·  partial DAG continues  ·  publish-readiness still runs',
    dag: path.join(root, 'agents', 'demos', '03-website-build', 'website.dag.json'),
    tags: ['escalate', 'partial-dag'],
  },
  {
    id: '04',
    label: 'Feature in Context',
    description: 'read-contract  ·  soft-align cross-lane sync  ·  timeoutMs + fallback',
    dag: path.join(root, 'agents', 'demos', '04-feature-in-context', 'feature.dag.json'),
    tags: ['read-contract', 'soft-align', 'barrier'],
  },
  {
    id: '05',
    label: 'MVP Sprint',
    description: 'Flaky rapid-frontend (RETRY × 2)  ·  market-scan RETRY × 1  ·  mixed-result sprint',
    dag: path.join(root, 'agents', 'demos', '05-mvp-sprint', 'mvp.dag.json'),
    tags: ['retry', 'flaky', 'mixed-results'],
  },
  {
    id: '06',
    label: 'Resilience Showcase',
    description: 'ALL error types in one run: APPROVE · RETRY · HANDOFF · ESCALATE · hard-barrier · needs-human-review',
    dag: path.join(root, 'agents', 'demos', '06-resilience-showcase', 'resilience.dag.json'),
    tags: ['all-types', 'showcase'],
  },
];

// ─── Rendering helpers ────────────────────────────────────────────────────────

function printBanner() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     AI Agencee  ·  Advanced Demo Scenarios (mock)       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

function printMenu() {
  SCENARIOS.forEach((s, i) => {
    const num   = String(i + 1).padStart(2);
    const label = s.label.padEnd(22);
    console.log(`  ${num}. ${label}  ${s.description}`);
  });
  console.log('\n   7. Run ALL scenarios in sequence');
  console.log('   0. Exit\n');
}

function printScenarioHeader(scenario) {
  const bar = '─'.repeat(62);
  console.log(`\n┌${bar}┐`);
  console.log(`│  Scenario ${scenario.id}: ${scenario.label.padEnd(bar.length - 15)}│`);
  console.log(`│  Tags: ${scenario.tags.join(', ').padEnd(bar.length - 9)}│`);
  console.log(`└${bar}┘\n`);
  console.log(`  DAG : ${scenario.dag}`);
  console.log(`  Mode: mock provider (zero API costs)\n`);
}

// ─── Runner ───────────────────────────────────────────────────────────────────

function runScenario(scenario, { interactive = false } = {}) {
  printScenarioHeader(scenario);

  const args = [
    cliJs,
    'agent:dag',
    scenario.dag,
    '--provider', 'mock',
    '--verbose',
  ];

  if (interactive) {
    args.push('--interactive');
  }

  const result = spawnSync(process.execPath, args, {
    stdio : 'inherit',
    cwd   : root,
  });

  const ok = result.status === 0;
  if (!ok) {
    // Some scenarios intentionally escalate — non-zero exit is expected
    console.log(`\n  └─ Scenario ${scenario.id} exited with status ${result.status ?? 'null'} (may be intentional for escalation demos)\n`);
  } else {
    console.log(`\n  └─ Scenario ${scenario.id} completed ✓\n`);
  }
  return ok;
}

function runAll() {
  const results = [];
  for (const s of SCENARIOS) {
    const ok = runScenario(s);
    results.push({ id: s.id, label: s.label, ok });
    console.log('  Press Enter to continue to the next scenario...');
    // Brief synchronous pause so output doesn't scroll too fast
    spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},2000)'], { stdio: 'inherit' });
  }

  // Summary table
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Run-all summary                                             ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  results.forEach(r => {
    const icon  = r.ok ? '✓' : '~';
    const label = `${r.id}: ${r.label}`.padEnd(52);
    console.log(`║  ${icon}  ${label} ║`);
  });
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

// ─── Interactive menu ─────────────────────────────────────────────────────────

function interactiveMenu() {
  printBanner();
  printMenu();

  const rl = readline.createInterface({
    input : process.stdin,
    output: process.stdout,
  });

  rl.question('  Select scenario [0-7]: ', answer => {
    rl.close();
    const choice = answer.trim();

    if (choice === '0' || choice === '') {
      console.log('\n  Bye!\n');
      return;
    }

    if (choice === '7' || choice.toLowerCase() === 'all') {
      runAll();
      return;
    }

    const idx = parseInt(choice, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= SCENARIOS.length) {
      console.error(`\n  Unknown choice: "${choice}". Run again and pick 1-7.\n`);
      process.exit(1);
    }

    const scenario     = SCENARIOS[idx];
    // Scenario 02 and 06 have needs-human-review lanes — ask about --interactive
    const hasHumanGate = ['02', '06'].includes(scenario.id);
    if (hasHumanGate) {
      const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl2.question('  This scenario has a needs-human-review gate. Run with --interactive? [y/N]: ', ans => {
        rl2.close();
        runScenario(scenario, { interactive: ans.trim().toLowerCase() === 'y' });
      });
    } else {
      runScenario(scenario);
    }
  });
}

// ─── Entry point ──────────────────────────────────────────────────────────────

printBanner();

const arg = process.argv[2];

if (!arg) {
  interactiveMenu();
} else if (arg === 'all') {
  runAll();
} else {
  const num = parseInt(arg, 10);
  if (isNaN(num) || num < 1 || num > SCENARIOS.length) {
    console.error(`  Unknown scenario: "${arg}". Use 1-${SCENARIOS.length} or "all".\n`);
    process.exit(1);
  }
  const scenario     = SCENARIOS[num - 1];
  const isInteractive = process.argv.includes('--interactive');
  runScenario(scenario, { interactive: isInteractive });
}
