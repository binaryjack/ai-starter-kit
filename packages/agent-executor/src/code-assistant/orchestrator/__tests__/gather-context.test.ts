/**
 * Unit tests: _gatherContext
 *
 * Verifies the two-stage context-building strategy:
 *   1. FTS5 keyword extraction and query construction
 *   2. File snippet loading with MAX_FILES / MAX_FILE_LINES caps
 *
 * fs/promises is mocked so the suite runs without real disk I/O.
 * The store is replaced with a jest mock that returns controlled symbol sets.
 */

import * as nodePath from 'node:path';
import type { CodebaseIndexStoreInstance } from '../../storage/codebase-index-store.types.js';
import { createCodeAssistantOrchestrator } from '../code-assistant-orchestrator.js';
import '../index.js'; // side-effect: attaches prototype methods

// ─── fs mock ─────────────────────────────────────────────────────────────────

jest.mock('fs/promises', () => ({
  readFile:  jest.fn(),
  mkdir:     jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  access:    jest.fn().mockResolvedValue(undefined),
  unlink:    jest.fn().mockResolvedValue(undefined),
}));

import * as fsMod from 'fs/promises';
const mockReadFile = fsMod.readFile as jest.Mock;

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeStore(rows: object[] = []): CodebaseIndexStoreInstance {
  return {
    query: jest.fn().mockResolvedValue(rows),
    close: jest.fn().mockResolvedValue(undefined),
  } as unknown as CodebaseIndexStoreInstance;
}

function makeOrchestrator(projectRoot = '/project') {
  return createCodeAssistantOrchestrator({ projectRoot });
}

// ─── keyword extraction ───────────────────────────────────────────────────────

describe('_gatherContext — keyword extraction', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses only words ≥4 chars for the FTS query', async () => {
    const orch  = makeOrchestrator();
    const store = makeStore();

    await orch._gatherContext(store, 'add a sort feature');

    // "add", "a" < 4 chars → excluded; "sort", "feature" ≥ 4 → included
    const [, params] = (store.query as jest.Mock).mock.calls[0];
    expect(params[0]).toContain('sort');
    expect(params[0]).toContain('feature');
    expect(params[0]).not.toContain(' a ');
  });

  it('deduplicates repeated words', async () => {
    const orch  = makeOrchestrator();
    const store = makeStore();
    await orch._gatherContext(store, 'refactor refactor refactor');

    const [, params] = (store.query as jest.Mock).mock.calls[0];
    const parts = (params[0] as string).split(' OR ');
    const unique = new Set(parts);
    expect(unique.size).toBe(parts.length);
  });

  it('caps keyword extraction at 6 words', async () => {
    const orch  = makeOrchestrator();
    const store = makeStore();
    // 10 distinct words ≥4 chars — only first 6 should appear in query
    await orch._gatherContext(store, 'aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj');

    const [, params] = (store.query as jest.Mock).mock.calls[0];
    const parts = (params[0] as string).split(' OR ');
    expect(parts).toHaveLength(6);
  });

  it('sends no FTS query when task has no words ≥4 chars', async () => {
    const orch  = makeOrchestrator();
    const store = makeStore();
    // All words are ≤ 3 chars
    await orch._gatherContext(store, 'do it now');

    // No FTS call — store.query should not have been called
    expect((store.query as jest.Mock).mock.calls).toHaveLength(0);
  });

  it('returns empty string when task has no words ≥4 chars', async () => {
    const orch  = makeOrchestrator();
    const store = makeStore();
    const result = await orch._gatherContext(store, 'do it now');
    expect(result).toBe('');
  });

  it('joins keywords with OR', async () => {
    const orch  = makeOrchestrator();
    const store = makeStore();
    await orch._gatherContext(store, 'parse tokens');

    const [, params] = (store.query as jest.Mock).mock.calls[0];
    expect(params[0]).toBe('parse OR tokens');
  });
});

// ─── symbol section output ────────────────────────────────────────────────────

describe('_gatherContext — symbol output formatting', () => {
  const rows = [
    { name: 'calculateTotal', kind: 'function', signature: '(a: number, b: number): number', file_path: 'src/calc.ts', line_start: 5 },
    { name: 'UserService',    kind: 'class',    signature: null,                              file_path: 'src/user.ts', line_start: 1 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFile.mockResolvedValue('export const x = 1;\n');
  });

  it('includes ### Relevant symbols header when symbols found', async () => {
    const orch  = makeOrchestrator();
    const store = makeStore(rows);
    const ctx   = await orch._gatherContext(store, 'calculate total users');
    expect(ctx).toContain('### Relevant symbols');
  });

  it('lists each symbol with its kind, name, file, and line', async () => {
    const orch  = makeOrchestrator();
    const store = makeStore(rows);
    const ctx   = await orch._gatherContext(store, 'calculate total users');
    expect(ctx).toContain('`calculateTotal`');
    expect(ctx).toContain('src/calc.ts:5');
    expect(ctx).toContain('function');
  });

  it('includes signature when present', async () => {
    const orch  = makeOrchestrator();
    const store = makeStore(rows);
    const ctx   = await orch._gatherContext(store, 'calculate total users');
    expect(ctx).toContain('(a: number, b: number): number');
  });

  it('does not include a null signature value', async () => {
    const orch  = makeOrchestrator();
    const store = makeStore([rows[1]]); // UserService — no signature
    const ctx   = await orch._gatherContext(store, 'user service class');
    expect(ctx).not.toContain('null');
  });

  it('returns empty string when no symbols matched and no files', async () => {
    const orch  = makeOrchestrator();
    const store = makeStore([]); // empty result
    const ctx   = await orch._gatherContext(store, 'search something');
    expect(ctx).toBe('');
  });
});

// ─── file snippet injection ───────────────────────────────────────────────────

describe('_gatherContext — file snippet loading', () => {
  const singleSymbol = [
    { name: 'foo', kind: 'function', signature: null, file_path: 'src/foo.ts', line_start: 1 },
  ];

  beforeEach(() => jest.clearAllMocks());

  it('includes a FILE section for the symbol source file', async () => {
    mockReadFile.mockResolvedValue('export function foo() {}\n');
    const orch  = makeOrchestrator();
    const store = makeStore(singleSymbol);
    const ctx   = await orch._gatherContext(store, 'function foo');
    expect(ctx).toContain('### FILE: src/foo.ts');
    expect(ctx).toContain('export function foo() {}');
  });

  it('resolves relative file paths against projectRoot', async () => {
    mockReadFile.mockResolvedValue('const x = 1;\n');
    const projectRoot = nodePath.join('/', 'my', 'project');
    const orch  = makeOrchestrator(projectRoot);
    const store = makeStore(singleSymbol);
    await orch._gatherContext(store, 'function foo');

    const readFileCall = mockReadFile.mock.calls[0][0] as string;
    // Use platform-native separator expectations
    expect(readFileCall).toContain('my');
    expect(readFileCall).toContain('project');
    expect(readFileCall).toContain('foo.ts');
  });

  it('loads absolute paths directly without joining projectRoot', async () => {
    const absPath = nodePath.isAbsolute('/abs/path/foo.ts')
      ? '/abs/path/foo.ts'           // Unix
      : 'C:\\abs\\path\\foo.ts';     // Windows absolute path if needed

    // Use a POSIX absolute path that is valid even on Windows when passed directly
    const absSymbol = [{ ...singleSymbol[0], file_path: absPath }];
    mockReadFile.mockResolvedValue('const abs = true;\n');
    const orch  = makeOrchestrator('/project');
    const store = makeStore(absSymbol);
    await orch._gatherContext(store, 'absolute path foo');

    const readFileCall = mockReadFile.mock.calls[0][0] as string;
    // Absolute path must be used verbatim (not joined with projectRoot)
    expect(readFileCall).toBe(absPath);
  });

  it('deduplicates file paths — only reads each file once', async () => {
    const twoSymbols = [
      { name: 'foo', kind: 'function', signature: null, file_path: 'src/shared.ts', line_start: 1 },
      { name: 'bar', kind: 'function', signature: null, file_path: 'src/shared.ts', line_start: 10 },
    ];
    mockReadFile.mockResolvedValue('const code = 1;\n');
    const orch  = makeOrchestrator();
    const store = makeStore(twoSymbols);
    await orch._gatherContext(store, 'foo bar functions');

    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  it('caps files loaded at MAX_FILES (8)', async () => {
    // Return 12 symbols from 12 distinct files
    const manySymbols = Array.from({ length: 12 }, (_, i) => ({
      name: `fn${i}`, kind: 'function', signature: null,
      file_path: `src/file${i}.ts`, line_start: 1,
    }));
    mockReadFile.mockResolvedValue('export const x = 1;\n');
    const orch  = makeOrchestrator();
    const store = makeStore(manySymbols);
    await orch._gatherContext(store, 'function files caps');

    expect(mockReadFile.mock.calls.length).toBeLessThanOrEqual(8);
  });

  it('truncates files longer than MAX_FILE_LINES (200)', async () => {
    const longFile = Array.from({ length: 300 }, (_, i) => `const l${i} = ${i};`).join('\n');
    mockReadFile.mockResolvedValue(longFile);
    const orch  = makeOrchestrator();
    const store = makeStore(singleSymbol);
    const ctx   = await orch._gatherContext(store, 'function foo');

    expect(ctx).toContain('100 more lines omitted');
  });

  it('does NOT add truncation marker when file is exactly MAX_FILE_LINES', async () => {
    const exactFile = Array.from({ length: 200 }, (_, i) => `line${i}`).join('\n');
    mockReadFile.mockResolvedValue(exactFile);
    const orch  = makeOrchestrator();
    const store = makeStore(singleSymbol);
    const ctx   = await orch._gatherContext(store, 'function foo');

    expect(ctx).not.toContain('more lines omitted');
  });

  it('silently skips files that cannot be read', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT: no such file'));
    const orch  = makeOrchestrator();
    const store = makeStore(singleSymbol);
    const ctx   = await orch._gatherContext(store, 'function foo');

    expect(ctx).toContain('### Relevant symbols'); // symbols still present
    expect(ctx).not.toContain('### FILE:');         // file section absent
  });
});

// ─── FTS error resilience ─────────────────────────────────────────────────────

describe('_gatherContext — FTS error resilience', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns empty string when store.query throws (corrupt index)', async () => {
    const store = {
      query: jest.fn().mockRejectedValue(new Error('SQLite CORRUPT')),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as CodebaseIndexStoreInstance;

    const orch = makeOrchestrator();
    const ctx  = await orch._gatherContext(store, 'search something valid');
    expect(ctx).toBe('');
  });
});
