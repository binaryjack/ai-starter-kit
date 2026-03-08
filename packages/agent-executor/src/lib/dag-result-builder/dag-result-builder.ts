import * as fs from 'fs/promises';
import * as path from 'path';
import type { DagResult, LaneResult } from '../dag-types.js';

export interface IDagResultBuilder {
  new(): IDagResultBuilder;
}

export const DagResultBuilder = function(this: IDagResultBuilder) {} as unknown as IDagResultBuilder;

(DagResultBuilder as unknown as Record<string, unknown>).build = function(params: {
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
    failCount === 0 ? 'success' : successCount > 0 ? 'partial' : 'failed';

  const findings:        string[] = [];
  const recommendations: string[] = [];

  for (const lane of laneResults) {
    if (lane.agentResult) {
      findings.push(       ...lane.agentResult.findings.map((f) => `[${lane.laneId}] ${f}`));
      recommendations.push(...lane.agentResult.recommendations.map((r) => `[${lane.laneId}] ${r}`));
    }
  }

  return { dagName, runId, status, lanes: laneResults, totalDurationMs, startedAt, completedAt, findings, recommendations };
};

(DagResultBuilder as unknown as Record<string, unknown>).save = async function(
  result: DagResult,
  resultsDir: string,
  projectRoot: string,
  log: (msg: string) => void,
): Promise<void> {
  try {
    await fs.mkdir(resultsDir, { recursive: true });
    const filePath = path.join(resultsDir, `dag-${result.runId}.json`);
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
};
