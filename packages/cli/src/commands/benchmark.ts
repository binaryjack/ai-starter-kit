/**
 * G-35: agent:benchmark CLI command
 *
 * Benchmarks registered LLM providers: latency, token throughput, cost per request.
 *
 * Usage:
 *   ai-kit agent:benchmark
 *   ai-kit agent:benchmark --providers anthropic,openai --suite code-review
 *   ai-kit agent:benchmark --runs 3 --output bench-report.json
 */

import type { TaskType } from '@ai-agencee/engine'
import { ModelRouterFactory } from '@ai-agencee/engine'
import * as path from 'path'

// ─── Built-in prompt suites ───────────────────────────────────────────────────

const SUITES: Record<string, Array<{ label: string; prompt: string; taskType: TaskType }>> = {
  'code-review': [
    {
      label: 'simple-fn',
      taskType: 'code-generation' as TaskType,
      prompt: 'Review this TypeScript function for bugs:\nfunction add(a,b){return a+b;}',
    },
    {
      label: 'async-fetch',
      taskType: 'security-review' as TaskType,
      prompt: 'Review this async function for security issues:\nasync function getData(url){const r=await fetch(url);return r.json();}',
    },
  ],
  minimal: [
    {
      label: 'hello',
      taskType: 'file-analysis' as TaskType,
      prompt: 'Reply with exactly the word "pong".',
    },
  ],
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface BenchmarkEntry {
  provider: string;
  model: string;
  suite: string;
  promptLabel: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  tokensPerSec: number;
  costUSD: number;
  success: boolean;
  error?: string;
}

export interface BenchmarkOptions {
  /** Comma-separated list of provider names to benchmark. Default: all registered */
  providers?: string;
  /** Suite name. Default: 'minimal' */
  suite?: string;
  /** Number of repetitions per prompt. Default: 1 */
  runs?: number;
  /** Path to model-router.json. Default: agents/model-router.json */
  routerFile?: string;
  /** Project root. Default: cwd */
  project?: string;
  /** Write JSON report to this file */
  output?: string;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runBenchmark(options: BenchmarkOptions = {}): Promise<void> {
  const projectRoot = options.project ? path.resolve(options.project) : process.cwd();
  const suiteName = options.suite ?? 'minimal';
  const runs = Math.max(1, options.runs ?? 1);
  const routerFile = options.routerFile ?? path.join(projectRoot, 'agents', 'model-router.json');

  const suite = SUITES[suiteName];
  if (!suite) {
    console.error(`Unknown suite "${suiteName}". Available: ${Object.keys(SUITES).join(', ')}`);
    process.exit(1);
  }

  console.log('\n⚡ ai-kit agent:benchmark');
  console.log('─'.repeat(60));
  console.log(`  Suite    : ${suiteName} (${suite.length} prompt(s) × ${runs} run(s))`);
  console.log(`  Router   : ${routerFile}`);
  console.log('');

  const router = await ModelRouterFactory.create({
    routerFilePath: routerFile,
    samplingCallback: undefined,
    agentsBaseDir: path.dirname(routerFile),
    log: (msg) => console.log(msg),
  });

  if (!router) {
    console.error('❌  Could not build model router. Check agents/model-router.json and API keys.');
    process.exit(1);
  }

  const filterProviders = options.providers
    ? new Set(options.providers.split(',').map((p) => p.trim()))
    : null;

  // Determine which providers to benchmark
  const providerNames = (filterProviders
    ? router.registeredProviders.filter((p) => filterProviders.has(p))
    : router.registeredProviders
  );

  if (providerNames.length === 0) {
    console.error('❌  No registered providers match the filter (check API keys).');
    process.exit(1);
  }

  console.log(`  Providers: ${providerNames.join(', ')}\n`);

  const results: BenchmarkEntry[] = [];

  for (const prompt of suite) {
    for (const providerName of providerNames) {
      for (let run = 0; run < runs; run++) {
        const entry: BenchmarkEntry = {
          provider: providerName,
          model: '',
          suite: suiteName,
          promptLabel: prompt.label,
          latencyMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          tokensPerSec: 0,
          costUSD: 0,
          success: false,
        };

        process.stdout.write(`  ${providerName.padEnd(12)} [${prompt.label}] run${run + 1}/${runs} … `);

        const start = Date.now();
        try {
          const resp = await router.route(
            prompt.taskType,
            { messages: [{ role: 'user', content: prompt.prompt }], maxTokens: 200, temperature: 0 },
            providerName
          );
          entry.latencyMs = Date.now() - start;
          entry.model = resp.model ?? '';
          entry.inputTokens = resp.usage?.inputTokens ?? 0;
          entry.outputTokens = resp.usage?.outputTokens ?? 0;
          entry.tokensPerSec =
            entry.latencyMs > 0 ? Math.round((entry.outputTokens / entry.latencyMs) * 1000) : 0;
          entry.costUSD = resp.estimatedCostUSD ?? 0;
          entry.success = true;
          console.log(`✅  ${entry.latencyMs}ms  ${entry.tokensPerSec}tok/s  $${entry.costUSD.toFixed(5)}`);
        } catch (err) {
          entry.latencyMs = Date.now() - start;
          entry.error = String(err);
          console.log(`❌  ${entry.error.slice(0, 60)}`);
        }

        results.push(entry);
      }
    }
  }

  // ── Summary table ───────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(80));
  console.log('  BENCHMARK SUMMARY');
  console.log('═'.repeat(80));
  console.log(
    '  Provider'.padEnd(14) +
      'Model'.padEnd(30) +
      'Latency(p50)'.padEnd(15) +
      'Tok/s'.padEnd(10) +
      'Cost/req'
  );
  console.log('─'.repeat(80));

  const groups = new Map<string, BenchmarkEntry[]>();
  for (const r of results) {
    const key = `${r.provider}::${r.model || r.provider}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  for (const [, entries] of groups) {
    const successes = entries.filter((e) => e.success);
    if (successes.length === 0) continue;

    const latencies = successes.map((e) => e.latencyMs).sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length / 2)] ?? 0;
    const avgTps = Math.round(successes.reduce((s, e) => s + e.tokensPerSec, 0) / successes.length);
    const avgCost = successes.reduce((s, e) => s + e.costUSD, 0) / successes.length;

    const first = successes[0]!;
    console.log(
      `  ${first.provider.padEnd(14)}${(first.model || '—').padEnd(30)}${(p50 + 'ms').padEnd(15)}${String(avgTps).padEnd(10)}$${avgCost.toFixed(5)}`
    );
  }

  console.log('');

  if (options.output) {
    const fs = await import('fs/promises');
    const outPath = path.resolve(options.output);
    await fs.writeFile(outPath, JSON.stringify({ suite: suiteName, results }, null, 2));
    console.log(`  📄 Report written to ${outPath}`);
  }
}
