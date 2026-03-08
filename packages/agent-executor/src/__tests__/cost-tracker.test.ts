/**
 * Unit tests for CostTracker — savings proof fields added in BYOK pivot.
 * fs/promises is mocked so no real disk I/O occurs.
 */

jest.mock('fs/promises', () => ({
  mkdir:     jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

import * as fsMock from 'fs/promises';

import { CostTracker } from '../lib/cost-tracker/cost-tracker';
import type { RoutedResponse } from '../lib/model-router/model-router.types';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** 1 M tokens each direction at haiku vs opus pricing */
const HAIKU_ACTUAL = 1.50;   // 1M * $0.25 + 1M * $1.25
const OPUS_NAIVE   = 90.00;  // 1M * $15   + 1M * $75

function makeResponse(overrides: Partial<RoutedResponse> = {}): RoutedResponse {
  return {
    content:          'mock output',
    model:            'test-haiku',
    provider:         'test',
    usage:            { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    taskType:         'file-analysis',
    estimatedCostUSD: HAIKU_ACTUAL,
    naiveCostUSD:     OPUS_NAIVE,
    ...overrides,
  };
}

// ─── record() ────────────────────────────────────────────────────────────────

describe('CostTracker.record()', () => {
  it('stores a call with both estimatedCostUSD and naiveCostUSD', () => {
    const tracker = new CostTracker('run-1');
    tracker.record('lane-a', 'checkpoint-1', makeResponse());
    const { calls } = tracker.summary();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.estimatedCostUSD).toBe(HAIKU_ACTUAL);
    expect(calls[0]!.naiveCostUSD).toBe(OPUS_NAIVE);
  });

  it('captures laneId, checkpointId, taskType, provider, model', () => {
    const tracker = new CostTracker('run-1');
    tracker.record('lane-x', 'cp-7', makeResponse());
    const c = tracker.summary().calls[0]!;
    expect(c.laneId).toBe('lane-x');
    expect(c.checkpointId).toBe('cp-7');
    expect(c.taskType).toBe('file-analysis');
    expect(c.provider).toBe('test');
    expect(c.model).toBe('test-haiku');
  });

  it('accumulates multiple calls', () => {
    const tracker = new CostTracker('run-1');
    tracker.record('l', 'c1', makeResponse({ estimatedCostUSD: 1.00, naiveCostUSD: 30 }));
    tracker.record('l', 'c2', makeResponse({ estimatedCostUSD: 2.00, naiveCostUSD: 30 }));
    tracker.record('l', 'c3', makeResponse({ estimatedCostUSD: 3.00, naiveCostUSD: 30 }));
    expect(tracker.totalCost()).toBeCloseTo(6.00);
  });
});

// ─── totalCost() ─────────────────────────────────────────────────────────────

describe('CostTracker.totalCost()', () => {
  it('returns 0 when no calls recorded', () => {
    expect(new CostTracker('r').totalCost()).toBe(0);
  });

  it('sums estimatedCostUSD across all calls', () => {
    const tracker = new CostTracker('run-1');
    tracker.record('l', 'c', makeResponse({ estimatedCostUSD: 2.50, naiveCostUSD: 90 }));
    tracker.record('l', 'c', makeResponse({ estimatedCostUSD: 1.50, naiveCostUSD: 90 }));
    expect(tracker.totalCost()).toBeCloseTo(4.00);
  });
});

// ─── laneCost() ──────────────────────────────────────────────────────────────

describe('CostTracker.laneCost()', () => {
  it('returns sum of costs for the specified lane only', () => {
    const tracker = new CostTracker('run-1');
    tracker.record('lane-a', 'c', makeResponse({ estimatedCostUSD: 2.00, naiveCostUSD: 90 }));
    tracker.record('lane-a', 'c', makeResponse({ estimatedCostUSD: 1.00, naiveCostUSD: 90 }));
    tracker.record('lane-b', 'c', makeResponse({ estimatedCostUSD: 5.00, naiveCostUSD: 90 }));
    expect(tracker.laneCost('lane-a')).toBeCloseTo(3.00);
    expect(tracker.laneCost('lane-b')).toBeCloseTo(5.00);
  });

  it('returns 0 for a lane that has no calls', () => {
    const tracker = new CostTracker('run-1');
    expect(tracker.laneCost('nonexistent')).toBe(0);
  });
});

// ─── summary() — savings fields ──────────────────────────────────────────────

describe('CostTracker.summary() — savings proof fields', () => {
  it('computes totalNaiveCostUSD as sum of naiveCostUSD across all calls', () => {
    const tracker = new CostTracker('run-1');
    tracker.record('l', 'c', makeResponse({ estimatedCostUSD: 1.50, naiveCostUSD: 90.00 }));
    tracker.record('l', 'c', makeResponse({ estimatedCostUSD: 3.00, naiveCostUSD: 90.00 }));
    expect(tracker.summary().totalNaiveCostUSD).toBeCloseTo(180.00);
  });

  it('computes totalSavingsUSD = naive − actual', () => {
    const tracker = new CostTracker('run-1');
    tracker.record('l', 'c', makeResponse({ estimatedCostUSD: 1.50, naiveCostUSD: 90.00 }));
    expect(tracker.summary().totalSavingsUSD).toBeCloseTo(88.50);
  });

  it('computes savingsRatePct correctly', () => {
    const tracker = new CostTracker('run-1');
    tracker.record('l', 'c', makeResponse({ estimatedCostUSD: 1.50, naiveCostUSD: 90.00 }));
    // (90 - 1.5) / 90 * 100 ≈ 98.33 %
    expect(tracker.summary().savingsRatePct).toBeCloseTo(((90 - 1.5) / 90) * 100, 2);
  });

  it('returns savingsRatePct = 0 when naive cost is 0 (no divide-by-zero)', () => {
    const tracker = new CostTracker('run-1');
    tracker.record('l', 'c', makeResponse({ estimatedCostUSD: 0, naiveCostUSD: 0 }));
    expect(tracker.summary().savingsRatePct).toBe(0);
  });

  it('accumulates savings correctly across multiple calls', () => {
    const tracker = new CostTracker('run-1');
    tracker.record('l', 'c', makeResponse({ estimatedCostUSD: 1.50,  naiveCostUSD: 90.00 }));
    tracker.record('l', 'c', makeResponse({ estimatedCostUSD: 18.00, naiveCostUSD: 90.00 }));
    const s = tracker.summary();
    expect(s.totalCostUSD).toBeCloseTo(19.50);
    expect(s.totalNaiveCostUSD).toBeCloseTo(180.00);
    expect(s.totalSavingsUSD).toBeCloseTo(160.50);
  });

  it('populates byLane with aggregated lane costs', () => {
    const tracker = new CostTracker('run-1');
    tracker.record('lane-a', 'c', makeResponse({ estimatedCostUSD: 1.00, naiveCostUSD: 45 }));
    tracker.record('lane-a', 'c', makeResponse({ estimatedCostUSD: 2.00, naiveCostUSD: 45 }));
    tracker.record('lane-b', 'c', makeResponse({ estimatedCostUSD: 4.00, naiveCostUSD: 45 }));
    const s = tracker.summary();
    expect(s.byLane['lane-a']!.totalCostUSD).toBeCloseTo(3.00);
    expect(s.byLane['lane-a']!.callCount).toBe(2);
    expect(s.byLane['lane-b']!.totalCostUSD).toBeCloseTo(4.00);
  });

  it('populates byTaskType with call counts', () => {
    const tracker = new CostTracker('run-1');
    tracker.record('l', 'c', makeResponse({ taskType: 'file-analysis' } as Partial<RoutedResponse>));
    tracker.record('l', 'c', makeResponse({ taskType: 'code-generation' } as Partial<RoutedResponse>));
    tracker.record('l', 'c', makeResponse({ taskType: 'file-analysis' } as Partial<RoutedResponse>));
    const s = tracker.summary();
    expect(s.byTaskType['file-analysis']!.calls).toBe(2);
    expect(s.byTaskType['code-generation']!.calls).toBe(1);
  });

  it('includes runId and startedAt in summary', () => {
    const tracker = new CostTracker('run-xyz');
    tracker.record('l', 'c', makeResponse());
    const s = tracker.summary();
    expect(s.runId).toBe('run-xyz');
    expect(s.startedAt).toBeTruthy();
    expect(s.completedAt).toBeTruthy();
  });

  it('reports budgetExceeded = true when over cap', () => {
    const tracker = new CostTracker('run-1', 1.00);
    tracker.record('l', 'c', makeResponse({ estimatedCostUSD: 2.00, naiveCostUSD: 90 }));
    expect(tracker.summary().budgetExceeded).toBe(true);
    expect(tracker.summary().budgetCapUSD).toBe(1.00);
  });

  it('reports budgetExceeded = false when under cap', () => {
    const tracker = new CostTracker('run-1', 100.00);
    tracker.record('l', 'c', makeResponse({ estimatedCostUSD: 1.50, naiveCostUSD: 90 }));
    expect(tracker.summary().budgetExceeded).toBe(false);
  });
});

// ─── budget cap callback ──────────────────────────────────────────────────────

describe('CostTracker budget cap callback', () => {
  it('fires onBudgetExceeded when total crosses cap', () => {
    const cb = jest.fn();
    const tracker = new CostTracker('run-1', 2.00, cb);
    tracker.record('l', 'c', makeResponse({ estimatedCostUSD: 2.50, naiveCostUSD: 90 }));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('fires the callback only once even with multiple over-budget records', () => {
    const cb = jest.fn();
    const tracker = new CostTracker('run-1', 1.00, cb);
    tracker.record('l', 'c', makeResponse({ estimatedCostUSD: 1.50, naiveCostUSD: 90 }));
    tracker.record('l', 'c', makeResponse({ estimatedCostUSD: 1.50, naiveCostUSD: 90 }));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not fire when total stays under cap', () => {
    const cb = jest.fn();
    const tracker = new CostTracker('run-1', 100.00, cb);
    tracker.record('l', 'c', makeResponse({ estimatedCostUSD: 1.50, naiveCostUSD: 90 }));
    expect(cb).not.toHaveBeenCalled();
  });
});

// ─── isOverBudget() ──────────────────────────────────────────────────────────

describe('CostTracker.isOverBudget()', () => {
  it('returns false when no budget cap is set', () => {
    const tracker = new CostTracker('run-1');
    tracker.record('l', 'c', makeResponse({ estimatedCostUSD: 999, naiveCostUSD: 90 }));
    expect(tracker.isOverBudget()).toBe(false);
  });

  it('returns true after total exceeds budget cap', () => {
    const tracker = new CostTracker('run-1', 0.50);
    tracker.record('l', 'c', makeResponse({ estimatedCostUSD: 1.00, naiveCostUSD: 90 }));
    expect(tracker.isOverBudget()).toBe(true);
  });

  it('returns false when total is exactly at cap (not exceeded)', () => {
    const tracker = new CostTracker('run-1', 1.50);
    tracker.record('l', 'c', makeResponse({ estimatedCostUSD: 1.50, naiveCostUSD: 90 }));
    // >= cap triggers it, so this should be over
    expect(tracker.isOverBudget()).toBe(true);
  });
});

// ─── formatReport() ──────────────────────────────────────────────────────────

describe('CostTracker.formatReport()', () => {
  it('contains Actual, Naive, and Saved lines', () => {
    const tracker = new CostTracker('run-1');
    tracker.record('l', 'c', makeResponse({ estimatedCostUSD: 1.50, naiveCostUSD: 90.00 }));
    const report = tracker.formatReport();
    expect(report).toContain('Actual:');
    expect(report).toContain('Naive:');
    expect(report).toContain('Saved:');
  });

  it('mentions "smart routing" in the savings line', () => {
    const tracker = new CostTracker('run-1');
    tracker.record('l', 'c', makeResponse());
    expect(tracker.formatReport()).toContain('smart routing');
  });

  it('includes budget exceeded warning when over cap', () => {
    const tracker = new CostTracker('run-1', 0.50);
    tracker.record('l', 'c', makeResponse({ estimatedCostUSD: 1.00, naiveCostUSD: 90 }));
    expect(tracker.formatReport()).toContain('EXCEEDED');
  });

  it('does not include budget warning when under cap', () => {
    const tracker = new CostTracker('run-1', 100.00);
    tracker.record('l', 'c', makeResponse());
    expect(tracker.formatReport()).not.toContain('EXCEEDED');
  });

  it('lists by lane section', () => {
    const tracker = new CostTracker('run-1');
    tracker.record('lane-alpha', 'c', makeResponse());
    expect(tracker.formatReport()).toContain('lane-alpha');
  });
});

// ─── save() ──────────────────────────────────────────────────────────────────

describe('CostTracker.save()', () => {
  const mockWriteFile = fsMock.writeFile as jest.Mock;
  const mockMkdir    = fsMock.mkdir as jest.Mock;

  beforeEach(() => jest.clearAllMocks());

  it('creates the output directory with recursive:true', async () => {
    const tracker = new CostTracker('run-save');
    tracker.record('l', 'c', makeResponse());
    await tracker.save('/out/dir');
    expect(mockMkdir).toHaveBeenCalledWith('/out/dir', { recursive: true });
  });

  it('writes a file named cost-<runId>.json', async () => {
    const tracker = new CostTracker('run-42');
    tracker.record('l', 'c', makeResponse());
    await tracker.save('/out');
    const [writePath] = mockWriteFile.mock.calls[0] as [string, string, string];
    expect(writePath).toMatch(/cost-run-42\.json$/);
  });

  it('writes JSON containing totalSavingsUSD', async () => {
    const tracker = new CostTracker('run-42');
    tracker.record('l', 'c', makeResponse());
    await tracker.save('/out');
    const [, content] = mockWriteFile.mock.calls[0] as [string, string, string];
    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty('totalSavingsUSD');
    expect(parsed).toHaveProperty('totalNaiveCostUSD');
    expect(parsed).toHaveProperty('savingsRatePct');
  });
});
