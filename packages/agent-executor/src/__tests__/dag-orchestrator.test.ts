import { DagOrchestrator } from '../lib/dag-orchestrator';
import { DagDefinition, LaneResult } from '../lib/dag-types';

// ─── mocks ────────────────────────────────────────────────────────────────────

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../lib/lane-executor', () => ({
  runLane: jest.fn(),
}));

import * as fsMod from 'fs/promises';
import { runLane } from '../lib/lane-executor';

const mockFs = fsMod as jest.Mocked<typeof fsMod>;
const mockRunLane = runLane as jest.MockedFunction<typeof runLane>;

// ─── helpers ──────────────────────────────────────────────────────────────────

const makeLaneResult = (laneId: string, status: LaneResult['status'] = 'success'): LaneResult => ({
  laneId,
  status,
  checkpoints: [],
  totalRetries: 0,
  handoffsReceived: 0,
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  durationMs: 10,
  agentResult:
    status === 'success'
      ? {
          agentName: laneId,
          status: 'success',
          findings: [`✅ [${laneId}] ok`],
          recommendations: [`💡 [${laneId}] rec`],
          details: {},
          timestamp: new Date().toISOString(),
        }
      : undefined,
});

const dag2Parallel: DagDefinition = {
  name: 'Parallel DAG',
  description: 'Two lanes with no dependencies',
  lanes: [
    { id: 'sql', agentFile: 'agents/sql.agent.json' },
    { id: 'react', agentFile: 'agents/react.agent.json' },
  ],
};

const dag2Sequential: DagDefinition = {
  name: 'Sequential DAG',
  description: 'Two lanes where backend depends on sql',
  lanes: [
    { id: 'sql', agentFile: 'agents/sql.agent.json' },
    { id: 'backend', agentFile: 'agents/backend.agent.json', dependsOn: ['sql'] },
  ],
};

const makeOrchestrator = (verbose = false) =>
  new DagOrchestrator('/project', { verbose, resultsDir: '/project/.agents/results' });

// ─── tests ────────────────────────────────────────────────────────────────────

describe('DagOrchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── loadDag / validation ──────────────────────────────────────────────────

  describe('loadDag validation', () => {
    const load = async (partial: Partial<DagDefinition>) => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(partial));
      return makeOrchestrator().loadDag('/project/agents/dag.json');
    };

    it('throws when "name" is missing', async () => {
      await expect(load({ lanes: [{ id: 'x', agentFile: 'a.json' }] })).rejects.toThrow(
        /missing "name"/,
      );
    });

    it('throws when "lanes" is empty', async () => {
      await expect(load({ name: 'DAG', lanes: [] })).rejects.toThrow(/non-empty array/);
    });

    it('throws when dependsOn references unknown lane', async () => {
      await expect(
        load({
          name: 'DAG',
          lanes: [
            { id: 'a', agentFile: 'a.json', dependsOn: ['ghost'] },
          ],
        }),
      ).rejects.toThrow(/unknown lane "ghost"/);
    });

    it('throws on cycle detection', async () => {
      await expect(
        load({
          name: 'DAG',
          lanes: [
            { id: 'a', agentFile: 'a.json', dependsOn: ['b'] },
            { id: 'b', agentFile: 'b.json', dependsOn: ['a'] },
          ],
        }),
      ).rejects.toThrow(/cycle/i);
    });

    it('loads a valid dag successfully', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(dag2Parallel));
      const dag = await makeOrchestrator().loadDag('/project/agents/dag.json');

      expect(dag.name).toBe('Parallel DAG');
      expect(dag.lanes).toHaveLength(2);
    });
  });

  // ─── execute — status rollup ───────────────────────────────────────────────

  describe('execute', () => {
    it('returns status=success when all lanes succeed', async () => {
      mockRunLane
        .mockResolvedValueOnce(makeLaneResult('sql'))
        .mockResolvedValueOnce(makeLaneResult('react'));

      const result = await makeOrchestrator().execute(dag2Parallel);

      expect(result.status).toBe('success');
      expect(result.lanes).toHaveLength(2);
    });

    it('returns status=partial when some lanes fail', async () => {
      mockRunLane
        .mockResolvedValueOnce(makeLaneResult('sql', 'success'))
        .mockResolvedValueOnce(makeLaneResult('react', 'escalated'));

      const result = await makeOrchestrator().execute(dag2Parallel);

      expect(result.status).toBe('partial');
    });

    it('returns status=failed when all lanes fail', async () => {
      mockRunLane
        .mockResolvedValueOnce(makeLaneResult('sql', 'failed'))
        .mockResolvedValueOnce(makeLaneResult('react', 'failed'));

      const result = await makeOrchestrator().execute(dag2Parallel);

      expect(result.status).toBe('failed');
    });

    it('rolls up findings and recommendations from successful lanes', async () => {
      mockRunLane
        .mockResolvedValueOnce(makeLaneResult('sql'))
        .mockResolvedValueOnce(makeLaneResult('react'));

      const result = await makeOrchestrator().execute(dag2Parallel);

      expect(result.findings.some((f) => f.includes('[sql]'))).toBe(true);
      expect(result.findings.some((f) => f.includes('[react]'))).toBe(true);
      expect(result.recommendations.some((r) => r.includes('[sql]'))).toBe(true);
    });

    it('populates dagName, runId, startedAt, completedAt, totalDurationMs', async () => {
      mockRunLane.mockResolvedValue(makeLaneResult('sql'));

      const result = await makeOrchestrator().execute({
        name: 'Single Lane',
        description: 'one lane',
        lanes: [{ id: 'sql', agentFile: 'a.json' }],
      });

      expect(result.dagName).toBe('Single Lane');
      expect(typeof result.runId).toBe('string');
      expect(result.runId.length).toBeGreaterThan(0);
      expect(result.startedAt).toBeTruthy();
      expect(result.completedAt).toBeTruthy();
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('handles Promise.allSettled rejection gracefully', async () => {
      mockRunLane.mockRejectedValue(new Error('Unexpected crash'));

      const result = await makeOrchestrator().execute({
        name: 'Crash DAG',
        description: 'lane throws',
        lanes: [{ id: 'sql', agentFile: 'a.json' }],
      });

      expect(result.status).toBe('failed');
      expect(result.lanes[0].status).toBe('failed');
      expect(result.lanes[0].error).toMatch(/Unexpected crash/);
    });
  });

  // ─── topological sort (via execution order) ────────────────────────────────

  describe('topological sort', () => {
    it('runs independent lanes in parallel (single round)', async () => {
      mockRunLane
        .mockResolvedValueOnce(makeLaneResult('sql'))
        .mockResolvedValueOnce(makeLaneResult('react'));

      await makeOrchestrator().execute(dag2Parallel);

      // Both lanes called in the same tick (single Promise.allSettled batch)
      expect(mockRunLane).toHaveBeenCalledTimes(2);
      const callArgs = mockRunLane.mock.calls.map(([lane]) => (lane as any).id);
      expect(callArgs).toContain('sql');
      expect(callArgs).toContain('react');
    });

    it('runs dependent lane after its dependency', async () => {
      const callOrder: string[] = [];

      mockRunLane.mockImplementation(async (lane) => {
        callOrder.push((lane as any).id);
        return makeLaneResult((lane as any).id);
      });

      await makeOrchestrator().execute(dag2Sequential);

      expect(callOrder[0]).toBe('sql');
      expect(callOrder[1]).toBe('backend');
    });
  });

  // ─── capabilityRegistry build ─────────────────────────────────────────────

  describe('capability registry', () => {
    it('auto-registers capabilities from lane.capabilities[]', async () => {
      mockRunLane.mockResolvedValue(makeLaneResult('sql'));

      // No assertion on the registry internals — just verify it doesn't crash
      // and still returns a valid DagResult
      const result = await makeOrchestrator().execute({
        name: 'Cap DAG',
        description: 'with capabilities',
        lanes: [{ id: 'sql', agentFile: 'a.json', capabilities: ['validate-sql-schema'] }],
      });

      expect(result.status).toBe('success');
    });
  });
});
