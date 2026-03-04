import {
    BarrierResolution,
    SupervisorCheckpointRule,
    SupervisorConfig,
} from '../lib/dag-types';
import { IntraSupervisor } from '../lib/intra-supervisor';

// ─── helpers ───────────────────────────────────────────────────────────────────

const emptyBarrier = (): BarrierResolution => ({
  resolved: true,
  snapshots: new Map(),
  timedOut: [],
});

const timedOutBarrier = (...laneIds: string[]): BarrierResolution => ({
  resolved: false,
  snapshots: new Map(laneIds.map((id) => [id, null])),
  timedOut: [...laneIds],
});

const makeConfig = (rules: SupervisorCheckpointRule[], retryBudget = 3): SupervisorConfig => ({
  laneId: 'test',
  retryBudget,
  checkpoints: rules,
});

const rule = (
  checkpointId: string,
  overrides: Partial<SupervisorCheckpointRule> = {},
): SupervisorCheckpointRule => ({
  checkpointId,
  mode: 'self',
  ...overrides,
});

// ─── tests ────────────────────────────────────────────────────────────────────

describe('IntraSupervisor', () => {
  // ─── no-op / no rule ────────────────────────────────────────────────────────

  describe('noOp', () => {
    it('always returns APPROVE regardless of findings', () => {
      const sup = IntraSupervisor.noOp('sql');
      const verdict = sup.evaluate('any-cp', { findings: ['❌ bad'] }, emptyBarrier());

      expect(verdict.type).toBe('APPROVE');
    });

    it('has retryBudget=0 so isExhausted is always true — but evaluate still APPROVEs', () => {
      const sup = IntraSupervisor.noOp('sql');
      // noOp has budget=0 → technically exhausted immediately, but evaluate always approves
      // because there are no checkpoint rules to fail.
      expect(sup.retryBudget).toBe(0);
      expect(sup.isExhausted('cp')).toBe(true);
      const verdict = sup.evaluate('any-cp', { findings: [] }, emptyBarrier());
      expect(verdict.type).toBe('APPROVE');
    });
  });

  describe('no matching checkpoint rule', () => {
    it('approves unknown checkpointId', () => {
      const sup = new IntraSupervisor(makeConfig([rule('known')]));
      const verdict = sup.evaluate('unknown', { findings: ['❌ bad'] }, emptyBarrier());

      expect(verdict.type).toBe('APPROVE');
    });
  });

  // ─── expect.minFindings ─────────────────────────────────────────────────────

  describe('expect.minFindings', () => {
    it('RETRY when findings < minFindings', () => {
      const sup = new IntraSupervisor(
        makeConfig([rule('cp', { expect: { minFindings: 2 } })]),
      );
      const verdict = sup.evaluate('cp', { findings: ['✅ one'] }, emptyBarrier());

      expect(verdict.type).toBe('RETRY');
    });

    it('APPROVE when findings >= minFindings', () => {
      const sup = new IntraSupervisor(
        makeConfig([rule('cp', { expect: { minFindings: 2 } })]),
      );
      const verdict = sup.evaluate(
        'cp',
        { findings: ['✅ one', '✅ two'] },
        emptyBarrier(),
      );

      expect(verdict.type).toBe('APPROVE');
    });
  });

  // ─── expect.noErrorFindings ─────────────────────────────────────────────────

  describe('expect.noErrorFindings', () => {
    it('RETRY when a finding starts with ❌', () => {
      const sup = new IntraSupervisor(
        makeConfig([rule('cp', { expect: { noErrorFindings: true } })]),
      );
      const verdict = sup.evaluate('cp', { findings: ['❌ broken'] }, emptyBarrier());

      expect(verdict.type).toBe('RETRY');
    });

    it('APPROVE when no finding starts with ❌', () => {
      const sup = new IntraSupervisor(
        makeConfig([rule('cp', { expect: { noErrorFindings: true } })]),
      );
      const verdict = sup.evaluate('cp', { findings: ['✅ ok', 'ℹ️ info'] }, emptyBarrier());

      expect(verdict.type).toBe('APPROVE');
    });
  });

  // ─── expect.requiredKeys ────────────────────────────────────────────────────

  describe('expect.requiredKeys', () => {
    it('RETRY when a required detail key is missing', () => {
      const sup = new IntraSupervisor(
        makeConfig([rule('cp', { expect: { requiredKeys: ['componentTree'] } })]),
      );
      const verdict = sup.evaluate('cp', { details: { other: 1 } }, emptyBarrier());

      expect(verdict.type).toBe('RETRY');
    });

    it('APPROVE when all required keys present', () => {
      const sup = new IntraSupervisor(
        makeConfig([rule('cp', { expect: { requiredKeys: ['componentTree'] } })]),
      );
      const verdict = sup.evaluate(
        'cp',
        { details: { componentTree: ['Button'] } },
        emptyBarrier(),
      );

      expect(verdict.type).toBe('APPROVE');
    });
  });

  // ─── expect.maxErrorSeverity ────────────────────────────────────────────────

  describe('expect.maxErrorSeverity', () => {
    it('RETRY when finding has error marker above max (warning)', () => {
      const sup = new IntraSupervisor(
        makeConfig([rule('cp', { expect: { maxErrorSeverity: 'warning' } })]),
      );
      const verdict = sup.evaluate('cp', { findings: ['❌ critical issue'] }, emptyBarrier());

      expect(verdict.type).toBe('RETRY');
    });

    it('APPROVE when finding is below max severity', () => {
      const sup = new IntraSupervisor(
        makeConfig([
          rule('cp', { expect: { maxErrorSeverity: 'error' } }),
        ]),
      );
      const verdict = sup.evaluate('cp', { findings: ['⚠️ warning only'] }, emptyBarrier());

      expect(verdict.type).toBe('APPROVE');
    });
  });

  // ─── hard-barrier timeout handling ──────────────────────────────────────────

  describe('hard-barrier timeout', () => {
    it('ESCALATE by default when timedOut is non-empty', () => {
      const sup = new IntraSupervisor(
        makeConfig([rule('cp', { mode: 'hard-barrier' })]),
      );
      const verdict = sup.evaluate('cp', {}, timedOutBarrier('sql'));

      expect(verdict.type).toBe('ESCALATE');
      expect(verdict.reason).toMatch(/sql/);
    });

    it('APPROVE with fallback=proceed-with-snapshot', () => {
      const sup = new IntraSupervisor(
        makeConfig([
          rule('cp', { mode: 'hard-barrier', fallback: 'proceed-with-snapshot' }),
        ]),
      );
      const verdict = sup.evaluate('cp', {}, timedOutBarrier('sql'));

      expect(verdict.type).toBe('APPROVE');
    });
  });

  // ─── soft-align timeout handling ────────────────────────────────────────────

  describe('soft-align timeout', () => {
    it('APPROVE by default when timedOut (proceed-with-snapshot)', () => {
      const sup = new IntraSupervisor(
        makeConfig([rule('cp', { mode: 'soft-align' })]),
      );
      const verdict = sup.evaluate('cp', {}, timedOutBarrier('react'));

      expect(verdict.type).toBe('APPROVE');
    });

    it('ESCALATE with fallback=escalate', () => {
      const sup = new IntraSupervisor(
        makeConfig([rule('cp', { mode: 'soft-align', fallback: 'escalate' })]),
      );
      const verdict = sup.evaluate('cp', {}, timedOutBarrier('react'));

      expect(verdict.type).toBe('ESCALATE');
    });
  });

  // ─── onFail variants ────────────────────────────────────────────────────────

  describe('onFail variants', () => {
    it('onFail=ESCALATE escalates immediately without retry', () => {
      const sup = new IntraSupervisor(
        makeConfig([
          rule('cp', {
            expect: { noErrorFindings: true },
            onFail: 'ESCALATE',
          }),
        ]),
      );
      const verdict = sup.evaluate('cp', { findings: ['❌ bad'] }, emptyBarrier());

      expect(verdict.type).toBe('ESCALATE');
    });

    it('onFail=HANDOFF routes to handoffTo lane', () => {
      const sup = new IntraSupervisor(
        makeConfig([
          rule('cp', {
            expect: { noErrorFindings: true },
            onFail: 'HANDOFF',
            handoffTo: 'db-specialist',
          }),
        ]),
      );
      const verdict = sup.evaluate('cp', { findings: ['❌ bad'] }, emptyBarrier());

      expect(verdict.type).toBe('HANDOFF');
      expect(verdict.targetLaneId).toBe('db-specialist');
    });

    it('onFail=APPROVE approves despite expect failure', () => {
      const sup = new IntraSupervisor(
        makeConfig([
          rule('cp', {
            expect: { noErrorFindings: true },
            onFail: 'APPROVE',
          }),
        ]),
      );
      const verdict = sup.evaluate('cp', { findings: ['❌ bad'] }, emptyBarrier());

      expect(verdict.type).toBe('APPROVE');
    });
  });

  // ─── retry budget ────────────────────────────────────────────────────────────

  describe('retry budget', () => {
    it('returns RETRY while under budget', () => {
      const sup = new IntraSupervisor(
        makeConfig(
          [rule('cp', { expect: { noErrorFindings: true } })],
          3,
        ),
      );

      expect(sup.isExhausted('cp')).toBe(false);
      sup.incrementRetry('cp');
      sup.incrementRetry('cp');
      expect(sup.isExhausted('cp')).toBe(false);
    });

    it('auto-ESCALATE when budget exhausted', () => {
      const sup = new IntraSupervisor(
        makeConfig(
          [rule('cp', { expect: { noErrorFindings: true } })],
          2,
        ),
      );

      // Exhaust budget manually
      sup.incrementRetry('cp');
      sup.incrementRetry('cp');
      expect(sup.isExhausted('cp')).toBe(true);

      const verdict = sup.evaluate('cp', { findings: ['❌ bad'] }, emptyBarrier());
      expect(verdict.type).toBe('ESCALATE');
      expect(verdict.reason).toMatch(/budget exhausted/i);
    });

    it('retryCount tracks per-checkpoint increments', () => {
      const sup = new IntraSupervisor(makeConfig([]));

      expect(sup.retryCount('cp')).toBe(0);
      sup.incrementRetry('cp');
      expect(sup.retryCount('cp')).toBe(1);
      sup.incrementRetry('cp');
      expect(sup.retryCount('cp')).toBe(2);
    });

    it('budgets are independent per checkpointId', () => {
      const sup = new IntraSupervisor(makeConfig([], 1));

      sup.incrementRetry('cp-a');
      expect(sup.isExhausted('cp-a')).toBe(true);
      expect(sup.isExhausted('cp-b')).toBe(false);
    });
  });

  // ─── retryInstructions ───────────────────────────────────────────────────────

  describe('retryInstructions', () => {
    it('includes custom retryInstructions in RETRY verdict', () => {
      const sup = new IntraSupervisor(
        makeConfig([
          rule('cp', {
            expect: { noErrorFindings: true },
            retryInstructions: 'Fix the route handler',
          }),
        ]),
      );

      const verdict = sup.evaluate('cp', { findings: ['❌ missing handler'] }, emptyBarrier());

      expect(verdict.type).toBe('RETRY');
      expect(verdict.instructions).toBe('Fix the route handler');
    });
  });
});
