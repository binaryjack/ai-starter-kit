import * as fs from 'fs/promises';
import * as path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RunEntry {
  runId: string;
  dagName: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

interface RunManifest {
  runs: RunEntry[];
}

interface CostSummary {
  totalCostUSD: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byTaskType?: Record<string, { calls: number; costUSD: number }>;
}

// ─── Dashboard builder ────────────────────────────────────────────────────────

/**
 * Build a Markdown dashboard from on-disk run data.
 *
 * Reads:
 *   - `.agents/runs/manifest.json`  → run list + statuses
 *   - `.agents/runs/<id>/results/`  → cost-summary.json per run
 *
 * Safe to call from any process — no live event-bus dependency.
 */
export async function buildDashboard(projectRoot: string): Promise<string> {
  const lines: string[] = [];
  const now = new Date().toISOString();

  lines.push('# AI-Kit DAG Dashboard');
  lines.push(`> Snapshot at ${now}`);
  lines.push('');

  // ── Run manifest ──────────────────────────────────────────────────────────
  const manifestPath = path.join(projectRoot, '.agents', 'runs', 'manifest.json');
  let runs: RunEntry[] = [];

  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    const manifest: RunManifest = JSON.parse(raw);
    runs = manifest.runs ?? [];
  } catch {
    lines.push('> No run history found (`.agents/runs/manifest.json` missing).');
    lines.push('');
    lines.push('Run `pnpm demo` or execute a DAG to generate data.');
    return lines.join('\n');
  }

  const activeRuns   = runs.filter((r) => r.status === 'running');
  const recentRuns   = runs.filter((r) => r.status !== 'running').slice(-10).reverse();

  // ── Active runs ───────────────────────────────────────────────────────────
  lines.push(`## Active Runs (${activeRuns.length})`);
  if (activeRuns.length === 0) {
    lines.push('_No runs in progress._');
  } else {
    lines.push('| Run ID | DAG | Started |');
    lines.push('|--------|-----|---------|');
    for (const r of activeRuns) {
      const elapsed = Date.now() - new Date(r.startedAt).getTime();
      lines.push(`| \`${r.runId.slice(0, 8)}\` | ${r.dagName} | ${r.startedAt} (${formatMs(elapsed)} ago) |`);
    }
  }
  lines.push('');

  // ── Recent runs ───────────────────────────────────────────────────────────
  lines.push(`## Recent Runs (last ${recentRuns.length})`);
  if (recentRuns.length === 0) {
    lines.push('_No completed runs yet._');
  } else {
    lines.push('| Run ID | DAG | Status | Duration | Completed |');
    lines.push('|--------|-----|--------|----------|-----------|');
    for (const r of recentRuns) {
      const statusIcon = r.status === 'success' ? '✅' : r.status === 'partial' ? '⚠️' : '❌';
      const dur = r.durationMs != null ? formatMs(r.durationMs) : '—';
      lines.push(
        `| \`${r.runId.slice(0, 8)}\` | ${r.dagName} | ${statusIcon} ${r.status} | ${dur} | ${r.completedAt ?? '—'} |`,
      );
    }
  }
  lines.push('');

  // ── Cost aggregates ───────────────────────────────────────────────────────
  let totalCostUSD = 0;
  let totalCalls   = 0;
  const costByRun: Array<{ id: string; dagName: string; costUSD: number; calls: number }> = [];

  for (const r of recentRuns.slice(0, 5)) {
    try {
      const costFile = path.join(
        projectRoot, '.agents', 'runs', r.runId, 'results', 'cost-summary.json',
      );
      const raw: CostSummary = JSON.parse(await fs.readFile(costFile, 'utf-8'));
      const calls = Object.values(raw.byTaskType ?? {}).reduce((s, v) => s + v.calls, 0);
      totalCostUSD += raw.totalCostUSD;
      totalCalls   += calls;
      costByRun.push({ id: r.runId.slice(0, 8), dagName: r.dagName, costUSD: raw.totalCostUSD, calls });
    } catch {
      // No cost data for this run — skip
    }
  }

  lines.push('## Cost Summary (last 5 completed runs)');
  if (costByRun.length === 0) {
    lines.push('_No cost data available._');
  } else {
    lines.push(`**Total spend:** $${totalCostUSD.toFixed(4)} USD over ${totalCalls} LLM calls`);
    lines.push('');
    lines.push('| Run ID | DAG | Cost (USD) | Calls |');
    lines.push('|--------|-----|-----------|-------|');
    for (const c of costByRun) {
      lines.push(`| \`${c.id}\` | ${c.dagName} | $${c.costUSD.toFixed(4)} | ${c.calls} |`);
    }
  }
  lines.push('');

  // ── Statistics ────────────────────────────────────────────────────────────
  const successCount = runs.filter((r) => r.status === 'success').length;
  const failedCount  = runs.filter((r) => r.status === 'failed').length;
  const totalCount   = runs.length;
  const successRate  = totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) : '0';

  lines.push('## Statistics');
  lines.push(`- **Total runs:** ${totalCount}`);
  lines.push(`- **Successful:** ${successCount}`);
  lines.push(`- **Failed:** ${failedCount}`);
  lines.push(`- **Success rate:** ${successRate}%`);

  if (recentRuns.length > 0) {
    const avgDuration =
      recentRuns.filter((r) => r.durationMs != null).reduce((s, r) => s + (r.durationMs ?? 0), 0) /
      Math.max(recentRuns.filter((r) => r.durationMs != null).length, 1);
    lines.push(`- **Avg duration (last ${recentRuns.length}):** ${formatMs(avgDuration)}`);
  }
  lines.push('');

  lines.push('---');
  lines.push('_Read `audit://<runId>` resources for hash-chained audit trails._');

  return lines.join('\n');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}
