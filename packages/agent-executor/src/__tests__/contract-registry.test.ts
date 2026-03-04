import { ContractRegistry } from '../lib/contract-registry';
import { ContractSnapshot } from '../lib/dag-types';

// ─── helpers ───────────────────────────────────────────────────────────────────

const snap = (laneId: string): Omit<ContractSnapshot, 'version' | 'timestamp'> => ({
  laneId,
  exports: { errorTypes: [{ code: 'NOT_FOUND', message: 'not found' }] },
  pending: [],
});

// ─── publish / read ────────────────────────────────────────────────────────────

describe('ContractRegistry', () => {
  let registry: ContractRegistry;

  beforeEach(() => {
    registry = new ContractRegistry();
  });

  describe('publish', () => {
    it('stamps version=1 and a timestamp on first publish', () => {
      const result = registry.publish('sql', snap('sql'));

      expect(result.version).toBe(1);
      expect(typeof result.timestamp).toBe('string');
      expect(result.laneId).toBe('sql');
    });

    it('increments version on every publish', () => {
      registry.publish('sql', snap('sql'));
      registry.publish('sql', snap('sql'));
      const third = registry.publish('sql', snap('sql'));

      expect(third.version).toBe(3);
    });

    it('overwrites the snapshot with latest content', () => {
      registry.publish('sql', { ...snap('sql'), exports: {} });
      registry.publish('sql', {
        ...snap('sql'),
        exports: { errorTypes: [{ code: 'TIMEOUT', message: 'timeout' }] },
      });

      const got = registry.getSnapshot('sql');
      expect(got?.exports.errorTypes?.[0].code).toBe('TIMEOUT');
    });
  });

  describe('getSnapshot', () => {
    it('returns undefined for unknown lane', () => {
      expect(registry.getSnapshot('unknown')).toBeUndefined();
    });

    it('returns current snapshot after publish', () => {
      registry.publish('react', snap('react'));
      const got = registry.getSnapshot('react');

      expect(got).toBeDefined();
      expect(got!.laneId).toBe('react');
    });
  });

  describe('getVersion', () => {
    it('returns 0 for lane that never published', () => {
      expect(registry.getVersion('ghost')).toBe(0);
    });

    it('returns correct version after publishes', () => {
      registry.publish('backend', snap('backend'));
      registry.publish('backend', snap('backend'));

      expect(registry.getVersion('backend')).toBe(2);
    });
  });

  describe('has / publishedLanes / getAll', () => {
    it('has() returns false before publish, true after', () => {
      expect(registry.has('sql')).toBe(false);
      registry.publish('sql', snap('sql'));
      expect(registry.has('sql')).toBe(true);
    });

    it('publishedLanes() reflects all lanes that published', () => {
      registry.publish('sql', snap('sql'));
      registry.publish('react', snap('react'));

      const lanes = registry.publishedLanes();
      expect(lanes).toHaveLength(2);
      expect(lanes).toContain('sql');
      expect(lanes).toContain('react');
    });

    it('getAll() returns a defensive copy', () => {
      registry.publish('sql', snap('sql'));
      const all = registry.getAll();

      all.delete('sql');
      expect(registry.has('sql')).toBe(true); // original unaffected
    });
  });

  // ─── waitForVersion ─────────────────────────────────────────────────────────

  describe('waitForVersion', () => {
    it('resolves immediately when snapshot already at minVersion', async () => {
      registry.publish('sql', snap('sql'));
      const result = await registry.waitForVersion('sql', 1, 1000);

      expect(result).not.toBeNull();
      expect(result!.version).toBe(1);
    });

    it('resolves when snapshot published after a short delay', async () => {
      setTimeout(() => registry.publish('sql', snap('sql')), 80);

      const result = await registry.waitForVersion('sql', 1, 500);

      expect(result).not.toBeNull();
      expect(result!.version).toBe(1);
    });

    it('returns null when timeout elapses before publish', async () => {
      const result = await registry.waitForVersion('sql', 1, 100);

      expect(result).toBeNull();
    });

    it('waits for a higher version if already at a lower one', async () => {
      registry.publish('sql', snap('sql')); // version 1

      setTimeout(() => registry.publish('sql', snap('sql')), 80); // version 2

      const result = await registry.waitForVersion('sql', 2, 500);

      expect(result!.version).toBe(2);
    });
  });
});
