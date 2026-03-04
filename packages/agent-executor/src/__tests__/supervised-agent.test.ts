import { AgentDefinition } from '../lib/agent-types';
import { SupervisorVerdict } from '../lib/dag-types';
import { EscalationError, SupervisedAgent } from '../lib/supervised-agent';

// ─── fs mock ──────────────────────────────────────────────────────────────────

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  access: jest.fn(),
  readdir: jest.fn(),
  mkdir: jest.fn(),
  writeFile: jest.fn(),
}));

import * as fsMock from 'fs/promises';
const mockFs = fsMock as jest.Mocked<typeof fsMock>;

// ─── fixtures ─────────────────────────────────────────────────────────────────

const AGENT_DEF: AgentDefinition = {
  name: 'Test Agent',
  icon: '🧪',
  description: 'Simple test agent',
  checks: [
    {
      type: 'file-exists',
      path: 'package.json',
      pass: '✅ Found package.json',
      fail: '❌ Missing package.json',
      failSeverity: 'error',
    },
    {
      type: 'file-exists',
      path: 'tsconfig.json',
      pass: '✅ Found tsconfig.json',
      fail: '❌ Missing tsconfig.json',
      failSeverity: 'error',
    },
  ],
};

const APPROVE: SupervisorVerdict = { type: 'APPROVE' };
const RETRY: SupervisorVerdict = {
  type: 'RETRY',
  instructions: 'Please fix this',
};
const HANDOFF: SupervisorVerdict = {
  type: 'HANDOFF',
  targetLaneId: 'specialist',
};
const ESCALATE: SupervisorVerdict = {
  type: 'ESCALATE',
  reason: 'Too many errors',
};

// ─── tests ────────────────────────────────────────────────────────────────────

describe('SupervisedAgent', () => {
  const PROJECT_ROOT = '/project';

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: all files exist
    mockFs.access.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify(AGENT_DEF));
  });

  // ─── factory ───────────────────────────────────────────────────────────────

  describe('fromFile', () => {
    it('reads and parses agent definition from JSON file', async () => {
      const agent = await SupervisedAgent.fromFile('/agents/test.agent.json');

      expect(mockFs.readFile).toHaveBeenCalledWith('/agents/test.agent.json', 'utf-8');
      expect(agent.name).toBe('Test Agent');
      expect(agent.icon).toBe('🧪');
    });
  });

  // ─── generator — basic flow ────────────────────────────────────────────────

  describe('run() generator', () => {
    it('yields one checkpoint per check step', async () => {
      const agent = new SupervisedAgent(AGENT_DEF);
      const gen = agent.run(PROJECT_ROOT, 'self');

      const cp1 = await gen.next(APPROVE);
      expect(cp1.done).toBe(false);
      expect(cp1.value).toMatchObject({
        checkpointId: 'step-0',
        mode: 'self',
        stepIndex: 0,
      });

      const cp2 = await gen.next(APPROVE);
      expect(cp2.done).toBe(false);
      expect(cp2.value).toMatchObject({
        checkpointId: 'step-1',
        stepIndex: 1,
      });

      const final = await gen.next(APPROVE);
      expect(final.done).toBe(true);
    });

    it('returns a complete AgentResult when all steps are approved', async () => {
      const agent = new SupervisedAgent(AGENT_DEF);
      const gen = agent.run(PROJECT_ROOT, 'self');

      await gen.next(APPROVE); // start — doesn't consume verdict yet
      await gen.next(APPROVE); // step-0
      const done = await gen.next(APPROVE); // step-1 + return

      expect(done.done).toBe(true);
      expect((done.value as any)?.agentName).toBe('Test Agent');
      expect((done.value as any)?.status).toBe('success');
    });

    it('accumulates findings across steps', async () => {
      const agent = new SupervisedAgent(AGENT_DEF);
      const gen = agent.run(PROJECT_ROOT, 'self');

      await gen.next(APPROVE);
      const cp2 = await gen.next(APPROVE);
      // Step 1 partial result should have findings from step 0
      expect((cp2.value as any)?.partialResult?.findings?.length).toBeGreaterThan(0);

      const done = await gen.next(APPROVE);
      const result = done.value as any;
      expect(result?.findings).toContain('✅ Found package.json');
      expect(result?.findings).toContain('✅ Found tsconfig.json');
    });

    it('includes file-not-found as ❌ finding when access fails', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      const agent = new SupervisedAgent(AGENT_DEF);
      const gen = agent.run(PROJECT_ROOT, 'self');

      await gen.next(APPROVE);
      await gen.next(APPROVE);
      const done = await gen.next(APPROVE);
      const result = done.value as any;

      expect(result?.findings.some((f: string) => f.startsWith('❌'))).toBe(true);
    });
  });

  // ─── RETRY verdict ─────────────────────────────────────────────────────────

  describe('RETRY verdict', () => {
    it('re-runs the same step when RETRY received', async () => {
      const agent = new SupervisedAgent(AGENT_DEF);
      const gen = agent.run(PROJECT_ROOT, 'self');

      // step-0 first pass
      const cp1 = await gen.next(APPROVE); // initial kick
      expect((cp1.value as any)?.checkpointId).toBe('step-0');

      // Tell agent to retry step-0
      const cp1retry = await gen.next(RETRY);
      expect((cp1retry.value as any)?.checkpointId).toBe('step-0');
      expect((cp1retry.value as any)?.stepIndex).toBe(0);

      // Now approve step-0
      const cp2 = await gen.next(APPROVE);
      expect((cp2.value as any)?.checkpointId).toBe('step-1');

      // Finish
      await gen.next(APPROVE);
    });

    it('does not duplicate findings on retry', async () => {
      const agent = new SupervisedAgent(AGENT_DEF);
      const gen = agent.run(PROJECT_ROOT, 'self');

      await gen.next(APPROVE); // start
      await gen.next(RETRY);   // retry step-0
      await gen.next(APPROVE); // approve step-0
      const done = await gen.next(APPROVE); // step-1 + done

      const findings: string[] = (done.value as any)?.findings ?? [];
      const packageFindings = findings.filter((f) => f.includes('package.json'));
      expect(packageFindings.length).toBe(1); // not doubled
    });
  });

  // ─── HANDOFF verdict ───────────────────────────────────────────────────────

  describe('HANDOFF verdict', () => {
    it('terminates the generator and returns null', async () => {
      const agent = new SupervisedAgent(AGENT_DEF);
      const gen = agent.run(PROJECT_ROOT, 'self');

      await gen.next(APPROVE); // kick
      const done = await gen.next(HANDOFF); // handoff on step-0

      expect(done.done).toBe(true);
      expect(done.value).toBeNull();
    });
  });

  // ─── ESCALATE verdict ──────────────────────────────────────────────────────

  describe('ESCALATE verdict', () => {
    it('throws EscalationError', async () => {
      const agent = new SupervisedAgent(AGENT_DEF);
      const gen = agent.run(PROJECT_ROOT, 'self');

      await gen.next(APPROVE); // kick

      await expect(gen.next(ESCALATE)).rejects.toBeInstanceOf(EscalationError);
    });

    it('EscalationError carries the verdict', async () => {
      const agent = new SupervisedAgent(AGENT_DEF);
      const gen = agent.run(PROJECT_ROOT, 'self');

      await gen.next(APPROVE);

      try {
        await gen.next(ESCALATE);
        fail('Expected EscalationError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(EscalationError);
        expect((err as EscalationError).verdict.reason).toBe('Too many errors');
      }
    });
  });

  // ─── publishContract integration ─────────────────────────────────────────

  describe('publishContract callback', () => {
    it('attaches the contract snapshot to each checkpoint payload', async () => {
      const agent = new SupervisedAgent(AGENT_DEF);
      const contractSnapshot = {
        laneId: 'test',
        version: 1,
        timestamp: new Date().toISOString(),
        exports: {},
        pending: [],
      };
      const publish = jest.fn(() => contractSnapshot);

      const gen = agent.run(PROJECT_ROOT, 'self', publish);
      const cp = await gen.next(APPROVE);

      expect(publish).toHaveBeenCalled();
      expect((cp.value as any)?.contracts).toEqual(contractSnapshot);
    });
  });
});
