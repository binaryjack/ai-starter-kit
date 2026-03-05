#!/usr/bin/env node
/**
 * demo.js — Zero-API-key demo of the ai-starter-kit DAG engine
 *
 * Runs the 3-lane demo DAG (code-review + security-scan → summary) using the
 * built-in MockProvider so no API keys are required.
 *
 * Usage:
 *   node scripts/demo.js                   # default: agents/demo.dag.json
 *   node scripts/demo.js path/to/my.dag.json
 *
 * After a full build (pnpm build) you can also run:
 *   pnpm demo
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const root  = path.resolve(__dirname, '..');
const cliJs = path.join(root, 'packages', 'cli', 'dist', 'bin', 'ai-kit.js');
const dagFile  = process.argv[2] ?? path.join(root, 'agents', 'demo.dag.json');

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║          ai-starter-kit  ·  Demo Run (mock provider)    ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');
console.log(`  DAG file : ${dagFile}`);
console.log(`  Provider : mock (no API key required)`);
console.log(`  CLI      : ${cliJs}\n`);

const result = spawnSync(
  process.execPath,
  [cliJs, 'agent:dag', dagFile, '--provider', 'mock', '--verbose'],
  { stdio: 'inherit', cwd: root },
);

if (result.status !== 0) {
  console.error(`\nDemo exited with status ${result.status}`);
  process.exit(result.status ?? 1);
}
