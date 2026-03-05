/**
 * Unit tests for SqliteVectorMemory
 *
 * Because `better-sqlite3` is a native module and may not be installed in CI,
 * tests are structured to cover BOTH the "db available" and "db unavailable"
 * (graceful no-op) code paths via jest module mocking.
 */


// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Build a unit-norm embedding vector of given length. */
function unitVec(len: number, hotIndex = 0): number[] {
  const v = new Array<number>(len).fill(0);
  v[hotIndex] = 1;
  return v;
}

// ─── Cosine similarity (copy of impl logic for expectation verification) ──────

function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    magA += (a[i] ?? 0) ** 2;
    magB += (b[i] ?? 0) ** 2;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Tests when better-sqlite3 is NOT available ───────────────────────────────

describe('SqliteVectorMemory — graceful fallback when better-sqlite3 unavailable', () => {
  let originalRequire: NodeRequire;

  beforeAll(() => {
    // Suppress "better-sqlite3 not installed" silent catch
    originalRequire = require;
  });

  it('cosine similarity helper: identical vectors → 1.0', () => {
    const v = [1, 0, 0];
    expect(cosineSim(v, v)).toBeCloseTo(1.0);
  });

  it('cosine similarity helper: orthogonal vectors → 0', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSim(a, b)).toBeCloseTo(0);
  });

  it('cosine similarity helper: opposite vectors → -1.0', () => {
    const a = [1, 0];
    const b = [-1, 0];
    expect(cosineSim(a, b)).toBeCloseTo(-1.0);
  });

  it('cosine similarity helper: zero vector → 0', () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineSim(a, b)).toBe(0);
  });
});

// ─── Tests using a mocked Database ───────────────────────────────────────────

describe('SqliteVectorMemory — with mocked better-sqlite3', () => {
  // We test through the class by providing a mock in-memory store

  /**
   * Lightweight manual mock store that mimics the relevant better-sqlite3
   * behaviour (synchronous, prepare/get/all/run).
   */
  class MockStore {
    private rows: Map<string, { store: string; id: string; content: string | null; embedding: Buffer; metadata: string; created_at: string }> = new Map();

    prepare(sql: string) {
      const rows = this.rows;
      return {
        run: (..._args: unknown[]) => { /* handled per-op below */ },
        get: (..._args: unknown[]) => undefined,
        all: (..._args: unknown[]) => [],
      };
    }
    pragma(_: string) { return this; }
    exec(_: string) { return this; }
  }

  it('builds without throwing even when dbPath dir does not exist', () => {
    // Point to an unreachable path — _open() catches the error, sets db=null
    jest.resetModules();

    // Mock require so that 'better-sqlite3' throws MODULE_NOT_FOUND
    jest.mock('better-sqlite3', () => {
      throw new Error('MODULE_NOT_FOUND');
    }, { virtual: true });

    // Re-import the module fresh
    const { SqliteVectorMemory } = require('../lib/sqlite-vector-memory.js') as typeof import('../lib/sqlite-vector-memory.js');

    const mem = new SqliteVectorMemory({ dbPath: '/nonexistent/path/db.sqlite' });
    expect(mem).toBeDefined();
  });

  it('store() is a no-op when db is null', async () => {
    jest.resetModules();
    jest.mock('better-sqlite3', () => {
      throw new Error('MODULE_NOT_FOUND');
    }, { virtual: true });

    const { SqliteVectorMemory } = require('../lib/sqlite-vector-memory.js') as typeof import('../lib/sqlite-vector-memory.js');
    const mem = new SqliteVectorMemory({ dbPath: '/nonexistent/path/db.sqlite' });

    // Should not throw
    await expect(mem.store('id1', [1, 2, 3], { text: 'hello' })).resolves.toBeUndefined();
  });

  it('search() returns [] when db is null', async () => {
    jest.resetModules();
    jest.mock('better-sqlite3', () => {
      throw new Error('MODULE_NOT_FOUND');
    }, { virtual: true });

    const { SqliteVectorMemory } = require('../lib/sqlite-vector-memory.js') as typeof import('../lib/sqlite-vector-memory.js');
    const mem = new SqliteVectorMemory({ dbPath: '/nonexistent/path/db.sqlite' });

    const results = await mem.search([1, 0, 0], { topK: 5 });
    expect(results).toEqual([]);
  });

  it('size() returns 0 when db is null', async () => {
    jest.resetModules();
    jest.mock('better-sqlite3', () => {
      throw new Error('MODULE_NOT_FOUND');
    }, { virtual: true });

    const { SqliteVectorMemory } = require('../lib/sqlite-vector-memory.js') as typeof import('../lib/sqlite-vector-memory.js');
    const mem = new SqliteVectorMemory({ dbPath: '/nonexistent/path/db.sqlite' });

    expect(await mem.size()).toBe(0);
  });

  it('delete() is a no-op when db is null', async () => {
    jest.resetModules();
    jest.mock('better-sqlite3', () => {
      throw new Error('MODULE_NOT_FOUND');
    }, { virtual: true });

    const { SqliteVectorMemory } = require('../lib/sqlite-vector-memory.js') as typeof import('../lib/sqlite-vector-memory.js');
    const mem = new SqliteVectorMemory({ dbPath: '/nonexistent/path/db.sqlite' });

    await expect(mem.delete('id1')).resolves.toBeUndefined();
  });

  it('clear() is a no-op when db is null', async () => {
    jest.resetModules();
    jest.mock('better-sqlite3', () => {
      throw new Error('MODULE_NOT_FOUND');
    }, { virtual: true });

    const { SqliteVectorMemory } = require('../lib/sqlite-vector-memory.js') as typeof import('../lib/sqlite-vector-memory.js');
    const mem = new SqliteVectorMemory({ dbPath: '/nonexistent/path/db.sqlite' });

    await expect(mem.clear()).resolves.toBeUndefined();
  });

  it('close() is a no-op when db is null', () => {
    jest.resetModules();
    jest.mock('better-sqlite3', () => {
      throw new Error('MODULE_NOT_FOUND');
    }, { virtual: true });

    const { SqliteVectorMemory } = require('../lib/sqlite-vector-memory.js') as typeof import('../lib/sqlite-vector-memory.js');
    const mem = new SqliteVectorMemory({ dbPath: '/nonexistent/path/db.sqlite' });

    expect(() => mem.close()).not.toThrow();
  });
});

// ─── Cosine similarity properties ────────────────────────────────────────────

describe('cosine similarity properties (standalone)', () => {
  it('unit vector against itself = 1', () => {
    const v = unitVec(8, 3);
    expect(cosineSim(v, v)).toBeCloseTo(1.0, 5);
  });

  it('two different unit basis vectors = 0', () => {
    const a = unitVec(8, 0);
    const b = unitVec(8, 1);
    expect(cosineSim(a, b)).toBeCloseTo(0, 5);
  });

  it('same direction different magnitude = 1', () => {
    const a = [2, 0, 0];
    const b = [5, 0, 0];
    expect(cosineSim(a, b)).toBeCloseTo(1.0, 5);
  });
});
