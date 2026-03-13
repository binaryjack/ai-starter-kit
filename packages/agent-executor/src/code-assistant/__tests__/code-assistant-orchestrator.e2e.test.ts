/**
 * E2E (battle) tests: CodeAssistantOrchestrator
 *
 * End-to-end journey: real temp directory â†’ real TypeScript indexing â†’ real
 * SQLite FTS5 â†’ mocked LLM â†’ real filesystem writes, verified on disk.
 *
 * No mocking of fs, SQLite, or the parser pipeline â€” only the LLM router is
 * replaced so the suite runs without provider API keys.
 *
 * Journeys covered:
 *   1. Index + generate new file
 *   2. Index + modify existing file (full-replace)
 *   3. Dry-run: no files written, plan returned
 *   4. Index + DELETE directive removes file
 *   5. Mixed DELETE + FILE in one response
 *   6. Deep sub-directory creation
 *   7. Quick-fix / refactor / debug mode routing
 *   8. Task with zero FTS matches â†’ still succeeds (no crash)
 *   9. Incremental re-index after generation: new file is discoverable
 *  10. Large codebase: truncation does not break the response
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { TaskType } from '../../lib/llm-provider.js';
import type { IModelRouter } from '../../lib/model-router/index.js';
import type { RoutedResponse } from '../../lib/model-router/model-router.types.js';
import { createCodebaseIndexer } from '../indexer/create-codebase-indexer.js';
import { createCodeAssistantOrchestrator } from '../orchestrator/code-assistant-orchestrator.js';
import '../orchestrator/index.js'; // side-effect: attaches prototype methods
import { createParserRegistry } from '../parsers/create-parser-registry.js';
import { createTypeScriptParser } from '../parsers/create-typescript-parser.js';
import { createCodebaseIndexStore } from '../storage/create-codebase-index-store.js';

// Guard: skip entire file when native better-sqlite3 bindings are unavailable
// (pre-existing machine/CI issue â€” node-v137-win32-x64 bindings not compiled).
// Load succeeds but instantiation throws when native addon is missing, so we
// probe with an actual in-memory db creation.
let _sqliteAvailable = true;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Db = require('better-sqlite3');
  const probe = new Db(':memory:');
  probe.close();
} catch { _sqliteAvailable = false; }
const describeIf = (_sqliteAvailable ? describe : describe.skip) as typeof describe;

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let counter = 0;

async function createProject(files: Record<string, string>): Promise<{
  dir:  string;
  dbPath: string;
  cleanup: () => Promise<void>;
}> {
  const dir    = path.join(os.tmpdir(), `ai-e2e-orch-${++counter}-${process.pid}`);
  const dbPath = path.join(dir, '.agents', 'code-index.db');
  await fs.mkdir(path.join(dir, '.agents'), { recursive: true });

  for (const [relPath, content] of Object.entries(files)) {
    const abs = path.join(dir, relPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf-8');
  }

  return {
    dir,
    dbPath,
    cleanup: () => fs.rm(dir, { recursive: true, force: true }).catch(() => undefined),
  };
}

async function buildIndex(dir: string, dbPath: string) {
  const projectId = path.basename(dir);
  const store     = await createCodebaseIndexStore({ dbPath, projectId });
  const registry  = createParserRegistry({});
  const tsParser  = createTypeScriptParser({ language: 'typescript' });
  registry.registerParser('typescript', tsParser);
  registry.registerParser('javascript', tsParser);
  const indexer   = createCodebaseIndexer({ projectRoot: dir, indexStore: store, parserRegistry: registry });
  await indexer.indexProject();
  return store;
}

function mockRouter(content: string, cost = 0.001, taskType: TaskType = 'code-generation'): IModelRouter {
  return {
    route: jest.fn().mockResolvedValue({ content, estimatedCostUSD: cost, taskType } satisfies Partial<RoutedResponse>),
    autoRegister:        jest.fn(),
    registeredProviders: jest.fn().mockReturnValue(['mock']),
    defaultProvider:     jest.fn().mockReturnValue('mock'),
    routeWithTools:      jest.fn(),
    checkBudget:         jest.fn(),
  } as unknown as IModelRouter;
}

function fileExists(absPath: string): Promise<boolean> {
  return fs.access(absPath).then(() => true, () => false);
}

// â”€â”€â”€ journey 1: index + generate new file â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describeIf('E2E journey 1 â€” generate a new file from an indexed codebase', () => {
  it('creates the output file at the correct path with correct content', async () => {
    const { dir, dbPath, cleanup } = await createProject({
      'src/calculator.ts': [
        'export function add(a: number, b: number): number {',
        '  return a + b;',
        '}',
      ].join('\n'),
    });

    const store  = await buildIndex(dir, dbPath);
    const router = mockRouter(
      '## FILE: src/subtract.ts\n```typescript\nexport function subtract(a: number, b: number): number {\n  return a - b;\n}\n```',
    );

    const orch = createCodeAssistantOrchestrator({
      projectRoot: dir,
      modelRouter: router,
      indexStore:  store,
    });

    const result = await orch.execute({ task: 'add a subtract function alongside add' });
    await store.close();

    expect(result.success).toBe(true);
    expect(result.newFiles).toContain('src/subtract.ts');

    const content = await fs.readFile(path.join(dir, 'src', 'subtract.ts'), 'utf-8');
    expect(content).toContain('subtract');
    expect(content).toContain('return a - b');

    await cleanup();
  });

  it('prompt sent to LLM contains the indexed symbol (add)', async () => {
    const { dir, dbPath, cleanup } = await createProject({
      'src/calculator.ts': 'export function add(a: number, b: number) { return a + b; }\n',
    });

    const store  = await buildIndex(dir, dbPath);
    const router = mockRouter('## FILE: src/x.ts\n```\n```');

    const orch = createCodeAssistantOrchestrator({
      projectRoot: dir,
      modelRouter: router,
      indexStore:  store,
    });

    await orch.execute({ task: 'extend calculator with multiply' });
    await store.close();

    const [, prompt] = (router.route as jest.Mock).mock.calls[0];
    // Context section must appear in the user message
    const userMsg = prompt.messages[1].content as string;
    expect(userMsg).toContain('calculator.ts');

    await cleanup();
  });
});

// â”€â”€â”€ journey 2: modify existing file â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describeIf('E2E journey 2 â€” full-replace an existing file', () => {
  it('overwrites the file and reports it in filesModified', async () => {
    const original = 'export function add(a: number, b: number): number { return a + b; }\n';
    const updated  = 'export function add(a: number, b: number): number { return a + b; }\nexport function mul(a: number, b: number): number { return a * b; }\n';

    const { dir, dbPath, cleanup } = await createProject({ 'src/math.ts': original });
    const store  = await buildIndex(dir, dbPath);
    const router = mockRouter(`## FILE: src/math.ts\n\`\`\`typescript\n${updated}\`\`\``);

    const orch = createCodeAssistantOrchestrator({
      projectRoot: dir,
      modelRouter: router,
      indexStore:  store,
    });

    const result = await orch.execute({ task: 'add multiply to math module' });
    await store.close();

    expect(result.success).toBe(true);
    expect(result.filesModified).toContain('src/math.ts');
    expect(result.newFiles ?? []).toHaveLength(0);

    const disk = await fs.readFile(path.join(dir, 'src', 'math.ts'), 'utf-8');
    expect(disk).toContain('mul');
    expect(disk).toContain('add');

    await cleanup();
  });
});

// â”€â”€â”€ journey 3: dry-run â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describeIf('E2E journey 3 â€” dry-run mode', () => {
  it('returns plan text and writes no files to disk', async () => {
    const { dir, dbPath, cleanup } = await createProject({
      'src/utils.ts': 'export const VERSION = "1.0.0";\n',
    });
    const store  = await buildIndex(dir, dbPath);
    const plan   = 'I would bump VERSION to "2.0.0" in src/utils.ts.';
    const router = mockRouter(plan);

    const orch = createCodeAssistantOrchestrator({
      projectRoot: dir,
      modelRouter: router,
      indexStore:  store,
    });

    const result = await orch.execute({ task: 'bump version', dryRun: true });
    await store.close();

    expect(result.success).toBe(true);
    expect(result.plan).toBe(plan);

    // Original file unchanged
    const disk = await fs.readFile(path.join(dir, 'src', 'utils.ts'), 'utf-8');
    expect(disk).toContain('1.0.0');
    expect(disk).not.toContain('2.0.0');

    await cleanup();
  });
});

// â”€â”€â”€ journey 4: DELETE directive â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describeIf('E2E journey 4 â€” DELETE removes a real file from disk', () => {
  it('deletes the target file and reports success', async () => {
    const { dir, dbPath, cleanup } = await createProject({
      'src/legacy.ts': 'export const OLD = true;\n',
    });
    const store  = await buildIndex(dir, dbPath);
    const router = mockRouter('## DELETE: src/legacy.ts');

    const orch = createCodeAssistantOrchestrator({
      projectRoot: dir,
      modelRouter: router,
      indexStore:  store,
    });

    const result = await orch.execute({ task: 'remove legacy module' });
    await store.close();

    expect(result.success).toBe(true);
    expect(await fileExists(path.join(dir, 'src', 'legacy.ts'))).toBe(false);

    await cleanup();
  });

  it('succeeds silently if DELETE target was already absent', async () => {
    const { dir, dbPath, cleanup } = await createProject({
      'src/existing.ts': 'export const X = 1;\n',
    });
    const store  = await buildIndex(dir, dbPath);
    const router = mockRouter('## DELETE: src/ghost-file.ts');

    const orch = createCodeAssistantOrchestrator({
      projectRoot: dir,
      modelRouter: router,
      indexStore:  store,
    });

    const result = await orch.execute({ task: 'remove ghost' });
    await store.close();

    expect(result.success).toBe(true);

    await cleanup();
  });
});

// â”€â”€â”€ journey 5: mixed DELETE + FILE in one response â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describeIf('E2E journey 5 â€” mixed DELETE + FILE applied in correct order', () => {
  it('deletes old.ts and creates new.ts atomically from one LLM response', async () => {
    const { dir, dbPath, cleanup } = await createProject({
      'src/old.ts': 'export const OLD = 1;\n',
    });
    const store  = await buildIndex(dir, dbPath);
    const router = mockRouter([
      '## DELETE: src/old.ts',
      '',
      '## FILE: src/new.ts',
      '```typescript',
      'export const NEW = 2;',
      '```',
    ].join('\n'));

    const orch = createCodeAssistantOrchestrator({
      projectRoot: dir,
      modelRouter: router,
      indexStore:  store,
    });

    const result = await orch.execute({ task: 'replace old with new' });
    await store.close();

    expect(result.success).toBe(true);
    expect(await fileExists(path.join(dir, 'src', 'old.ts'))).toBe(false);
    expect(await fileExists(path.join(dir, 'src', 'new.ts'))).toBe(true);

    const content = await fs.readFile(path.join(dir, 'src', 'new.ts'), 'utf-8');
    expect(content).toContain('NEW');

    await cleanup();
  });
});

// â”€â”€â”€ journey 6: deep sub-directory creation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describeIf('E2E journey 6 â€” output to a non-existent nested directory', () => {
  it('creates all intermediate directories and writes the file', async () => {
    const { dir, dbPath, cleanup } = await createProject({
      'src/index.ts': 'export {};\n',
    });
    const store  = await buildIndex(dir, dbPath);
    const router = mockRouter(
      '## FILE: src/utils/math/operations/advanced.ts\n```typescript\nexport function pow(b: number, e: number) { return b ** e; }\n```',
    );

    const orch = createCodeAssistantOrchestrator({
      projectRoot: dir,
      modelRouter: router,
      indexStore:  store,
    });

    const result = await orch.execute({ task: 'add advanced math utilities' });
    await store.close();

    const target = path.join(dir, 'src', 'utils', 'math', 'operations', 'advanced.ts');
    expect(result.success).toBe(true);
    expect(await fileExists(target)).toBe(true);

    await cleanup();
  });
});

// â”€â”€â”€ journey 7: mode â†’ TaskType routing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describeIf('E2E journey 7 â€” mode selection routes correct TaskType to LLM', () => {
  const modeMap: Array<[string, string]> = [
    ['quick-fix', 'code-generation'],
    ['feature',   'code-generation'],
    ['refactor',  'refactoring'],
    ['debug',     'file-analysis'],
  ];

  for (const [mode, expectedTaskType] of modeMap) {
    it(`mode="${mode}" â†’ TaskType="${expectedTaskType}"`, async () => {
      const { dir, dbPath, cleanup } = await createProject({
        'src/app.ts': 'export function run() {}\n',
      });
      const store  = await buildIndex(dir, dbPath);
      const router = mockRouter('(no changes)');

      const orch = createCodeAssistantOrchestrator({
        projectRoot: dir,
        modelRouter: router,
        indexStore:  store,
      });

      await orch.execute({ task: `test ${mode} mode`, mode: mode as Parameters<typeof orch.execute>[0]['mode'] });
      await store.close();

      const [taskType] = (router.route as jest.Mock).mock.calls[0];
      expect(taskType).toBe(expectedTaskType);

      await cleanup();
    });
  }
});

// â”€â”€â”€ journey 8: no FTS matches â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describeIf('E2E journey 8 â€” task with zero FTS symbol matches', () => {
  it('does not crash and still calls the LLM with a no-match context note', async () => {
    const { dir, dbPath, cleanup } = await createProject({
      'src/app.ts': 'export function run() {}\n',
    });
    const store  = await buildIndex(dir, dbPath);
    const router = mockRouter('## FILE: src/z.ts\n```\nconst z = 99;\n```');

    const orch = createCodeAssistantOrchestrator({
      projectRoot: dir,
      modelRouter: router,
      indexStore:  store,
    });

    // Task uses only 1-3 char non-indexable words + totally unmatchable terms
    const result = await orch.execute({ task: 'zzzzz qqqqq yyyyy' });
    await store.close();

    expect(result.success).toBe(true);
    const [, prompt] = (router.route as jest.Mock).mock.calls[0];
    expect(prompt.messages[1].content).toContain('No index symbols matched');

    await cleanup();
  });
});

// â”€â”€â”€ journey 9: incremental re-index after generation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describeIf('E2E journey 9 â€” newly generated file is discoverable after re-index', () => {
  it('the generated file can be found via FTS after a subsequent indexProject() call', async () => {
    const { dir, dbPath, cleanup } = await createProject({
      'src/core.ts': 'export function core() {}\n',
    });

    // First index pass
    const projectId = path.basename(dir);
    const store     = await createCodebaseIndexStore({ dbPath, projectId });
    const registry  = createParserRegistry({});
    const tsParser2 = createTypeScriptParser({ language: 'typescript' });
    registry.registerParser('typescript', tsParser2);
    registry.registerParser('javascript', tsParser2);
    const indexer   = createCodebaseIndexer({ projectRoot: dir, indexStore: store, parserRegistry: registry });
    await indexer.indexProject();

    // Generate a new file
    const generatedContent = 'export function freshlyGenerated(): string { return "new"; }\n';
    const router           = mockRouter(`## FILE: src/fresh.ts\n\`\`\`typescript\n${generatedContent}\`\`\``);

    const orch = createCodeAssistantOrchestrator({
      projectRoot: dir,
      modelRouter: router,
      indexStore:  store,
    });
    await orch.execute({ task: 'add freshlyGenerated function' });

    // Re-index (incremental: false = full rebuild)
    await indexer.indexProject({ incremental: false });

    // The new symbol must now be found via FTS
    const rows = (await store.query(
      `SELECT s.name FROM codebase_symbols_fts fts
       JOIN codebase_symbols s ON s.id = fts.rowid
       WHERE codebase_symbols_fts MATCH 'freshlyGenerated'`,
      [],
    )) as Array<{ name: string }>;

    await store.close();
    expect(rows.some((r) => r.name === 'freshlyGenerated')).toBe(true);

    await cleanup();
  });
});

// â”€â”€â”€ journey 10: large codebase (truncation) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describeIf('E2E journey 10 â€” files longer than MAX_FILE_LINES are truncated safely', () => {
  it('500-line source file is truncated and LLM receives truncation marker', async () => {
    const bigSource = Array.from({ length: 500 }, (_, i) =>
      `export function fn${i}(x: number): number { return x + ${i}; }`,
    ).join('\n') + '\n';

    const { dir, dbPath, cleanup } = await createProject({ 'src/big.ts': bigSource });
    const store  = await buildIndex(dir, dbPath);
    const router = mockRouter('(no changes needed)');

    const orch = createCodeAssistantOrchestrator({
      projectRoot: dir,
      modelRouter: router,
      indexStore:  store,
    });

    const result = await orch.execute({ task: 'review big file' });
    await store.close();

    expect(result.success).toBe(true);

    const [, prompt] = (router.route as jest.Mock).mock.calls[0];
    const userMsg = prompt.messages[1].content as string;
    expect(userMsg).toContain('more lines omitted');

    await cleanup();
  });
});

