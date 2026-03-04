import { BarrierCoordinator } from '../lib/barrier-coordinator';
import { ContractRegistry } from '../lib/contract-registry';
import { CheckpointPayload, ContractSnapshot } from '../lib/dag-types';

// ─── helpers ───────────────────────────────────────────────────────────────────

const makePayload = (
  mode: CheckpointPayload['mode'],
  waitFor: string[] = [],
  timeoutMs?: number,
): CheckpointPayload => ({
  checkpointId: 'test-cp',
  mode,
  stepIndex: 0,
  partialResult: {},
  waitFor,
  timeoutMs,
});

const publishSnap = (registry: ContractRegistry, laneId: string): ContractSnapshot =>
  registry.publish(laneId, { laneId, exports: {}, pending: [] });

// ─── tests ────────────────────────────────────────────────────────────────────

describe('BarrierCoordinator', () => {
  let registry: ContractRegistry;
  let coordinator: BarrierCoordinator;

  beforeEach(() => {
    registry = new ContractRegistry();
    coordinator = new BarrierCoordinator(registry);
  });

  // ─── self ─────────────────────────────────────────────────────────────────

  describe('mode: self', () => {
    it('resolves immediately with empty snapshots', async () => {
      const res = await coordinator.resolve(makePayload('self'));

      expect(res.resolved).toBe(true);
      expect(res.snapshots.size).toBe(0);
      expect(res.timedOut).toHaveLength(0);
    });
  });

  // ─── read-contract ────────────────────────────────────────────────────────

  describe('mode: read-contract', () => {
    it('returns current snapshots synchronously — no waiting', async () => {
      publishSnap(registry, 'sql');

      const res = await coordinator.resolve(makePayload('read-contract', ['sql']));

      expect(res.resolved).toBe(true);
      expect(res.snapshots.get('sql')).not.toBeNull();
      expect(res.timedOut).toHaveLength(0);
    });

    it('resolved=false when lane has not published yet', async () => {
      const res = await coordinator.resolve(makePayload('read-contract', ['sql']));

      expect(res.resolved).toBe(false);
      expect(res.snapshots.get('sql')).toBeNull();
    });

    it('partial — some lanes published, some not', async () => {
      publishSnap(registry, 'sql');

      const res = await coordinator.resolve(makePayload('read-contract', ['sql', 'react']));

      expect(res.resolved).toBe(false);
      expect(res.snapshots.get('sql')).not.toBeNull();
      expect(res.snapshots.get('react')).toBeNull();
    });
  });

  // ─── soft-align ───────────────────────────────────────────────────────────

  describe('mode: soft-align', () => {
    it('resolves when lane publishes before timeout', async () => {
      setTimeout(() => publishSnap(registry, 'sql'), 80);

      const res = await coordinator.resolve(makePayload('soft-align', ['sql'], 500));

      expect(res.resolved).toBe(true);
      expect(res.timedOut).toHaveLength(0);
      expect(res.snapshots.get('sql')).not.toBeNull();
    });

    it('returns timedOut entry when lane does not publish in time', async () => {
      const res = await coordinator.resolve(makePayload('soft-align', ['sql'], 100));

      expect(res.resolved).toBe(false);
      expect(res.timedOut).toContain('sql');
      expect(res.snapshots.get('sql')).toBeNull();
    });

    it('resolves partially — fast lane and slow lane', async () => {
      publishSnap(registry, 'sql'); // already published
      // react will not publish in time

      const res = await coordinator.resolve(makePayload('soft-align', ['sql', 'react'], 100));

      expect(res.resolved).toBe(false);
      expect(res.timedOut).toContain('react');
      expect(res.snapshots.get('sql')).not.toBeNull();
    });
  });

  // ─── hard-barrier ─────────────────────────────────────────────────────────

  describe('mode: hard-barrier', () => {
    it('resolved=true when all lanes publish before timeout', async () => {
      setTimeout(() => publishSnap(registry, 'sql'), 50);
      setTimeout(() => publishSnap(registry, 'react'), 60);

      const res = await coordinator.resolve(makePayload('hard-barrier', ['sql', 'react'], 500));

      expect(res.resolved).toBe(true);
      expect(res.timedOut).toHaveLength(0);
    });

    it('resolved=false when any participant times out', async () => {
      publishSnap(registry, 'sql');
      // react: never publishes

      const res = await coordinator.resolve(makePayload('hard-barrier', ['sql', 'react'], 100));

      expect(res.resolved).toBe(false);
      expect(res.timedOut).toContain('react');
    });

    it('uses DEFAULT_TIMEOUT_MS when timeoutMs not specified', async () => {
      expect(BarrierCoordinator.DEFAULT_TIMEOUT_MS).toBe(5_000);
    });
  });

  // ─── resolveGlobalBarrier ─────────────────────────────────────────────────

  describe('resolveGlobalBarrier', () => {
    it('resolves when all participants publish', async () => {
      setTimeout(() => publishSnap(registry, 'backend'), 60);
      setTimeout(() => publishSnap(registry, 'frontend'), 80);

      const res = await coordinator.resolveGlobalBarrier(['backend', 'frontend'], 500);

      expect(res.resolved).toBe(true);
    });

    it('marks timed-out participants', async () => {
      publishSnap(registry, 'backend');

      const res = await coordinator.resolveGlobalBarrier(['backend', 'frontend'], 100);

      expect(res.resolved).toBe(false);
      expect(res.timedOut).toContain('frontend');
    });
  });
});
