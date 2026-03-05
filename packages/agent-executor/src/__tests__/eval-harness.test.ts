/**
 * Unit tests for eval-harness.ts
 * The judgeProvider is mocked to control scoring.
 */

import { formatEvalReport, runEval } from '../lib/eval-harness.js'
import type { LLMProvider, LLMResponse } from '../lib/llm-provider.js'

// ─── Mock judge provider factory ──────────────────────────────────────────────

const MOCK_USAGE = { inputTokens: 10, outputTokens: 5 };

function makeJudge(score: number, reasoning = 'ok'): LLMProvider {
  return {
    name: 'mock-judge',
    complete: jest.fn().mockResolvedValue({
      content: JSON.stringify({ score, reasoning }),
      usage: MOCK_USAGE,
      model: 'judge-model',
      provider: 'mock',
    } satisfies LLMResponse),
    stream: jest.fn(),
    isAvailable: jest.fn().mockResolvedValue(true),
  };
}

function makeErrorJudge(): LLMProvider {
  return {
    name: 'error-judge',
    complete: jest.fn().mockRejectedValue(new Error('judge unavailable')),
    stream: jest.fn(),
    isAvailable: jest.fn().mockResolvedValue(false),
  };
}

function makeMalformedJudge(): LLMProvider {
  return {
    name: 'malformed-judge',
    complete: jest.fn().mockResolvedValue({
      content: 'not json at all',
      usage: MOCK_USAGE,
      model: 'judge-model',
      provider: 'mock',
    } satisfies LLMResponse),
    stream: jest.fn(),
    isAvailable: jest.fn().mockResolvedValue(true),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const TASK_FN = async (input: string) => `echo:${input}`;

describe('runEval()', () => {
  it('runId starts with "eval-"', async () => {
    const report = await runEval({
      name: 'test',
      cases: [{ id: 'c1', input: 'hi', expected: 'hi' }],
      taskFn: TASK_FN,
      judgeProvider: makeJudge(1.0),
      judgeModelId: 'judge-model',
    });
    expect(report.runId).toMatch(/^eval-/);
  });

  it('all pass: meanScore=1.0, passed=N, failed=0', async () => {
    const cases = [
      { id: 'c1', input: 'a', expected: 'a' },
      { id: 'c2', input: 'b', expected: 'b' },
      { id: 'c3', input: 'c', expected: 'c' },
    ];
    const report = await runEval({
      name: 'all-pass',
      cases,
      taskFn: TASK_FN,
      judgeProvider: makeJudge(1.0),
      judgeModelId: 'model',
    });

    expect(report.passed).toBe(3);
    expect(report.failed).toBe(0);
    expect(report.meanScore).toBeCloseTo(1.0);
  });

  it('all fail: meanScore=0.0, passed=0, failed=N', async () => {
    const cases = [
      { id: 'c1', input: 'a' },
      { id: 'c2', input: 'b' },
    ];
    const report = await runEval({
      name: 'all-fail',
      cases,
      taskFn: TASK_FN,
      judgeProvider: makeJudge(0.0, 'wrong'),
      judgeModelId: 'model',
    });

    expect(report.passed).toBe(0);
    expect(report.failed).toBe(2);
    expect(report.meanScore).toBeCloseTo(0.0);
  });

  it('custom passThreshold=0.5: score 0.6 → pass, score 0.4 → fail', async () => {
    const judge: LLMProvider = {
      name: 'threshold-judge',
      complete: jest.fn()
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 0.6, reasoning: 'ok' }), usage: MOCK_USAGE, model: 'm', provider: 'mock' })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 0.4, reasoning: 'low' }), usage: MOCK_USAGE, model: 'm', provider: 'mock' }),
      stream: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    const report = await runEval({
      name: 'threshold-test',
      cases: [{ id: 'high', input: 'h' }, { id: 'low', input: 'l' }],
      taskFn: TASK_FN,
      judgeProvider: judge,
      judgeModelId: 'model',
      passThreshold: 0.5,
    });

    const highCase = report.cases.find((c) => c.id === 'high');
    const lowCase = report.cases.find((c) => c.id === 'low');
    expect(highCase?.pass).toBe(true);
    expect(lowCase?.pass).toBe(false);
  });

  it('taskFn throws → case has error field, score=0, pass=false', async () => {
    const errorTaskFn = async (_input: string): Promise<string> => {
      throw new Error('task failed');
    };

    const report = await runEval({
      name: 'task-error',
      cases: [{ id: 'e1', input: 'fail' }],
      taskFn: errorTaskFn,
      judgeProvider: makeJudge(1.0),
      judgeModelId: 'model',
    });

    expect(report.cases[0]?.error).toBeDefined();
    expect(report.cases[0]?.score).toBe(0);
    expect(report.cases[0]?.pass).toBe(false);
  });

  it('judge throws → case score=0, reasoning contains "Judge error"', async () => {
    const report = await runEval({
      name: 'judge-error',
      cases: [{ id: 'j1', input: 'test' }],
      taskFn: TASK_FN,
      judgeProvider: makeErrorJudge(),
      judgeModelId: 'model',
    });

    expect(report.cases[0]?.score).toBe(0);
    expect(report.cases[0]?.reasoning).toContain('Judge error');
    expect(report.cases[0]?.pass).toBe(false);
  });

  it('malformed judge JSON → score=0, reasoning contains "Judge error"', async () => {
    const report = await runEval({
      name: 'malformed-judge',
      cases: [{ id: 'm1', input: 'test' }],
      taskFn: TASK_FN,
      judgeProvider: makeMalformedJudge(),
      judgeModelId: 'model',
    });

    expect(report.cases[0]?.score).toBe(0);
    expect(report.cases[0]?.reasoning).toContain('Judge error');
  });

  it('clamps score to [0, 1] — judge returning 1.5 becomes 1.0', async () => {
    const judge: LLMProvider = {
      name: 'clamp-judge',
      complete: jest.fn().mockResolvedValue({
        content: JSON.stringify({ score: 1.5, reasoning: 'too high' }),
        usage: MOCK_USAGE, model: 'm', provider: 'mock',
      }),
      stream: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    const report = await runEval({
      name: 'clamp-test',
      cases: [{ id: 'c1', input: 'x' }],
      taskFn: TASK_FN,
      judgeProvider: judge,
      judgeModelId: 'model',
    });

    expect(report.cases[0]?.score).toBeLessThanOrEqual(1.0);
  });

  it('strips markdown fences from judge response', async () => {
    const judge: LLMProvider = {
      name: 'fence-judge',
      complete: jest.fn().mockResolvedValue({
        content: '```json\n' + JSON.stringify({ score: 0.8, reasoning: 'good' }) + '\n```',
        usage: MOCK_USAGE, model: 'm', provider: 'mock',
      }),
      stream: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    const report = await runEval({
      name: 'strip-fences',
      cases: [{ id: 'c1', input: 'x' }],
      taskFn: TASK_FN,
      judgeProvider: judge,
      judgeModelId: 'model',
    });

    expect(report.cases[0]?.score).toBeCloseTo(0.8);
  });

  it('processes cases in concurrency batches', async () => {
    const completionOrder: number[] = [];
    let callIndex = 0;

    const judge: LLMProvider = {
      name: 'concurrency-judge',
      complete: jest.fn().mockImplementation(() => {
        const idx = callIndex++;
        completionOrder.push(idx);
        return Promise.resolve({
          content: JSON.stringify({ score: 1.0, reasoning: 'ok' }),
          usage: MOCK_USAGE, model: 'm', provider: 'mock',
        });
      }),
      stream: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    const cases = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, input: `input${i}` }));

    const report = await runEval({
      name: 'concurrency-test',
      cases,
      taskFn: TASK_FN,
      judgeProvider: judge,
      judgeModelId: 'model',
      concurrency: 3,
    });

    // All 6 cases must be run
    expect(report.cases).toHaveLength(6);
    expect(report.passed).toBe(6);
  });

  it('report includes startedAt and finishedAt ISO strings', async () => {
    const report = await runEval({
      name: 'timing',
      cases: [{ id: 'c1', input: 'x' }],
      taskFn: TASK_FN,
      judgeProvider: makeJudge(1.0),
      judgeModelId: 'model',
    });

    expect(new Date(report.startedAt).toISOString()).toBe(report.startedAt);
    expect(new Date(report.finishedAt).toISOString()).toBe(report.finishedAt);
  });

  it('empty cases array → 0 passed, 0 failed, meanScore=0', async () => {
    const report = await runEval({
      name: 'empty',
      cases: [],
      taskFn: TASK_FN,
      judgeProvider: makeJudge(1.0),
      judgeModelId: 'model',
    });

    expect(report.passed).toBe(0);
    expect(report.failed).toBe(0);
    expect(report.meanScore).toBe(0);
  });
});

describe('formatEvalReport()', () => {
  it('contains PASS and FAIL strings', async () => {
    const judge: LLMProvider = {
      name: 'format-judge',
      complete: jest.fn()
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 1.0, reasoning: 'ok' }), usage: MOCK_USAGE, model: 'm', provider: 'mock' })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 0.0, reasoning: 'bad' }), usage: MOCK_USAGE, model: 'm', provider: 'mock' }),
      stream: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    const report = await runEval({
      name: 'format-test',
      cases: [{ id: 'pass-case', input: 'a' }, { id: 'fail-case', input: 'b' }],
      taskFn: TASK_FN,
      judgeProvider: judge,
      judgeModelId: 'model',
    });

    const formatted = formatEvalReport(report);
    expect(formatted).toContain('PASS');
    expect(formatted).toContain('FAIL');
    expect(formatted).toContain('format-test');
  });

  it('shows meanScore in output', async () => {
    const report = await runEval({
      name: 'mean-test',
      cases: [{ id: 'c1', input: 'x' }],
      taskFn: TASK_FN,
      judgeProvider: makeJudge(0.75),
      judgeModelId: 'model',
    });

    const formatted = formatEvalReport(report);
    expect(formatted).toContain('0.750');
  });

  it('shows pass count out of total', async () => {
    const cases = [{ id: 'c1', input: 'a' }, { id: 'c2', input: 'b' }];

    const report = await runEval({
      name: 'count-test',
      cases,
      taskFn: TASK_FN,
      judgeProvider: makeJudge(1.0),
      judgeModelId: 'model',
    });

    const formatted = formatEvalReport(report);
    expect(formatted).toContain('2/2');
  });
});
