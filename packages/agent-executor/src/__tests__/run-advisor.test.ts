/**
 * Unit tests for RunAdvisor (E13)
 *
 * fs/promises is mocked to avoid real disk I/O.
 */
import * as path from 'path'

// ─── Mock fs/promises ─────────────────────────────────────────────────────────

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

import * as fsMod from 'fs/promises'
const mockReadFile = fsMod.readFile as jest.Mock;

import type { DagResult } from '../lib/dag-types.js'
import type { AdviceReport, Recommendation } from '../lib/run-advisor.js'
import { RunAdvisor } from '../lib/run-advisor.js'

const PROJECT_ROOT = '/fake/project';
const RUNS_DIR     = path.join(PROJECT_ROOT, '.agents', 'runs');

// ─── helpers ──────────────────────────────────────────────────────────────────

function manifestPath() {
  return path.join(RUNS_DIR, 'manifest.json');
}

function resultPath(runId: string) {
  return path.join(RUNS_DIR, runId, 'results', `dag-${runId}.json`);
}

function makeEntry(runId: string, status: 'success' | 'failed' | 'running' = 'success', durationMs?: number) {
  return {
    runId,
    dagName: 'test-dag',
    status,
    startedAt: new Date().toISOString(),
    durationMs,
  };
}

function makeDagResult(runId: string, lanes: Partial<{
  laneId:       string;
  status:       'success' | 'failed' | 'escalated';
  totalRetries: number;
  durationMs:   number;
}>[]): DagResult {
  return {
    dagName:         'test-dag',
    runId,
    status:          'success',
    lanes:           lanes.map((l) => ({
      laneId:           l.laneId ?? 'lane-1',
      status:           l.status ?? 'success',
      totalRetries:     l.totalRetries ?? 0,
      durationMs:       l.durationMs ?? 1000,
      startedAt:        new Date().toISOString(),
      completedAt:      new Date().toISOString(),
      checkpoints:      [],
      handoffsReceived: 0,
    })),
    totalDurationMs:  5000,
    startedAt:        new Date().toISOString(),
    completedAt:      new Date().toISOString(),
    findings:         [],
    recommendations:  [],
  };
}

/**
 * Configure mockReadFile to return fixture data for manifest + result files.
 * Anything not in the map throws (simulates missing file).
 */
function setupMocks(manifest: unknown, results: Record<string, DagResult>) {
  mockReadFile.mockImplementation((filePath: string, _enc: string) => {
    if (filePath === manifestPath()) {
      return Promise.resolve(JSON.stringify(manifest));
    }
    for (const [runId, data] of Object.entries(results)) {
      if (filePath === resultPath(runId)) {
        return Promise.resolve(JSON.stringify(data));
      }
    }
    return Promise.reject(new Error(`ENOENT: ${filePath}`));
  });
}

// ─── Basic ────────────────────────────────────────────────────────────────────

describe('RunAdvisor — basic', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns empty report when manifest is empty', async () => {
    setupMocks([], {});
    const advisor = new RunAdvisor(PROJECT_ROOT);
    const report  = await advisor.analyse();

    expect(report.runsAnalysed).toBe(0);
    expect(report.recommendations).toHaveLength(0);
    expect(report.perLane).toHaveLength(0);
  });

  it('returns empty report when manifest file is missing (catch returns [])', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const advisor = new RunAdvisor(PROJECT_ROOT);
    const report  = await advisor.analyse();

    expect(report.runsAnalysed).toBe(0);
    expect(report.recommendations).toHaveLength(0);
  });

  it('supports {runs:[]} manifest format', async () => {
    const entries = [makeEntry('run-1', 'success', 2000)];
    setupMocks({ runs: entries }, {
      'run-1': makeDagResult('run-1', [{ laneId: 'frontend' }]),
    });

    const advisor = new RunAdvisor(PROJECT_ROOT);
    const report  = await advisor.analyse();

    expect(report.runsAnalysed).toBe(1);
    expect(report.perLane[0]?.laneId).toBe('frontend');
  });

  it('excludes running entries from analysis', async () => {
    setupMocks([makeEntry('run-1', 'running'), makeEntry('run-2', 'success')], {
      'run-2': makeDagResult('run-2', [{ laneId: 'lane-a' }]),
    });

    const advisor = new RunAdvisor(PROJECT_ROOT);
    const report  = await advisor.analyse();

    expect(report.runsAnalysed).toBe(1);
  });

  it('limits to lookback window (newest first)', async () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      ...makeEntry(`run-${i}`, 'success'),
      startedAt: new Date(1_700_000_000_000 + i * 1000).toISOString(),
    }));
    const results: Record<string, DagResult> = {};
    for (const e of entries) {
      results[e.runId] = makeDagResult(e.runId, [{ laneId: 'lane-x' }]);
    }

    setupMocks(entries, results);
    const advisor = new RunAdvisor(PROJECT_ROOT);
    const report  = await advisor.analyse({ lookback: 3 });

    expect(report.runsAnalysed).toBe(3);
    expect(report.lookback).toBe(3);
  });

  it('handles missing result files gracefully', async () => {
    setupMocks([makeEntry('run-1', 'success')], {});   // no result file
    const advisor = new RunAdvisor(PROJECT_ROOT);
    const report  = await advisor.analyse();

    expect(report.runsAnalysed).toBe(1);
    expect(report.perLane).toHaveLength(0);
    expect(report.recommendations).toHaveLength(0);
  });
});

// ─── HIGH_RETRY_RATE ──────────────────────────────────────────────────────────

describe('RunAdvisor — HIGH_RETRY_RATE', () => {
  beforeEach(() => jest.resetAllMocks());

  it('fires when avg retries > 1.5 (default threshold)', async () => {
    const entries = [makeEntry('r1', 'success'), makeEntry('r2', 'success'), makeEntry('r3', 'success')];
    setupMocks(entries, {
      r1: makeDagResult('r1', [{ laneId: 'lane-a', totalRetries: 3 }]),
      r2: makeDagResult('r2', [{ laneId: 'lane-a', totalRetries: 2 }]),
      r3: makeDagResult('r3', [{ laneId: 'lane-a', totalRetries: 2 }]),
    });

    const advisor = new RunAdvisor(PROJECT_ROOT);
    const report  = await advisor.analyse();

    const rec = report.recommendations.find((r) => r.kind === 'HIGH_RETRY_RATE');
    expect(rec).toBeDefined();
    expect(rec!.laneId).toBe('lane-a');
  });

  it('does not fire when avg retries <= threshold', async () => {
    const entries = [makeEntry('r1', 'success'), makeEntry('r2', 'success')];
    setupMocks(entries, {
      r1: makeDagResult('r1', [{ laneId: 'lane-a', totalRetries: 1 }]),
      r2: makeDagResult('r2', [{ laneId: 'lane-a', totalRetries: 1 }]),
    });

    const advisor = new RunAdvisor(PROJECT_ROOT);
    const report  = await advisor.analyse();

    expect(report.recommendations.find((r) => r.kind === 'HIGH_RETRY_RATE')).toBeUndefined();
  });

  it('respects custom maxAvgRetries threshold', async () => {
    const entries = [makeEntry('r1', 'success'), makeEntry('r2', 'success')];
    setupMocks(entries, {
      r1: makeDagResult('r1', [{ laneId: 'lane-a', totalRetries: 1 }]),
      r2: makeDagResult('r2', [{ laneId: 'lane-a', totalRetries: 1 }]),
    });

    const advisor = new RunAdvisor(PROJECT_ROOT);
    // Lower threshold to 0.5 — avgRetries=1 > 0.5
    const report  = await advisor.analyse({ maxAvgRetries: 0.5 });

    expect(report.recommendations.find((r) => r.kind === 'HIGH_RETRY_RATE')).toBeDefined();
  });
});

// ─── SLOW_LANE ────────────────────────────────────────────────────────────────

describe('RunAdvisor — SLOW_LANE', () => {
  beforeEach(() => jest.resetAllMocks());

  it('fires when avg duration > 30s (default)', async () => {
    const entries = [makeEntry('r1', 'success'), makeEntry('r2', 'success')];
    setupMocks(entries, {
      r1: makeDagResult('r1', [{ laneId: 'lane-b', durationMs: 45_000 }]),
      r2: makeDagResult('r2', [{ laneId: 'lane-b', durationMs: 50_000 }]),
    });

    const advisor = new RunAdvisor(PROJECT_ROOT);
    const report  = await advisor.analyse();

    const rec = report.recommendations.find((r) => r.kind === 'SLOW_LANE');
    expect(rec).toBeDefined();
    expect(rec!.laneId).toBe('lane-b');
  });

  it('does not fire when avg duration <= threshold', async () => {
    const entries = [makeEntry('r1', 'success'), makeEntry('r2', 'success')];
    setupMocks(entries, {
      r1: makeDagResult('r1', [{ laneId: 'lane-b', durationMs: 10_000 }]),
      r2: makeDagResult('r2', [{ laneId: 'lane-b', durationMs: 12_000 }]),
    });

    const advisor = new RunAdvisor(PROJECT_ROOT);
    const report  = await advisor.analyse();

    expect(report.recommendations.find((r) => r.kind === 'SLOW_LANE')).toBeUndefined();
  });
});

// ─── FLAKY_LANE ───────────────────────────────────────────────────────────────

describe('RunAdvisor — FLAKY_LANE', () => {
  beforeEach(() => jest.resetAllMocks());

  it('fires when failure rate > 0.2 with ≥3 samples', async () => {
    const entries = [makeEntry('r1'), makeEntry('r2'), makeEntry('r3'), makeEntry('r4'), makeEntry('r5')];
    setupMocks(entries, {
      r1: makeDagResult('r1', [{ laneId: 'lane-c', status: 'failed'  }]),
      r2: makeDagResult('r2', [{ laneId: 'lane-c', status: 'failed'  }]),
      r3: makeDagResult('r3', [{ laneId: 'lane-c', status: 'success' }]),
      r4: makeDagResult('r4', [{ laneId: 'lane-c', status: 'success' }]),
      r5: makeDagResult('r5', [{ laneId: 'lane-c', status: 'success' }]),
    });

    const advisor = new RunAdvisor(PROJECT_ROOT);
    const report  = await advisor.analyse();

    const rec = report.recommendations.find((r) => r.kind === 'FLAKY_LANE');
    expect(rec).toBeDefined();
    expect(rec!.laneId).toBe('lane-c');
    expect((rec!.data['failureRate'] as number)).toBeCloseTo(0.4, 2);
  });

  it('counts escalated as failures for the rate', async () => {
    const entries = [makeEntry('r1'), makeEntry('r2'), makeEntry('r3')];
    setupMocks(entries, {
      r1: makeDagResult('r1', [{ laneId: 'lane-d', status: 'escalated' }]),
      r2: makeDagResult('r2', [{ laneId: 'lane-d', status: 'success'   }]),
      r3: makeDagResult('r3', [{ laneId: 'lane-d', status: 'success'   }]),
    });

    const advisor = new RunAdvisor(PROJECT_ROOT);
    // Escalation rate = 1/3 ≈ 0.33 > 0.2
    const report  = await advisor.analyse();

    expect(report.recommendations.find((r) => r.kind === 'FLAKY_LANE')).toBeDefined();
  });

  it('requires ≥3 samples (fewer samples = no recommendation)', async () => {
    const entries = [makeEntry('r1'), makeEntry('r2')];
    setupMocks(entries, {
      r1: makeDagResult('r1', [{ laneId: 'lane-e', status: 'failed'  }]),
      r2: makeDagResult('r2', [{ laneId: 'lane-e', status: 'success' }]),
    });

    const advisor = new RunAdvisor(PROJECT_ROOT);
    const report  = await advisor.analyse();

    expect(report.recommendations.find((r) => r.kind === 'FLAKY_LANE')).toBeUndefined();
  });
});

// ─── DOWNGRADE_MODEL ──────────────────────────────────────────────────────────

describe('RunAdvisor — DOWNGRADE_MODEL', () => {
  beforeEach(() => jest.resetAllMocks());

  it('fires when lane passes perfectly across ≥5 runs', async () => {
    const entries = Array.from({ length: 5 }, (_, i) => makeEntry(`r${i}`, 'success'));
    const results: Record<string, DagResult> = {};
    entries.forEach((e) => {
      results[e.runId] = makeDagResult(e.runId, [{ laneId: 'easy-lane', totalRetries: 0, status: 'success' }]);
    });

    setupMocks(entries, results);
    const advisor = new RunAdvisor(PROJECT_ROOT);
    const report  = await advisor.analyse({ minRunsForOptimisation: 5 });

    const rec = report.recommendations.find((r) => r.kind === 'DOWNGRADE_MODEL');
    expect(rec).toBeDefined();
    expect(rec!.laneId).toBe('easy-lane');
  });

  it('does not fire with fewer than minRunsForOptimisation samples', async () => {
    const entries = Array.from({ length: 4 }, (_, i) => makeEntry(`r${i}`, 'success'));
    const results: Record<string, DagResult> = {};
    entries.forEach((e) => {
      results[e.runId] = makeDagResult(e.runId, [{ laneId: 'easy-lane', totalRetries: 0, status: 'success' }]);
    });

    setupMocks(entries, results);
    const advisor = new RunAdvisor(PROJECT_ROOT);
    const report  = await advisor.analyse({ minRunsForOptimisation: 5 });

    expect(report.recommendations.find((r) => r.kind === 'DOWNGRADE_MODEL')).toBeUndefined();
  });

  it('does not fire when lane has retries even if no failures', async () => {
    const entries = Array.from({ length: 5 }, (_, i) => makeEntry(`r${i}`, 'success'));
    const results: Record<string, DagResult> = {};
    entries.forEach((e) => {
      results[e.runId] = makeDagResult(e.runId, [{ laneId: 'retry-lane', totalRetries: 1, status: 'success' }]);
    });

    setupMocks(entries, results);
    const advisor = new RunAdvisor(PROJECT_ROOT);
    const report  = await advisor.analyse({ minRunsForOptimisation: 5 });

    expect(report.recommendations.find((r) => r.kind === 'DOWNGRADE_MODEL')).toBeUndefined();
  });
});

// ─── BUDGET_SUGGESTION ────────────────────────────────────────────────────────

describe('RunAdvisor — BUDGET_SUGGESTION', () => {
  beforeEach(() => jest.resetAllMocks());

  it('fires when ≥5 successful runs with durationMs', async () => {
    const entries = Array.from({ length: 6 }, (_, i) =>
      makeEntry(`r${i}`, 'success', 10_000 + i * 1000),
    );
    setupMocks(entries, {});   // no result files needed for this recommendation

    const advisor = new RunAdvisor(PROJECT_ROOT);
    const report  = await advisor.analyse({ minRunsForOptimisation: 5 });

    const rec = report.recommendations.find((r) => r.kind === 'BUDGET_SUGGESTION');
    expect(rec).toBeDefined();
    expect(rec!.data['sampleCount']).toBe(6);
  });

  it('does not fire with fewer than minRunsForOptimisation successful runs', async () => {
    const entries = Array.from({ length: 3 }, (_, i) => makeEntry(`r${i}`, 'success', 10_000));
    setupMocks(entries, {});

    const advisor = new RunAdvisor(PROJECT_ROOT);
    const report  = await advisor.analyse({ minRunsForOptimisation: 5 });

    expect(report.recommendations.find((r) => r.kind === 'BUDGET_SUGGESTION')).toBeUndefined();
  });
});

// ─── DAG_UNSTABLE ─────────────────────────────────────────────────────────────

describe('RunAdvisor — DAG_UNSTABLE', () => {
  beforeEach(() => jest.resetAllMocks());

  it('fires when success rate < 0.8 with ≥3 runs', async () => {
    const entries = [
      makeEntry('r1', 'failed'),
      makeEntry('r2', 'failed'),
      makeEntry('r3', 'success'),
    ];
    setupMocks(entries, {});

    const advisor = new RunAdvisor(PROJECT_ROOT);
    const report  = await advisor.analyse();

    const rec = report.recommendations.find((r) => r.kind === 'DAG_UNSTABLE');
    expect(rec).toBeDefined();
    expect(report.dagSuccessRate).toBeCloseTo(1 / 3, 3);
  });

  it('does not fire when fewer than 3 runs', async () => {
    const entries = [makeEntry('r1', 'failed'), makeEntry('r2', 'failed')];
    setupMocks(entries, {});

    const advisor = new RunAdvisor(PROJECT_ROOT);
    const report  = await advisor.analyse();

    expect(report.recommendations.find((r) => r.kind === 'DAG_UNSTABLE')).toBeUndefined();
  });

  it('respects custom minSuccessRate', async () => {
    const entries = [makeEntry('r1', 'success'), makeEntry('r2', 'failed'), makeEntry('r3', 'success'), makeEntry('r4', 'success')];
    setupMocks(entries, {});

    const advisor = new RunAdvisor(PROJECT_ROOT);
    // 75% success rate; default threshold is 80%, so should fire
    const report  = await advisor.analyse({ minSuccessRate: 0.8 });

    expect(report.recommendations.find((r) => r.kind === 'DAG_UNSTABLE')).toBeDefined();
  });
});

// ─── formatReport() ───────────────────────────────────────────────────────────

describe('RunAdvisor — formatReport()', () => {
  it('includes dag name and recommendation kinds in output', () => {
    const report: AdviceReport = {
      generatedAt:    '2024-01-01T00:00:00.000Z',
      dagName:        'my-dag',
      runsAnalysed:   5,
      lookback:       20,
      dagSuccessRate: 0.6,
      perLane:        [],
      recommendations: [
        {
          kind:    'DAG_UNSTABLE',
          message: 'DAG "my-dag" is unstable',
          data:    {},
        } as Recommendation,
        {
          kind:    'HIGH_RETRY_RATE',
          laneId:  'backend',
          message: 'Too many retries',
          data:    {},
        } as Recommendation,
      ],
    };

    const advisor = new RunAdvisor(PROJECT_ROOT);
    const output  = advisor.formatReport(report);

    expect(output).toContain('my-dag');
    expect(output).toContain('DAG_UNSTABLE');
    expect(output).toContain('HIGH_RETRY_RATE');
    expect(output).toContain('backend');
  });

  it('shows "No issues found" when no recommendations', () => {
    const report: AdviceReport = {
      generatedAt:     new Date().toISOString(),
      dagName:         'quiet-dag',
      runsAnalysed:    3,
      lookback:        20,
      dagSuccessRate:  1,
      perLane:         [],
      recommendations: [],
    };

    const advisor = new RunAdvisor(PROJECT_ROOT);
    const output  = advisor.formatReport(report);

    expect(output).toContain('No issues found');
  });

  it('includes per-lane stats when present', () => {
    const report: AdviceReport = {
      generatedAt:     new Date().toISOString(),
      dagName:         'dag-with-lanes',
      runsAnalysed:    2,
      lookback:        20,
      dagSuccessRate:  1,
      perLane:         [{
        laneId:         'test-lane',
        sampleCount:    2,
        avgRetries:     0,
        maxRetries:     0,
        avgDurationMs:  5000,
        maxDurationMs:  6000,
        successCount:   2,
        failureCount:   0,
        escalationCount: 0,
        failureRate:    0,
      }],
      recommendations: [],
    };

    const advisor = new RunAdvisor(PROJECT_ROOT);
    const output  = advisor.formatReport(report);

    expect(output).toContain('test-lane');
  });
});
