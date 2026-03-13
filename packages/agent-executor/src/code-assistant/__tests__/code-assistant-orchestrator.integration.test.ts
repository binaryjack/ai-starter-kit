/**
 * Integration tests: CodeAssistantOrchestrator
 *
 * Uses a fully-controlled mock store with realistic FTS5-query responses and
 * a mock IModelRouter — no native SQLite binding required.
 *
 * These tests are "integration" in the sense that they exercise the complete
 * orchestrator wiring (options → _openStore → _gatherContext → _buildRouter →
 * _parsePatches → disk writes) without mocking the prototype methods themselves.
 *
 * The test environment stays portable across platforms and CI agents regardless
 * of whether `better-sqlite3` native bindings are compiled.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { TaskType } from '../../lib/llm-provider.js';
import type { IModelRouter } from '../../lib/model-router/index.js';
import type { RoutedResponse } from '../../lib/model-router/model-router.types.js';
import { createCodeAssistantOrchestrator } from '../orchestrator/code-assistant-orchestrator.js';
import '../orchestrator/index.js'; // side-effect: attaches prototype methods
import type { CodebaseIndexStoreInstance } from '../storage/codebase-index-store.types.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

let counter = 0;

async function makeProject(files: Record<string, string> = {}): Promise<{
  dir: string;
  cleanup: () => Promise<void>;
}> {
  const dir = path.join(os.tmpdir(), `ai-orch-integ-${++counter}-${process.pid}`);
  await fs.mkdir(dir, { recursive: true });

  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf-8');
  }

  return { dir, cleanup: () => fs.rm(dir, { recursive: true, force: true }).catch(() => undefined) };
}

type SymbolRow = {
  name: string; kind: string; signature: string | null;
  file_path: string; line_start: number;
};

/**
 * Creates a smart mock store that returns the given symbolRows for any FTS query.
 * The `close()` method is a spy so callers can assert on its use.
 */
function makeSmartStore(symbolRows: SymbolRow[] = []): CodebaseIndexStoreInstance {
  return {
    query: jest.fn().mockImplementation(async (sql: string) => {
      // Simulate FTS5 query responses
      if (sql.includes('codebase_symbols_fts')) return symbolRows;
      // INSERT / DDL queries during seeding — return empty
      return [];
    }),
    close: jest.fn().mockResolvedValue(undefined),
  } as unknown as CodebaseIndexStoreInstance;
}

function mockRouter(content: string, cost = 0.001): IModelRouter {
  return {
    route:               jest.fn().mockResolvedValue({
      content,
      estimatedCostUSD: cost,
      taskType:         'code-generation' as TaskType,
    } satisfies Partial<RoutedResponse>),
    autoRegister:        jest.fn(),
    registeredProviders: jest.fn().mockReturnValue(['mock']),
    defaultProvider:     jest.fn().mockReturnValue('mock'),
    routeWithTools:      jest.fn(),
    checkBudget:         jest.fn(),
  } as unknown as IModelRouter;
}

// ─── symbol rows fixture ──────────────────────────────────────────────────────

const calcSymbols: SymbolRow[] = [
  { name: 'calculateTotal', kind: 'function', signature: '(a: number, b: number): number', file_path: 'src/calculator.ts', line_start: 3 },
];

// ─── tests ────────────────────────────────────────────────────────────────────

describe('CodeAssistantOrchestrator — integration (mock store, mock LLM)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a new file and reports it in result.newFiles', async () => {
    const { dir, cleanup } = await makeProject({
      'src/calculator.ts': 'export function calculateTotal(a: number, b: number): number { return a + b; }\n',
    });

    const store  = makeSmartStore(calcSymbols);
    const router = mockRouter(
      '## FILE: src/subtract.ts\n```typescript\nexport function subtract(a: number, b: number): number {\n  return a - b;\n}\n```',
    );
    const orch = createCodeAssistantOrchestrator({
      projectRoot: dir,
      modelRouter: router,
      indexStore:  store,
    });

    const result = await orch.execute({ task: 'add a subtract function' });

    expect(result.success).toBe(true);
    expect(result.newFiles).toContain('src/subtract.ts');
    expect(result.filesModified).toHaveLength(0);

    const written = await fs.readFile(path.join(dir, 'src', 'subtract.ts'), 'utf-8');
    expect(written).toContain('subtract');

    await cleanup();
  });

  it('modifies an existing file and reports it in result.filesModified', async () => {
    const original = 'export function calculateTotal(a: number, b: number): number { return a + b; }\n';
    const { dir, cleanup } = await makeProject({ 'src/calculator.ts': original });

    const store  = makeSmartStore(calcSymbols);
    const updated = original + 'export function multiply(a: number, b: number): number { return a * b; }\n';
    const router = mockRouter(`## FILE: src/calculator.ts\n\`\`\`typescript\n${updated}\`\`\``);

    const orch = createCodeAssistantOrchestrator({
      projectRoot: dir,
      modelRouter: router,
      indexStore:  store,
    });

    const result = await orch.execute({ task: 'add multiply to calculator' });

    expect(result.success).toBe(true);
    expect(result.filesModified).toContain('src/calculator.ts');
    expect(result.newFiles ?? []).toHaveLength(0);

    const disk = await fs.readFile(path.join(dir, 'src', 'calculator.ts'), 'utf-8');
    expect(disk).toContain('multiply');

    await cleanup();
  });

  it('dry-run returns plan and writes nothing to disk', async () => {
    const { dir, cleanup } = await makeProject({ 'src/utils.ts': 'export const X = 1;\n' });

    const planText = 'I would add a divide function after calculateTotal.';
    const store    = makeSmartStore(calcSymbols);
    const router   = mockRouter(planText);

    const orch = createCodeAssistantOrchestrator({
      projectRoot: dir,
      modelRouter: router,
      indexStore:  store,
    });

    const result = await orch.execute({ task: 'add divide', dryRun: true });

    expect(result.success).toBe(true);
    expect(result.plan).toBe(planText);
    expect(result.filesModified).toHaveLength(0);

    // Verify no unexpected files written
    const srcFiles = await fs.readdir(path.join(dir, 'src'));
    expect(srcFiles).toEqual(['utils.ts']); // unchanged

    await cleanup();
  });

  it('propagates totalCost from the mock router', async () => {
    const { dir, cleanup } = await makeProject();
    const store  = makeSmartStore();
    const router = mockRouter('## FILE: src/x.ts\n```\nconst x=1;\n```', 0.0777);

    const orch = createCodeAssistantOrchestrator({
      projectRoot: dir,
      modelRouter: router,
      indexStore:  store,
    });

    const result = await orch.execute({ task: 'add constant' });
    expect(result.totalCost).toBeCloseTo(0.0777);

    await cleanup();
  });

  it('includes matched symbol context in the LLM user message', async () => {
    const { dir, cleanup } = await makeProject({
      'src/calculator.ts': 'export function calculateTotal(a: number, b: number): number { return a + b; }\n',
    });

    const store  = makeSmartStore(calcSymbols);
    const router = mockRouter('(no changes needed)');

    const orch = createCodeAssistantOrchestrator({
      projectRoot: dir,
      modelRouter: router,
      indexStore:  store,
    });

    await orch.execute({ task: 'extend calculator with multiply' });

    const [, prompt] = (router.route as jest.Mock).mock.calls[0];
    const userMsg = prompt.messages[1].content as string;
    expect(userMsg).toContain('calculateTotal');
    expect(userMsg).toContain('calculator.ts');

    await cleanup();
  });

  it('uses "No index symbols matched" note when task has no matches', async () => {
    const { dir, cleanup } = await makeProject();
    const store  = makeSmartStore([]); // returns no symbols
    const router = mockRouter('(no changes)');

    const orch = createCodeAssistantOrchestrator({
      projectRoot: dir,
      modelRouter: router,
      indexStore:  store,
    });

    await orch.execute({ task: 'zzzzz qqqqq yyyyy' });

    const [, prompt] = (router.route as jest.Mock).mock.calls[0];
    const userMsg = prompt.messages[1].content as string;
    expect(userMsg).toContain('No index symbols matched');

    await cleanup();
  });

  it('deletes a file when LLM emits a ## DELETE directive', async () => {
    const { dir, cleanup } = await makeProject({
      'src/legacy.ts': 'export const OLD = 1;\n',
    });

    const store  = makeSmartStore();
    const router = mockRouter('## DELETE: src/legacy.ts');

    const orch = createCodeAssistantOrchestrator({
      projectRoot: dir,
      modelRouter: router,
      indexStore:  store,
    });

    const result = await orch.execute({ task: 'remove legacy' });

    expect(result.success).toBe(true);
    const exists = await fs.access(path.join(dir, 'src', 'legacy.ts')).then(() => true, () => false);
    expect(exists).toBe(false);

    await cleanup();
  });

  it('does NOT close a caller-supplied indexStore after execute()', async () => {
    const { dir, cleanup } = await makeProject();
    const store  = makeSmartStore();
    const router = mockRouter('(nothing)');

    const orch = createCodeAssistantOrchestrator({
      projectRoot: dir,
      modelRouter: router,
      indexStore:  store,
    });

    await orch.execute({ task: 'check style' });
    expect(store.close).not.toHaveBeenCalled();

    await cleanup();
  });

  it('returns success:false and actionable error when no router available', async () => {
    const { dir, cleanup } = await makeProject();
    const store = makeSmartStore();

    const orch = createCodeAssistantOrchestrator({
      projectRoot: dir,
      indexStore:  store,
    });
    orch._buildRouter = jest.fn().mockResolvedValue(undefined);

    const result = await orch.execute({ task: 'do work' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No LLM provider/);

    await cleanup();
  });
});
