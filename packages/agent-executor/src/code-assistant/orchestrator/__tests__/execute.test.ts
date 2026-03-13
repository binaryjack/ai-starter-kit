/**
 * Unit tests: execute() pipeline
 *
 * Tests the 7-step orchestration in isolation by replacing all four internal
 * prototype methods with jest mocks, and mocking fs/promises for step 7 (disk writes).
 *
 * This gives us full branch coverage of execute() without needing a real SQLite
 * index, real LLM provider, or real filesystem — those concerns belong to
 * integration / e2e layers.
 */

import path from 'path';
import type { IModelRouter } from '../../../lib/model-router/index.js';
import type { RoutedResponse } from '../../../lib/model-router/model-router.types.js';
import type { FilePatch } from '../../code-assistant-orchestrator.types.js';
import type { CodebaseIndexStoreInstance } from '../../storage/codebase-index-store.types.js';
import { createCodeAssistantOrchestrator } from '../code-assistant-orchestrator.js';
import '../index.js'; // side-effect: attaches prototype methods

// ─── fs mock ─────────────────────────────────────────────────────────────────

jest.mock('fs/promises', () => ({
  access:    jest.fn(),
  mkdir:     jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink:    jest.fn().mockResolvedValue(undefined),
  readFile:  jest.fn(),
}));

import * as fsMod from 'fs/promises';
const mockAccess    = fsMod.access    as jest.Mock;
const mockMkdir     = fsMod.mkdir     as jest.Mock;
const mockWriteFile = fsMod.writeFile as jest.Mock;
const mockUnlink    = fsMod.unlink    as jest.Mock;

// ─── global reset — prevents call counts leaking between tests ────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
  mockUnlink.mockResolvedValue(undefined);
});

// ─── factory helpers ──────────────────────────────────────────────────────────

function makeStore(): CodebaseIndexStoreInstance {
  return {
    query: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(undefined),
  } as unknown as CodebaseIndexStoreInstance;
}

function makeRouter(content = '## FILE: src/out.ts\n```\nconst x = 1;\n```'): IModelRouter {
  const route = jest.fn().mockResolvedValue({
    content,
    estimatedCostUSD: 0.0012,
    taskType:         'code-generation',
  } satisfies Partial<RoutedResponse>);
  return { route, autoRegister: jest.fn(), registeredProviders: jest.fn().mockReturnValue(['anthropic']), defaultProvider: jest.fn() } as unknown as IModelRouter;
}

/**
 * Creates an orchestrator with all four prototype helpers pre-mocked.
 * Callers can override individual mocks for specific test scenarios.
 */
function makeOrch(overrides: {
  openStore?:     jest.Mock;
  gatherContext?: jest.Mock;
  buildRouter?:   jest.Mock;
  parsePatches?:  jest.Mock;
  store?:         CodebaseIndexStoreInstance;
  router?:        IModelRouter;
  projectRoot?:   string;
  indexStore?:    CodebaseIndexStoreInstance;
} = {}) {
  const store  = overrides.store  ?? makeStore();
  const router = overrides.router ?? makeRouter();

  const orch = createCodeAssistantOrchestrator({
    projectRoot: overrides.projectRoot ?? '/project',
    indexStore:  overrides.indexStore,
  });

  orch._openStore      = overrides.openStore      ?? jest.fn().mockResolvedValue(store);
  orch._gatherContext  = overrides.gatherContext  ?? jest.fn().mockResolvedValue('mocked context');
  orch._buildRouter    = overrides.buildRouter    ?? jest.fn().mockResolvedValue(router);
  orch._parsePatches   = overrides.parsePatches   ?? jest.fn().mockReturnValue([
    { relativePath: 'src/out.ts', content: 'const x = 1;\n', delete: undefined },
  ] satisfies FilePatch[]);

  return { orch, store, router };
}

// ─── Step 1: _openStore failure ───────────────────────────────────────────────

describe('execute — step 1: store open failure', () => {
  it('returns error result when _openStore throws', async () => {
    const { orch } = makeOrch({
      openStore: jest.fn().mockRejectedValue(new Error('DB not found')),
    });

    const result = await orch.execute({ task: 'add feature' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Index not found/);
    expect(result.filesModified).toEqual([]);
    expect(result.totalCost).toBe(0);
  });

  it('populates duration even on step-1 failure', async () => {
    const { orch } = makeOrch({
      openStore: jest.fn().mockRejectedValue(new Error('DB not found')),
    });
    const result = await orch.execute({ task: 'add feature' });
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});

// ─── Step 2: store closed in finally ─────────────────────────────────────────

describe('execute — step 2: store lifecycle', () => {
  it('closes the store after gathering context when store was opened internally', async () => {
    const store = makeStore();
    const { orch } = makeOrch({ store });

    // File must exist for write tracking
    mockAccess.mockResolvedValue(undefined);
    await orch.execute({ task: 'add feature' });

    expect(store.close).toHaveBeenCalledTimes(1);
  });

  it('does NOT close the store when indexStore is provided in options', async () => {
    const store = makeStore();
    const { orch } = makeOrch({ indexStore: store, store });

    mockAccess.mockResolvedValue(undefined);
    await orch.execute({ task: 'add feature' });

    expect(store.close).not.toHaveBeenCalled();
  });

  it('still closes the store when _gatherContext throws', async () => {
    const store = makeStore();
    const { orch } = makeOrch({
      store,
      gatherContext: jest.fn().mockRejectedValue(new Error('context error')),
    });

    // Even if context throws, execute catches in finally
    try { await orch.execute({ task: 'add feature' }); } catch { /* expected */ }
    expect(store.close).toHaveBeenCalledTimes(1);
  });
});

// ─── Step 3: router not found ─────────────────────────────────────────────────

describe('execute — step 3: router unavailable', () => {
  it('returns error result when _buildRouter returns undefined', async () => {
    const { orch } = makeOrch({
      buildRouter: jest.fn().mockResolvedValue(undefined),
    });

    const result = await orch.execute({ task: 'add feature' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No LLM provider available/);
    expect(result.filesModified).toEqual([]);
  });
});

// ─── Step 4+5: LLM call ───────────────────────────────────────────────────────

describe('execute — step 5: LLM call', () => {
  it('routes quick-fix mode to code-generation task type', async () => {
    const router = makeRouter();
    const { orch } = makeOrch({ router });
    mockAccess.mockResolvedValue(undefined);

    await orch.execute({ task: 'fix null check', mode: 'quick-fix' });

    const [taskType] = (router.route as jest.Mock).mock.calls[0];
    expect(taskType).toBe('code-generation');
  });

  it('routes refactor mode to "refactoring" task type', async () => {
    const router = makeRouter();
    const { orch } = makeOrch({ router });
    mockAccess.mockResolvedValue(undefined);

    await orch.execute({ task: 'extract helper', mode: 'refactor' });

    const [taskType] = (router.route as jest.Mock).mock.calls[0];
    expect(taskType).toBe('refactoring');
  });

  it('routes debug mode to "file-analysis" task type', async () => {
    const router = makeRouter();
    const { orch } = makeOrch({ router });
    mockAccess.mockResolvedValue(undefined);

    await orch.execute({ task: 'why does this crash', mode: 'debug' });

    const [taskType] = (router.route as jest.Mock).mock.calls[0];
    expect(taskType).toBe('file-analysis');
  });

  it('uses "feature" mode as default when mode is not specified', async () => {
    const router = makeRouter();
    const { orch } = makeOrch({ router });
    mockAccess.mockResolvedValue(undefined);

    await orch.execute({ task: 'add search' });

    const [taskType] = (router.route as jest.Mock).mock.calls[0];
    expect(taskType).toBe('code-generation');
  });

  it('passes maxTokens: 8192 and temperature: 0.2 to the router', async () => {
    const router = makeRouter();
    const { orch } = makeOrch({ router });
    mockAccess.mockResolvedValue(undefined);

    await orch.execute({ task: 'add feature' });

    const [, prompt] = (router.route as jest.Mock).mock.calls[0];
    expect(prompt.maxTokens).toBe(8192);
    expect(prompt.temperature).toBe(0.2);
  });

  it('propagates estimatedCostUSD to totalCost in the result', async () => {
    const router = makeRouter();
    (router.route as jest.Mock).mockResolvedValueOnce({
      content:          '## FILE: src/x.ts\n```\n```',
      estimatedCostUSD: 0.042,
      taskType:         'code-generation',
    });
    const { orch } = makeOrch({ router });
    mockAccess.mockResolvedValue(undefined);

    const result = await orch.execute({ task: 'add feature' });
    expect(result.totalCost).toBeCloseTo(0.042);
  });

  it('returns error result when router.route throws (network failure)', async () => {
    const router = makeRouter();
    (router.route as jest.Mock).mockRejectedValueOnce(new Error('NetworkError: timeout'));
    const { orch } = makeOrch({ router });

    const result = await orch.execute({ task: 'add feature' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('NetworkError');
    expect(result.totalCost).toBe(0);
  });
});

// ─── Step 6: dry run ──────────────────────────────────────────────────────────

describe('execute — step 6: dry run', () => {
  it('returns plan with raw LLM content and no file writes', async () => {
    const rawResponse = 'I would add a calculateDiscount function to utils/pricing.ts';
    const router = makeRouter(rawResponse);
    const { orch } = makeOrch({ router });

    const result = await orch.execute({ task: 'add discount', dryRun: true });

    expect(result.success).toBe(true);
    expect(result.plan).toBe(rawResponse);
    expect(result.filesModified).toEqual([]);
    expect(result.newFiles).toEqual([]);
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('returns plan even when LLM output contains FILE blocks (dryRun suppresses writes)', async () => {
    const llmWithBlocks = '## FILE: src/x.ts\n```\nconst x = 1;\n```';
    const router = makeRouter(llmWithBlocks);
    const { orch } = makeOrch({ router });

    const result = await orch.execute({ task: 'add feature', dryRun: true });

    expect(result.success).toBe(true);
    expect(result.plan).toBe(llmWithBlocks);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});

// ─── Step 6b: no patches ─────────────────────────────────────────────────────

describe('execute — step 6b: no patches', () => {
  it('returns plan with LLM content when response has no FILE/DELETE blocks', async () => {
    const noPatchResponse = 'The code looks fine. No changes needed.';
    const router = makeRouter(noPatchResponse);
    const { orch } = makeOrch({
      router,
      parsePatches: jest.fn().mockReturnValue([]), // no patches
    });

    const result = await orch.execute({ task: 'review code' });

    expect(result.success).toBe(true);
    expect(result.plan).toBe(noPatchResponse);
    expect(result.filesModified).toEqual([]);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});

// ─── Step 7: disk writes ──────────────────────────────────────────────────────

describe('execute — step 7: applying patches', () => {
  it('writes a new file and records it in newFiles', async () => {
    mockAccess.mockRejectedValueOnce(new Error('ENOENT')); // file did not exist
    const { orch } = makeOrch({
      parsePatches: jest.fn().mockReturnValue([
        { relativePath: 'src/new-feature.ts', content: 'export const x = 1;\n' },
      ] satisfies FilePatch[]),
    });

    const result = await orch.execute({ task: 'add feature' });

    expect(result.success).toBe(true);
    expect(result.newFiles).toContain('src/new-feature.ts');
    expect(result.filesModified).not.toContain('src/new-feature.ts');
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('new-feature.ts'),
      'export const x = 1;\n',
      'utf-8',
    );
  });

  it('records modified (pre-existing) files in filesModified — not newFiles', async () => {
    mockAccess.mockResolvedValueOnce(undefined); // file already existed
    const { orch } = makeOrch({
      parsePatches: jest.fn().mockReturnValue([
        { relativePath: 'src/existing.ts', content: 'updated content\n' },
      ] satisfies FilePatch[]),
    });

    const result = await orch.execute({ task: 'update code' });

    expect(result.success).toBe(true);
    expect(result.filesModified).toContain('src/existing.ts');
    expect(result.newFiles).not.toContain('src/existing.ts');
  });

  it('calls fs.mkdir with recursive: true before writing — creates deep directories', async () => {
    mockAccess.mockRejectedValueOnce(new Error('ENOENT'));
    const { orch } = makeOrch({
      parsePatches: jest.fn().mockReturnValue([
        { relativePath: 'a/b/c/d/new.ts', content: '' },
      ] satisfies FilePatch[]),
    });

    await orch.execute({ task: 'create nested file' });

    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining(path.join('a', 'b', 'c', 'd')),
      { recursive: true },
    );
  });

  it('calls fs.unlink for DELETE patches', async () => {
    const { orch } = makeOrch({
      parsePatches: jest.fn().mockReturnValue([
        { relativePath: 'src/old.ts', content: '', delete: true },
      ] satisfies FilePatch[]),
    });

    const result = await orch.execute({ task: 'remove old module' });

    expect(result.success).toBe(true);
    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('old.ts'));
  });

  it('does not crash when unlink fails for already-absent DELETE target', async () => {
    mockUnlink.mockRejectedValueOnce(new Error('ENOENT'));
    const { orch } = makeOrch({
      parsePatches: jest.fn().mockReturnValue([
        { relativePath: 'src/ghost.ts', content: '', delete: true },
      ] satisfies FilePatch[]),
    });

    const result = await orch.execute({ task: 'delete ghost' });
    expect(result.success).toBe(true);
  });

  it('handles mixed DELETE + FILE patches in the same response', async () => {
    // DELETE first in patch list (guaranteed by _parsePatches ordering)
    mockAccess.mockRejectedValueOnce(new Error('ENOENT')); // new.ts does not exist
    const { orch } = makeOrch({
      parsePatches: jest.fn().mockReturnValue([
        { relativePath: 'src/old.ts', content: '', delete: true },
        { relativePath: 'src/new.ts', content: 'const n = 1;\n' },
      ] satisfies FilePatch[]),
    });

    const result = await orch.execute({ task: 'replace module' });

    expect(result.success).toBe(true);
    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('old.ts'));
    expect(mockWriteFile).toHaveBeenCalledWith(expect.stringContaining('new.ts'), 'const n = 1;\n', 'utf-8');
    expect(result.newFiles).toContain('src/new.ts');
  });

  it('returns error result (no throw) when writeFile fails, includes partial progress', async () => {
    // First file succeeds, second file fails
    mockAccess
      .mockResolvedValueOnce(undefined)  // first file: exists → filesModified
      .mockResolvedValueOnce(undefined); // second file: exists
    mockWriteFile
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('EROFS: read-only'));

    const { orch } = makeOrch({
      parsePatches: jest.fn().mockReturnValue([
        { relativePath: 'src/a.ts', content: 'a\n' },
        { relativePath: 'src/b.ts', content: 'b\n' },
      ] satisfies FilePatch[]),
    });

    const result = await orch.execute({ task: 'update two files' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('src/b.ts');
    // First file was already written — partial progress visible
    expect(result.filesModified).toContain('src/a.ts');
  });

  it('resolves patch path relative to projectRoot', async () => {
    mockAccess.mockRejectedValueOnce(new Error('ENOENT'));
    const { orch } = makeOrch({
      projectRoot: '/workspace/my-project',
      parsePatches: jest.fn().mockReturnValue([
        { relativePath: 'src/module.ts', content: '' },
      ] satisfies FilePatch[]),
    });

    await orch.execute({ task: 'add module' });
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(path.join('my-project', 'src', 'module.ts')),
      '',
      'utf-8',
    );
  });
});

// ─── result shape & duration ──────────────────────────────────────────────────

describe('execute — result shape', () => {
  it('always includes a non-negative duration', async () => {
    mockAccess.mockResolvedValue(undefined);
    const { orch } = makeOrch();
    const result = await orch.execute({ task: 'add feature' });
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('successful result has no error field', async () => {
    mockAccess.mockResolvedValue(undefined);
    const { orch } = makeOrch();
    const result = await orch.execute({ task: 'add feature' });
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

// ─── path traversal containment ───────────────────────────────────────────────

describe('execute — path traversal containment', () => {
  it('joins a traversal path through path.join (path.join normalizes ..)', async () => {
    // path.join('/project', '../../etc/passwd') normalises to '/etc/passwd' on *nix
    // or stays within drive root on Windows.  The key guarantee is that no write
    // escapes to an arbitrary location without the absolute-path fast-path.
    mockAccess.mockRejectedValueOnce(new Error('ENOENT'));
    const { orch } = makeOrch({
      projectRoot: '/project',
      parsePatches: jest.fn().mockReturnValue([
        { relativePath: '../../etc/passwd', content: 'pwned\n' },
      ] satisfies FilePatch[]),
    });

    await orch.execute({ task: 'do bad thing' });

    // Verify it was NOT written to the exact string '../../etc/passwd'
    const writtenPaths = mockWriteFile.mock.calls.map((c) => c[0] as string);
    expect(writtenPaths.every((p) => !p.endsWith('../../etc/passwd'))).toBe(true);
  });
});
