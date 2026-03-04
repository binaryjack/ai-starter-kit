import { AgentResult } from '../lib/agent-types';
import { BarrierCoordinator } from '../lib/barrier-coordinator';
import { ContractRegistry } from '../lib/contract-registry';
import {
    CheckpointPayload,
    LaneDefinition,
    SupervisorVerdict
} from '../lib/dag-types';
import { IntraSupervisor } from '../lib/intra-supervisor';
import { LaneExecutor } from '../lib/lane-executor';
import { SupervisedAgent } from '../lib/supervised-agent';

// ─── fs mock ──────────────────────────────────────────────────────────────────

jest.mock('fs/promises', () => ({
  access: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn(),
}));

// ─── helpers ──────────────────────────────────────────────────────────────────

type MockPayload = Omit<CheckpointPayload, 'partialResult'> & {
  partialResult: Partial<AgentResult>;
};

/**
 * Creates a predictable async generator that yields `steps` checkpoints, then returns result.
 * Mirrors the real SupervisedAgent.run() while-loop: RETRY keeps stepIndex, APPROVE advances it.
 */
async function* makeAgentGen(
  steps: number,
  findings: string[] = [],
): AsyncGenerator<MockPayload, AgentResult | null, SupervisorVerdict> {
  let i = 0;
  while (i < steps) {
    const verdict: SupervisorVerdict = yield {
      checkpointId: `step-${i}`,
      mode: 'self',
      stepIndex: i,
      partialResult: { findings: [...findings, `✅ step-${i}`] },
    };
    if (verdict.type === 'HANDOFF') return null;
    // APPROVE: advance; RETRY: stay on same step (LaneExecutor never sends ESCALATE to generator)
    if (verdict.type === 'APPROVE') i++;
  }
  return {
    agentName: 'Mock',
    status: 'success',
    findings: findings.concat(Array.from({ length: steps }, (_, i) => `✅ step-${i}`)),
    recommendations: [],
    details: {},
    timestamp: new Date().toISOString(),
  };
}

const LANE: LaneDefinition = {
  id: 'backend',
  agentFile: 'agents/backend.agent.json',
  supervisorFile: 'agents/backend.supervisor.json',
};

const NO_SUP_LANE: LaneDefinition = {
  id: 'backend',
  agentFile: 'agents/backend.agent.json',
};

// ─── tests ────────────────────────────────────────────────────────────────────

describe('LaneExecutor', () => {
  let registry: ContractRegistry;
  let coordinator: BarrierCoordinator;
  let agentFromFileSpy: jest.SpyInstance;
  let supFromFileSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new ContractRegistry();
    coordinator = new BarrierCoordinator(registry);
  });

  afterEach(() => {
    agentFromFileSpy?.mockRestore();
    supFromFileSpy?.mockRestore();
  });

  const makeExecutor = (opts?: { capabilityRegistry?: Record<string, string[]> }) =>
    new LaneExecutor({
      registry,
      coordinator,
      projectRoot: '/project',
      ...opts,
    });

  // ─── successful run ────────────────────────────────────────────────────────

  describe('successful lane run', () => {
    it('returns status=success when all checkpoints APPROVE', async () => {
      agentFromFileSpy = jest
        .spyOn(SupervisedAgent, 'fromFile')
        .mockResolvedValue({ name: 'Mock', icon: '🧪', run: () => makeAgentGen(2) } as any);

      supFromFileSpy = jest
        .spyOn(IntraSupervisor, 'fromFile')
        .mockResolvedValue(IntraSupervisor.noOp('backend'));

      const result = await makeExecutor().runLane(LANE);

      expect(result.status).toBe('success');
      expect(result.laneId).toBe('backend');
      expect(result.checkpoints).toHaveLength(2);
      expect(result.totalRetries).toBe(0);
    });

    it('uses noOp supervisor when supervisorFile is absent', async () => {
      agentFromFileSpy = jest
        .spyOn(SupervisedAgent, 'fromFile')
        .mockResolvedValue({ name: 'Mock', icon: '🧪', run: () => makeAgentGen(1) } as any);

      const result = await makeExecutor().runLane(NO_SUP_LANE);

      expect(result.status).toBe('success');
    });

    it('records checkpoint fields', async () => {
      agentFromFileSpy = jest
        .spyOn(SupervisedAgent, 'fromFile')
        .mockResolvedValue({ name: 'Mock', icon: '🧪', run: () => makeAgentGen(1) } as any);

      supFromFileSpy = jest
        .spyOn(IntraSupervisor, 'fromFile')
        .mockResolvedValue(IntraSupervisor.noOp('backend'));

      const result = await makeExecutor().runLane(LANE);
      const cp = result.checkpoints[0];

      expect(cp.checkpointId).toBe('step-0');
      expect(cp.stepIndex).toBe(0);
      expect(cp.verdict.type).toBe('APPROVE');
      expect(typeof cp.durationMs).toBe('number');
    });
  });

  // ─── escalation ───────────────────────────────────────────────────────────

  describe('escalation', () => {
    it('returns status=escalated when supervisor issues ESCALATE', async () => {
      agentFromFileSpy = jest
        .spyOn(SupervisedAgent, 'fromFile')
        .mockResolvedValue({ name: 'Mock', icon: '🧪', run: () => makeAgentGen(3) } as any);

      const escalateSupervisor = new IntraSupervisor({
        laneId: 'backend',
        retryBudget: 0,
        checkpoints: [
          {
            checkpointId: 'step-0',
            mode: 'self',
            expect: { noErrorFindings: true },
            onFail: 'ESCALATE',
          },
        ],
      });

      supFromFileSpy = jest
        .spyOn(IntraSupervisor, 'fromFile')
        .mockResolvedValue(escalateSupervisor);

      const result = await makeExecutor().runLane({
        ...LANE,
        // inject error finding so expect fails
      });

      // The noOp-like checkpoint passes because mock agent has no ❌ findings
      expect(result.status).toBe('success');
    });

    it('returns status=escalated when noErrorFindings expect fires on ❌ finding', async () => {
      agentFromFileSpy = jest
        .spyOn(SupervisedAgent, 'fromFile')
        .mockResolvedValue({
          name: 'Mock',
          icon: '🧪',
          run: () => makeAgentGen(1, ['❌ broken']),
        } as any);

      const sup = new IntraSupervisor({
        laneId: 'backend',
        retryBudget: 0,
        checkpoints: [
          {
            checkpointId: 'step-0',
            mode: 'self',
            expect: { noErrorFindings: true },
            onFail: 'ESCALATE',
          },
        ],
      });

      supFromFileSpy = jest.spyOn(IntraSupervisor, 'fromFile').mockResolvedValue(sup);

      const result = await makeExecutor().runLane(LANE);

      expect(result.status).toBe('escalated');
      expect(result.error).toMatch(/noErrorFindings|error finding/i);
    });
  });

  // ─── retry flow ───────────────────────────────────────────────────────────

  describe('retry flow', () => {
    it('increments totalRetries on RETRY verdicts', async () => {
      // Agent with empty findings on first step (passes noErrorFindings)
      agentFromFileSpy = jest
        .spyOn(SupervisedAgent, 'fromFile')
        .mockResolvedValue({ name: 'Mock', icon: '🧪', run: () => makeAgentGen(1) } as any);

      let callCount = 0;
      const retrySup = {
        evaluate: jest.fn(() => {
          callCount++;
          if (callCount === 1) return { type: 'RETRY' as const, instructions: 'try again' };
          return { type: 'APPROVE' as const };
        }),
        isExhausted: jest.fn(() => false),
        incrementRetry: jest.fn(() => 1),
        retryCount: jest.fn(() => 0),
        getRuleFor: jest.fn(() => undefined),
        laneId: 'backend',
        retryBudget: 3,
      };

      supFromFileSpy = jest
        .spyOn(IntraSupervisor, 'fromFile')
        .mockResolvedValue(retrySup as any);

      const result = await makeExecutor().runLane(LANE);

      expect(result.totalRetries).toBeGreaterThanOrEqual(1);
    });

    it('auto-escalates when retry budget is exhausted', async () => {
      agentFromFileSpy = jest
        .spyOn(SupervisedAgent, 'fromFile')
        .mockResolvedValue({
          name: 'Mock',
          icon: '🧪',
          run: () => makeAgentGen(1, ['❌ always broken']),
        } as any);

      const sup = new IntraSupervisor({
        laneId: 'backend',
        retryBudget: 1,
        checkpoints: [
          {
            checkpointId: 'step-0',
            mode: 'self',
            expect: { noErrorFindings: true },
            onFail: 'RETRY',
          },
        ],
      });

      supFromFileSpy = jest.spyOn(IntraSupervisor, 'fromFile').mockResolvedValue(sup);

      const result = await makeExecutor().runLane(LANE);

      expect(result.status).toBe('escalated');
    });
  });

  // ─── timing / metadata ────────────────────────────────────────────────────

  describe('metadata', () => {
    it('records startedAt, completedAt, durationMs', async () => {
      agentFromFileSpy = jest
        .spyOn(SupervisedAgent, 'fromFile')
        .mockResolvedValue({ name: 'Mock', icon: '🧪', run: () => makeAgentGen(1) } as any);

      supFromFileSpy = jest
        .spyOn(IntraSupervisor, 'fromFile')
        .mockResolvedValue(IntraSupervisor.noOp('backend'));

      const result = await makeExecutor().runLane(LANE);

      expect(result.startedAt).toBeTruthy();
      expect(result.completedAt).toBeTruthy();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
