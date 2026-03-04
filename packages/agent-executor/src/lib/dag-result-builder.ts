/**
 * DagResultBuilder — assembles and persists a DagResult.
 *
 * Extracted from DagOrchestrator to keep result construction logic isolated
 * and independently testable.
 */

import * as fs    from 'fs/promises';
import * as path  from 'path';
import type { DagResult, LaneResult } from './dag-types.js';

export class DagResultBuilder {
  // ─── Build ────────────────────────────────────────────────────────────────

  /**
   * Aggregate lane results into a single DagResult.
   * Rolls up findings and recommendations from successful lanes.
   */
  static build(params: {
    dagName: string;
    runId: string;
    laneResults: LaneResult[];
    startedAt: string;
    completedAt: string;
    totalDurationMs: number;
  }): DagResult {
    const { dagName, runId, laneResults, startedAt, completedAt, totalDurationMs } = params;

    const successCount = laneResults.filter((r) => r.status === 'success').length;
    const failCount    = laneResults.filter(
      (r) => r.status === 'failed' || r.status === 'escalated',
    ).length;

    const status: DagResult['status'] =
      failCount === 0
        ? 'success'
        : successCount > 0
          ? 'partial'
          : 'failed';

    // Roll up findings and recommendations from all lanes that produced results
    const findings:        string[] = [];
    const recommendations: string[] = [];

    for (const lane of laneResults) {
      if (lane.agentResult) {
        findings.push(       ...lane.agentResult.findings.map((f) => `[${lane.laneId}] ${f}`));
        recommendations.push(...lane.agentResult.recommendations.map((r) => `[${lane.laneId}] ${r}`));
      }
    }

    return {
      dagName,
      runId,
      status,
      lanes: laneResults,
      totalDurationMs,
      startedAt,
      completedAt,
      findings,
      recommendations,
    };
  }

  // ─── Persist ──────────────────────────────────────────────────────────────

  /**
   * Write the DagResult to `<resultsDir>/dag-<runId>.json`.
   * Maps are converted to plain objects before serialisation.
   * Errors are silently swallowed — persistence failure must not abort a run.
   */
  static async save(
    result: DagResult,
    resultsDir: string,
    projectRoot: string,
    log: (msg: string) => void,
  ): Promise<void> {
    try {
      await fs.mkdir(resultsDir, { recursive: true });
      const filePath = path.join(resultsDir, `dag-${result.runId}.json`);

      // Make Maps JSON-serialisable
      const serializable = JSON.parse(
        JSON.stringify(result, (_key, value) =>
          value instanceof Map ? Object.fromEntries(value) : value,
        ),
      );

      await fs.writeFile(filePath, JSON.stringify(serializable, null, 2), 'utf-8');
      log(`💾  Result saved → ${path.relative(projectRoot, filePath)}`);
    } catch {
      // Best-effort — don't fail the run because of persistence issues
    }
  }
}
