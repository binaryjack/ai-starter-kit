/**
 * E13 — Run Advisor (auto-tune from run history)
 *
 * Analyses historical DAG run results stored in `.agents/runs/` and produces
 * actionable, structured recommendations to improve cost, reliability, and speed.
 *
 * Data sources:
 *   • `manifest.json`          — run-level metadata from RunRegistry
 *   • `results/dag-<runId>.json` — LaneResult / DagResult from DagResultBuilder
 *
 * Recommendation categories:
 *   HIGH_RETRY_RATE    — lane exceeds `maxAvgRetries` threshold (default 1.5)
 *   SLOW_LANE          — lane average duration exceeds `slowLaneMs` (default 30 000)
 *   FLAKY_LANE         — lane failure/escalation rate exceeds `maxFailureRate` (0.2)
 *   DOWNGRADE_MODEL    — lane passes reliably (0 retries, 100% success) →
 *                        may not need opus; test with sonnet
 *   BUDGET_SUGGESTION  — suggest a per-run budget cap from observed run durations
 *                        (only when no cap is currently set and ≥5 successful runs)
 *   DAG_UNSTABLE       — overall DAG success rate below `minSuccessRate` (0.8)
 *
 * Usage:
 *   const advisor = new RunAdvisor(projectRoot);
 *   const report  = await advisor.analyse({ lookback: 20 });
 *   console.log(advisor.formatReport(report));
 *
 * CLI integration:
 *   pnpm ai-kit advise       # print report for current project
 *   pnpm ai-kit advise --json # machine-readable JSON
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { DagResult } from './dag-types.js'
import type { RunEntry } from './run-registry.js'

// ─── Configuration ────────────────────────────────────────────────────────────

export interface RunAdvisorOptions {
  /**
   * Number of completed runs to include in the analysis (newest first).
   * @default 20
   */
  lookback?: number;
  /**
   * Average retry count above which a lane is flagged as HIGH_RETRY_RATE.
   * @default 1.5
   */
  maxAvgRetries?: number;
  /**
   * Average duration above which a lane is flagged as SLOW_LANE (ms).
   * @default 30_000
   */
  slowLaneMs?: number;
  /**
   * Failure + escalation rate (0-1) above which a lane is flagged as FLAKY_LANE.
   * @default 0.2
   */
  maxFailureRate?: number;
  /**
   * Overall DAG success rate (0-1) below which the whole DAG is flagged.
   * @default 0.8
   */
  minSuccessRate?: number;
  /**
   * Minimum number of successful runs required before DOWNGRADE_MODEL or
   * BUDGET_SUGGESTION recommendations are emitted (so they're based on real data).
   * @default 5
   */
  minRunsForOptimisation?: number;
}

// ─── Output types ─────────────────────────────────────────────────────────────

export type RecommendationKind =
  | 'HIGH_RETRY_RATE'
  | 'SLOW_LANE'
  | 'FLAKY_LANE'
  | 'DOWNGRADE_MODEL'
  | 'BUDGET_SUGGESTION'
  | 'DAG_UNSTABLE';

export interface Recommendation {
  kind:    RecommendationKind;
  laneId?: string;     // undefined for DAG-level recommendations
  message: string;
  /** Machine-readable details for tooling consumption */
  data:    Record<string, unknown>;
}

export interface LaneStats {
  laneId:         string;
  sampleCount:    number;
  avgRetries:     number;
  maxRetries:     number;
  avgDurationMs:  number;
  maxDurationMs:  number;
  successCount:   number;
  failureCount:   number;
  escalationCount: number;
  failureRate:    number;
}

export interface AdviceReport {
  generatedAt:     string;
  dagName:         string;
  runsAnalysed:    number;
  lookback:        number;
  dagSuccessRate:  number;
  perLane:         LaneStats[];
  recommendations: Recommendation[];
}

// ─── RunAdvisor ───────────────────────────────────────────────────────────────

export class RunAdvisor {
  private readonly manifestPath: string;
  private readonly runsDir:      string;

  constructor(private readonly projectRoot: string) {
    this.runsDir      = path.join(projectRoot, '.agents', 'runs');
    this.manifestPath = path.join(this.runsDir, 'manifest.json');
  }

  /**
   * Load the manifest and the last `lookback` completed runs, build per-lane
   * statistics, and return a structured advice report.
   */
  async analyse(options: RunAdvisorOptions = {}): Promise<AdviceReport> {
    const {
      lookback               = 20,
      maxAvgRetries          = 1.5,
      slowLaneMs             = 30_000,
      maxFailureRate         = 0.2,
      minSuccessRate         = 0.8,
      minRunsForOptimisation = 5,
    } = options;

    // ─ Load manifest ──────────────────────────────────────────────────────────
    const manifest = await this._readManifest();
    const completed = manifest
      .filter((e) => e.status !== 'running')
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, lookback);

    // ─ Detect dag name (use the most common one in the window) ────────────────
    const nameFreq = new Map<string, number>();
    for (const e of completed) nameFreq.set(e.dagName, (nameFreq.get(e.dagName) ?? 0) + 1);
    const dagName = [...nameFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '(unknown)';

    // ─ Load result files ──────────────────────────────────────────────────────
    const dagResults = await this._loadResults(completed);

    // ─ DAG-level success rate ─────────────────────────────────────────────────
    const successCount = completed.filter((e) => e.status === 'success').length;
    const dagSuccessRate = completed.length > 0 ? successCount / completed.length : 1;

    // ─ Per-lane aggregation ───────────────────────────────────────────────────
    const laneMap = new Map<string, {
      retries:     number[];
      durations:   number[];
      successes:   number;
      failures:    number;
      escalations: number;
    }>();

    for (const dagResult of dagResults) {
      for (const lane of dagResult.lanes) {
        if (!laneMap.has(lane.laneId)) {
          laneMap.set(lane.laneId, { retries: [], durations: [], successes: 0, failures: 0, escalations: 0 });
        }
        const agg = laneMap.get(lane.laneId)!;
        agg.retries.push(lane.totalRetries);
        agg.durations.push(lane.durationMs);
        if (lane.status === 'success')   agg.successes++;
        if (lane.status === 'failed')    agg.failures++;
        if (lane.status === 'escalated') agg.escalations++;
      }
    }

    const perLane: LaneStats[] = [];
    for (const [laneId, agg] of laneMap) {
      const sampleCount = agg.retries.length;
      const avgRetries  = avg(agg.retries);
      const avgDuration = avg(agg.durations);
      const failureRate = sampleCount > 0
        ? (agg.failures + agg.escalations) / sampleCount
        : 0;

      perLane.push({
        laneId,
        sampleCount,
        avgRetries,
        maxRetries:      Math.max(...agg.retries, 0),
        avgDurationMs:   avgDuration,
        maxDurationMs:   Math.max(...agg.durations, 0),
        successCount:    agg.successes,
        failureCount:    agg.failures,
        escalationCount: agg.escalations,
        failureRate,
      });
    }

    // ─ Build recommendations ──────────────────────────────────────────────────
    const recs: Recommendation[] = [];

    // DAG-level instability
    if (completed.length >= 3 && dagSuccessRate < minSuccessRate) {
      recs.push({
        kind: 'DAG_UNSTABLE',
        message:
          `DAG "${dagName}" succeeded only ${pct(dagSuccessRate)} of runs ` +
          `(${successCount}/${completed.length} in the last ${lookback}-run window). ` +
          `Review failing results and escalation logs.`,
        data: { dagSuccessRate, successCount, totalRuns: completed.length },
      });
    }

    for (const lane of perLane) {
      // High retry rate
      if (lane.sampleCount >= 2 && lane.avgRetries > maxAvgRetries) {
        recs.push({
          kind:   'HIGH_RETRY_RATE',
          laneId: lane.laneId,
          message:
            `Lane "${lane.laneId}" averages ${lane.avgRetries.toFixed(1)} retries per run ` +
            `(threshold ${maxAvgRetries}). Check: prompt clarity, maxTokens limit, supervisor strictness.`,
          data: { avgRetries: lane.avgRetries, maxRetries: lane.maxRetries, sampleCount: lane.sampleCount },
        });
      }

      // Slow lane
      if (lane.sampleCount >= 2 && lane.avgDurationMs > slowLaneMs) {
        recs.push({
          kind:   'SLOW_LANE',
          laneId: lane.laneId,
          message:
            `Lane "${lane.laneId}" averages ${ms(lane.avgDurationMs)} per run ` +
            `(threshold ${ms(slowLaneMs)}). Consider: parallelisation with other lanes, ` +
            `model tier reduction (opus→sonnet for simpler tasks), or prompt scope reduction.`,
          data: { avgDurationMs: lane.avgDurationMs, maxDurationMs: lane.maxDurationMs, thresholdMs: slowLaneMs },
        });
      }

      // Flaky lane
      if (lane.sampleCount >= 3 && lane.failureRate > maxFailureRate) {
        recs.push({
          kind:   'FLAKY_LANE',
          laneId: lane.laneId,
          message:
            `Lane "${lane.laneId}" has a ${pct(lane.failureRate)} failure/escalation rate ` +
            `(${lane.failureCount + lane.escalationCount} of ${lane.sampleCount} runs). ` +
            `Review audit logs and supervisor verdict patterns for this lane.`,
          data: {
            failureRate:    lane.failureRate,
            failureCount:   lane.failureCount,
            escalationCount: lane.escalationCount,
            sampleCount:    lane.sampleCount,
          },
        });
      }

      // Downgrade model suggestion — only when reliably passing
      if (
        lane.sampleCount >= minRunsForOptimisation &&
        lane.avgRetries === 0 &&
        lane.failureRate === 0
      ) {
        recs.push({
          kind:   'DOWNGRADE_MODEL',
          laneId: lane.laneId,
          message:
            `Lane "${lane.laneId}" completed all ${lane.sampleCount} sampled runs with ` +
            `0 retries and 0 failures. Consider testing with a less expensive model tier ` +
            `(e.g. sonnet instead of opus) in model-router.json to reduce cost.`,
          data: { sampleCount: lane.sampleCount, avgRetries: 0, failureRate: 0 },
        });
      }
    }

    // Budget suggestion — based on average run duration (proxy for cost)
    const successfulRuns = completed.filter((e) => e.status === 'success' && e.durationMs !== undefined);
    if (successfulRuns.length >= minRunsForOptimisation) {
      const avgDuration = avg(successfulRuns.map((e) => e.durationMs ?? 0));
      recs.push({
        kind: 'BUDGET_SUGGESTION',
        message:
          `Based on ${successfulRuns.length} successful runs, average total duration is ` +
          `${ms(avgDuration)}. If you don't have a budget cap set in model-router.json, ` +
          `consider adding one to prevent runaway costs during unexpected prompt loops.`,
        data: { avgDurationMs: avgDuration, sampleCount: successfulRuns.length },
      });
    }

    return {
      generatedAt:     new Date().toISOString(),
      dagName,
      runsAnalysed:    completed.length,
      lookback,
      dagSuccessRate,
      perLane,
      recommendations: recs,
    };
  }

  /**
   * Format an advice report as a human-readable string for CLI output.
   */
  formatReport(report: AdviceReport): string {
    const lines: string[] = [];
    lines.push(`\n📊  Run Advisor Report — ${report.dagName}`);
    lines.push(`    Generated: ${report.generatedAt}`);
    lines.push(`    Runs analysed: ${report.runsAnalysed} (lookback window: ${report.lookback})`);
    lines.push(`    DAG success rate: ${pct(report.dagSuccessRate)}`);
    lines.push('');

    if (report.perLane.length > 0) {
      lines.push('  Per-lane summary:');
      for (const lane of report.perLane) {
        lines.push(
          `    ${lane.laneId.padEnd(28)} ` +
          `runs=${lane.sampleCount}  ` +
          `avg_retries=${lane.avgRetries.toFixed(1)}  ` +
          `avg_duration=${ms(lane.avgDurationMs)}  ` +
          `failure_rate=${pct(lane.failureRate)}`,
        );
      }
      lines.push('');
    }

    if (report.recommendations.length === 0) {
      lines.push('  ✅  No issues found — system is performing well within all thresholds.');
    } else {
      lines.push(`  💡  ${report.recommendations.length} recommendation(s):`);
      for (const rec of report.recommendations) {
        const icon = {
          HIGH_RETRY_RATE:   '🔁',
          SLOW_LANE:         '🐢',
          FLAKY_LANE:        '🎲',
          DOWNGRADE_MODEL:   '💰',
          BUDGET_SUGGESTION: '💸',
          DAG_UNSTABLE:      '🚨',
        }[rec.kind];
        const prefix = rec.laneId ? `[${rec.laneId}] ` : '';
        lines.push(`\n  ${icon}  ${rec.kind} ${prefix}`);
        lines.push(`     ${rec.message}`);
      }
    }
    lines.push('');
    return lines.join('\n');
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async _readManifest(): Promise<RunEntry[]> {
    const raw = await fs.readFile(this.manifestPath, 'utf-8').catch(() => '[]');
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as RunEntry[];
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as Record<string, unknown>).runs)
      ) {
        return (parsed as { runs: RunEntry[] }).runs;
      }
      return [];
    } catch {
      return [];
    }
  }

  private async _loadResults(entries: RunEntry[]): Promise<DagResult[]> {
    const results: DagResult[] = [];
    for (const entry of entries) {
      const resultsDir = path.join(this.runsDir, entry.runId, 'results');
      const resultFile = path.join(resultsDir, `dag-${entry.runId}.json`);
      try {
        const raw  = await fs.readFile(resultFile, 'utf-8');
        const data = JSON.parse(raw) as DagResult;
        results.push(data);
      } catch {
        // Result file not saved or unreadable — skip this run gracefully
      }
    }
    return results;
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function ms(milliseconds: number): string {
  if (milliseconds >= 60_000) return `${(milliseconds / 60_000).toFixed(1)}m`;
  if (milliseconds >= 1_000)  return `${(milliseconds / 1_000).toFixed(1)}s`;
  return `${Math.round(milliseconds)}ms`;
}
