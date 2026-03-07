#!/usr/bin/env node
/**
 * plan-demo.js — 5-Phase Plan System demonstration
 *
 * Seeds the .agents/plan-state/discovery.json with pre-answered Discovery data
 * for a chosen scenario type, then launches the plan runner starting at
 * Phase 1 (SYNTHESIZE) — skipping the interactive Phase 0 Q&A entirely.
 *
 * This lets you see the AI planning process (Phases 1–4) without having to
 * manually answer all discovery questions.
 *
 * Usage:
 *   node scripts/plan-demo.js              # interactive menu
 *   node scripts/plan-demo.js 1            # seed & run scenario 1 directly
 *   node scripts/plan-demo.js 1 --dry-run  # copy seed only, don't run plan
 *
 * The 5 Plan Phases:
 *   Phase 0: DISCOVER    — BA ↔ User structured interview   (skipped by seed)
 *   Phase 1: SYNTHESIZE  — BA produces plan skeleton, user approves
 *   Phase 2: DECOMPOSE   — each agent expands their tasks (parallel)
 *   Phase 3: WIRE        — dependency graph + alignment gates resolved
 *   Phase 4: EXECUTE     — PlanOrchestrator runs wired plan via DagOrchestrator
 */

'use strict';

const { spawnSync } = require('child_process');
const readline      = require('readline');
const path          = require('path');
const fs            = require('fs');

const root    = path.resolve(__dirname, '..');
const cliJs   = path.join(root, 'packages', 'cli', 'dist', 'bin', 'ai-kit.js');
const seedDir = path.join(root, 'agents', 'demos', 'plan-seeds');

// Target path where the plan runner reads the discovery result
const planStateDir  = path.join(root, '.agents', 'plan-state');
const discoveryDest = path.join(planStateDir, 'discovery.json');

// ─── Seed registry ────────────────────────────────────────────────────────────

const SEEDS = [
  {
    id: '01',
    label: 'App Boilerplate',
    description: 'Greenfield full-stack app · Node API + React SPA · Docker + CI/CD',
    qualityGrade: 'enterprise',
    timelinePressure: 'medium',
    seedPath: path.join(seedDir, 'app-boilerplate', 'discovery.json'),
  },
  {
    id: '02',
    label: 'Enterprise Skeleton',
    description: 'Auth (SSO+RBAC) · multi-tenancy · 2 features: user-mgmt + notifications',
    qualityGrade: 'enterprise',
    timelinePressure: 'low',
    seedPath: path.join(seedDir, 'enterprise-skeleton', 'discovery.json'),
  },
  {
    id: '03',
    label: 'Website Build',
    description: 'Next.js marketing site · portfolio + blog · Lighthouse 100 target',
    qualityGrade: 'enterprise',
    timelinePressure: 'medium',
    seedPath: path.join(seedDir, 'website', 'discovery.json'),
  },
  {
    id: '04',
    label: 'Feature in Context',
    description: 'Recurring billing added to existing platform · Stripe integration',
    qualityGrade: 'enterprise',
    timelinePressure: 'high',
    seedPath: path.join(seedDir, 'feature-in-context', 'discovery.json'),
  },
  {
    id: '05',
    label: 'MVP Sprint',
    description: 'AI cover-letter assistant · 2-week solo dev · Supabase + OpenAI',
    qualityGrade: 'mvp',
    timelinePressure: 'high',
    seedPath: path.join(seedDir, 'mvp-sprint', 'discovery.json'),
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function printBanner() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║   AI Agencee  ·  5-Phase Plan Demo                        ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log('║   Seeds a discovery.json → starts plan at Phase 1 (SYNTHESIZE)║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log('  The 5 Phases:');
  console.log('    Phase 0: DISCOVER   — BA ↔ User Q&A   ← skipped by seed');
  console.log('    Phase 1: SYNTHESIZE — BA builds plan skeleton');
  console.log('    Phase 2: DECOMPOSE  — Agents expand tasks (parallel)');
  console.log('    Phase 3: WIRE       — Dependencies + alignment gates');
  console.log('    Phase 4: EXECUTE    — PlanOrchestrator runs DAGs\n');
}

function printMenu() {
  console.log('  Choose a scenario seed:\n');
  SEEDS.forEach((s, i) => {
    const num    = String(i + 1).padStart(2);
    const grade  = s.qualityGrade.padEnd(10);
    const pres   = s.timelinePressure.padEnd(6);
    console.log(`  ${num}. [${grade}|${pres}] ${s.label}`);
    console.log(`       ${s.description}\n`);
  });
  console.log('   0. Exit\n');
}

function seedDiscovery(seed) {
  if (!fs.existsSync(seed.seedPath)) {
    console.error(`\n  ✗ Seed file not found: ${seed.seedPath}\n`);
    process.exit(1);
  }

  // Ensure .agents/plan-state exists
  fs.mkdirSync(planStateDir, { recursive: true });

  // Back up any existing discovery.json
  if (fs.existsSync(discoveryDest)) {
    const backup = discoveryDest.replace('.json', `.backup-${Date.now()}.json`);
    fs.copyFileSync(discoveryDest, backup);
    console.log(`  ℹ  Backed up existing discovery.json → ${path.basename(backup)}`);
  }

  fs.copyFileSync(seed.seedPath, discoveryDest);
  console.log(`\n  ✓ Discovery seed installed: ${seed.label}`);
  console.log(`    ${discoveryDest}\n`);
}

function runPlan(seed, { dryRun = false, provider = 'mock' } = {}) {
  seedDiscovery(seed);

  if (dryRun) {
    console.log('  [dry-run] Seed installed. Would run:');
    console.log(`    node ${cliJs} plan --start-from synthesize --provider ${provider}\n`);
    return;
  }

  console.log('  Launching plan runner at Phase 1 (SYNTHESIZE)...\n');
  console.log(`  Provider : ${provider}`);
  console.log(`  Seed     : ${seed.label} (${seed.qualityGrade}, ${seed.timelinePressure} pressure)`);
  console.log(`  Project  : ${JSON.parse(fs.readFileSync(seed.seedPath, 'utf8')).projectName}\n`);

  const result = spawnSync(
    process.execPath,
    [cliJs, 'plan', '--start-from', 'synthesize', '--provider', provider, '--verbose'],
    { stdio: 'inherit', cwd: root },
  );

  if (result.status !== 0) {
    console.log(`\n  Plan exited with status ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

// ─── Interactive menu ─────────────────────────────────────────────────────────

function interactiveMenu({ dryRun, provider }) {
  printMenu();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('  Select seed [0-5]: ', answer => {
    rl.close();
    const choice = answer.trim();

    if (choice === '0' || choice === '') {
      console.log('\n  Bye!\n');
      return;
    }

    const idx = parseInt(choice, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= SEEDS.length) {
      console.error(`\n  Unknown choice: "${choice}". Run again and pick 1-5.\n`);
      process.exit(1);
    }

    runPlan(SEEDS[idx], { dryRun, provider });
  });
}

// ─── Entry point ──────────────────────────────────────────────────────────────

printBanner();

const args     = process.argv.slice(2).filter(a => !a.startsWith('--'));
const dryRun   = process.argv.includes('--dry-run');
const provider = process.argv.includes('--live') ? 'claude' : 'mock';
const numArg   = args[0];

if (!numArg) {
  interactiveMenu({ dryRun, provider });
} else {
  const num = parseInt(numArg, 10);
  if (isNaN(num) || num < 1 || num > SEEDS.length) {
    console.error(`  Unknown seed: "${numArg}". Use 1-${SEEDS.length}.\n`);
    process.exit(1);
  }
  runPlan(SEEDS[num - 1], { dryRun, provider });
}
