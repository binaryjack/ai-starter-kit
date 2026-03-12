/**
 * Integration tests for E14 Code Assistant
 * Tests the complete indexing workflow end-to-end
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { createCodebaseIndexer } from '../indexer/create-codebase-indexer'
import { createParserRegistry } from '../parsers/create-parser-registry'
import { createTypeScriptParser } from '../parsers/create-typescript-parser'
import { createCodebaseIndexStore } from '../storage/create-codebase-index-store'

describe('E14 Code Assistant Integration', () => {
  let testProjectRoot: string;
  let dbPath: string;
  let testCounter: number = 0;

  beforeEach(async () => {
    // Create unique test project directory for each test
    testCounter++;
    testProjectRoot = path.join(__dirname, `__test_project_${testCounter}__`);
    dbPath = path.join(testProjectRoot, '.agents', 'code-index.db');
    
    await fs.mkdir(testProjectRoot, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test project after each test
    try {
      await fs.rm(testProjectRoot, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Full Indexing Workflow', () => {
    it('should index a multi-file TypeScript project', async () => {
      // Setup: Create test project structure
      await fs.mkdir(path.join(testProjectRoot, 'src'), { recursive: true });
      await fs.mkdir(path.join(testProjectRoot, 'src', 'utils'), { recursive: true });
      
      // Create test files
      await fs.writeFile(
        path.join(testProjectRoot, 'src', 'index.ts'),
        `
import { calculateTotal } from './utils/calculator';
import { formatDate } from './utils/formatter';

export class Application {
  private total: number = 0;
  
  constructor() {
    this.total = calculateTotal(10, 20);
  }
  
  run(): void {
    console.log(formatDate(new Date()));
  }
}

export function main() {
  const app = new Application();
  app.run();
}
        `.trim()
      );

      await fs.writeFile(
        path.join(testProjectRoot, 'src', 'utils', 'calculator.ts'),
        `
/**
 * Calculates the sum of two numbers
 */
export function calculateTotal(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}
        `.trim()
      );

      await fs.writeFile(
        path.join(testProjectRoot, 'src', 'utils', 'formatter.ts'),
        `
export function formatDate(date: Date): string {
  return date.toISOString();
}

export interface FormatOptions {
  locale?: string;
  timezone?: string;
}
        `.trim()
      );

      // Initialize components
      const indexStore = await createCodebaseIndexStore({
        dbPath,
        projectId: 'test-integration-project'
      });

      const parserRegistry = createParserRegistry({});
      const tsParser = createTypeScriptParser({ language: 'typescript' });
      parserRegistry.registerParser('typescript', tsParser);
      parserRegistry.registerParser('javascript', tsParser);

      const indexer = createCodebaseIndexer({
        projectRoot: testProjectRoot,
        indexStore,
        parserRegistry
      });

      // Execute: Run full indexing
      const result = await indexer.indexProject({
        languages: ['typescript'],
        excludePatterns: ['node_modules', 'dist'],
        incremental: false
      });

      // Verify: Check indexing results
      expect(result.filesIndexed).toBe(3);
      expect(result.symbolsExtracted).toBeGreaterThan(0);
      expect(result.dependenciesTracked).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);

      // Verify: Check database state
      const stats = await indexStore.getStats();
      expect(stats.totalFiles).toBe(3);
      expect(stats.totalSymbols).toBeGreaterThan(4); // At least: Application, main, calculateTotal, subtract, formatDate
      expect(stats.totalDependencies).toBeGreaterThanOrEqual(2); // At least 2 local imports from index.ts

      // Verify: Check specific file was indexed
      const indexFile = await indexStore.getFileByPath('src/index.ts');
      expect(indexFile).toBeDefined();
      expect(indexFile.language).toBe('typescript');
      expect(indexFile.file_hash).toBeDefined();

      await indexStore.close();
    }, 30000);

    it('should support incremental indexing', async () => {
      // Setup: Create initial project structure
      await fs.mkdir(path.join(testProjectRoot, 'src'), { recursive: true });
      
      await fs.writeFile(
        path.join(testProjectRoot, 'src', 'service.ts'),
        `
export class UserService {
  getUser(id: string) {
    return { id, name: 'Test User' };
  }
}
        `.trim()
      );

      // First indexing pass
      const indexStore1 = await createCodebaseIndexStore({
        dbPath,
        projectId: 'test-incremental-project'
      });

      const parserRegistry1 = createParserRegistry({});
      const tsParser1 = createTypeScriptParser({ language: 'typescript' });
      parserRegistry1.registerParser('typescript', tsParser1);

      const indexer1 = createCodebaseIndexer({
        projectRoot: testProjectRoot,
        indexStore: indexStore1,
        parserRegistry: parserRegistry1
      });

      const firstResult = await indexer1.indexProject({
        languages: ['typescript'],
        incremental: true
      });

      expect(firstResult.filesIndexed).toBe(1);
      await indexStore1.close();

      // Add a new file
      await fs.writeFile(
        path.join(testProjectRoot, 'src', 'repository.ts'),
        `
export class UserRepository {
  save(user: any) {
    console.log('Saving user:', user);
  }
}
        `.trim()
      );

      // Second indexing pass (incremental)
      const indexStore2 = await createCodebaseIndexStore({
        dbPath,
        projectId: 'test-incremental-project'
      });

      const parserRegistry2 = createParserRegistry({});
      const tsParser2 = createTypeScriptParser({ language: 'typescript' });
      parserRegistry2.registerParser('typescript', tsParser2);

      const indexer2 = createCodebaseIndexer({
        projectRoot: testProjectRoot,
        indexStore: indexStore2,
        parserRegistry: parserRegistry2
      });

      const secondResult = await indexer2.indexProject({
        languages: ['typescript'],
        incremental: true
      });

      // Should only index the new file
      expect(secondResult.filesIndexed).toBe(1);

      // Verify: Total files in database should be 2
      const stats = await indexStore2.getStats();
      expect(stats.totalFiles).toBe(2);

      await indexStore2.close();
    }, 30000);

    it('should build correct dependency graph', async () => {
      // Setup: Create files with clear dependencies
      await fs.mkdir(path.join(testProjectRoot, 'src'), { recursive: true });
      await fs.mkdir(path.join(testProjectRoot, 'src', 'lib'), { recursive: true });
      
      await fs.writeFile(
        path.join(testProjectRoot, 'src', 'lib', 'helper.ts'),
        `
export function helperFunction() {
  return 'helper';
}
        `.trim()
      );

      await fs.writeFile(
        path.join(testProjectRoot, 'src', 'main.ts'),
        `
import { helperFunction } from './lib/helper';

export function main() {
  return helperFunction();
}
        `.trim()
      );

      // Index the project
      const indexStore = await createCodebaseIndexStore({
        dbPath,
        projectId: 'test-dependency-graph'
      });

      const parserRegistry = createParserRegistry({});
      const tsParser = createTypeScriptParser({ language: 'typescript' });
      parserRegistry.registerParser('typescript', tsParser);

      const indexer = createCodebaseIndexer({
        projectRoot: testProjectRoot,
        indexStore,
        parserRegistry
      });

      await indexer.indexProject({
        languages: ['typescript'],
        incremental: false
      });

      // Verify: Check dependency exists
      const stats = await indexStore.getStats();
      expect(stats.totalDependencies).toBeGreaterThanOrEqual(1);

      // Query dependencies directly
      const deps = await indexStore.query(
        `SELECT * FROM codebase_dependencies WHERE project_id = ?`,
        ['test-dependency-graph']
      ) as any[];

      expect(deps.length).toBeGreaterThan(0);
      
      // Find the dependency from main.ts to helper.ts
      const mainToHelper = deps.find((d: any) => 
        d.import_specifier === './lib/helper'
      );
      
      expect(mainToHelper).toBeDefined();

      await indexStore.close();
    }, 30000);

    it('should handle force re-indexing', async () => {
      // Setup
      await fs.mkdir(path.join(testProjectRoot, 'src'), { recursive: true });
      
      await fs.writeFile(
        path.join(testProjectRoot, 'src', 'test.ts'),
        `export const value = 42;`
      );

      // First index
      const indexStore1 = await createCodebaseIndexStore({
        dbPath,
        projectId: 'test-force-reindex'
      });

      const parserRegistry1 = createParserRegistry({});
      const tsParser1 = createTypeScriptParser({ language: 'typescript' });
      parserRegistry1.registerParser('typescript', tsParser1);

      const indexer1 = createCodebaseIndexer({
        projectRoot: testProjectRoot,
        indexStore: indexStore1,
        parserRegistry: parserRegistry1
      });

      const firstResult = await indexer1.indexProject({
        incremental: false
      });

      expect(firstResult.filesIndexed).toBe(1);
      await indexStore1.close();

      // Second index with no changes (incremental should skip)
      const indexStore2 = await createCodebaseIndexStore({
        dbPath,
        projectId: 'test-force-reindex'
      });

      const parserRegistry2 = createParserRegistry({});
      const tsParser2 = createTypeScriptParser({ language: 'typescript' });
      parserRegistry2.registerParser('typescript', tsParser2);

      const indexer2 = createCodebaseIndexer({
        projectRoot: testProjectRoot,
        indexStore: indexStore2,
        parserRegistry: parserRegistry2
      });

      const incrementalResult = await indexer2.indexProject({
        incremental: true
      });

      // Should skip unchanged file
      expect(incrementalResult.filesIndexed).toBe(0);
      await indexStore2.close();

      // Force re-index
      const indexStore3 = await createCodebaseIndexStore({
        dbPath,
        projectId: 'test-force-reindex'
      });

      const parserRegistry3 = createParserRegistry({});
      const tsParser3 = createTypeScriptParser({ language: 'typescript' });
      parserRegistry3.registerParser('typescript', tsParser3);

      const indexer3 = createCodebaseIndexer({
        projectRoot: testProjectRoot,
        indexStore: indexStore3,
        parserRegistry: parserRegistry3
      });

      const forceResult = await indexer3.indexProject({
        incremental: false // Force re-index
      });

      // Should re-index even though file hasn't changed
      expect(forceResult.filesIndexed).toBe(1);
      await indexStore3.close();
    }, 30000);

    it('should handle files with syntax errors gracefully', async () => {
      // Setup: Create a file with syntax error
      await fs.mkdir(path.join(testProjectRoot, 'src'), { recursive: true });
      
      await fs.writeFile(
        path.join(testProjectRoot, 'src', 'valid.ts'),
        `export const valid = true;`
      );

      await fs.writeFile(
        path.join(testProjectRoot, 'src', 'invalid.ts'),
        `export const invalid = {{{{{ syntax error`
      );

      // Index
      const indexStore = await createCodebaseIndexStore({
        dbPath,
        projectId: 'test-error-handling'
      });

      const parserRegistry = createParserRegistry({});
      const tsParser = createTypeScriptParser({ language: 'typescript' });
      parserRegistry.registerParser('typescript', tsParser);

      const indexer = createCodebaseIndexer({
        projectRoot: testProjectRoot,
        indexStore,
        parserRegistry
      });

      const result = await indexer.indexProject({
        languages: ['typescript']
      });

      // Should successfully index the valid file
      // Note: TypeScript parser is lenient and may still parse invalid files
      expect(result.filesIndexed).toBeGreaterThanOrEqual(1);

      await indexStore.close();
    }, 30000);
  });

  describe('Database Operations', () => {
    it('should support FTS5 full-text search', async () => {
      // Setup
      await fs.mkdir(path.join(testProjectRoot, 'src'), { recursive: true });
      
      await fs.writeFile(
        path.join(testProjectRoot, 'src', 'search.ts'),
        `
/**
 * Performs a search operation on the database
 */
export function searchDatabase(query: string) {
  return { results: [] };
}

export function findUserByEmail(email: string) {
  return null;
}
        `.trim()
      );

      // Index
      const indexStore = await createCodebaseIndexStore({
        dbPath,
        projectId: 'test-fts-search'
      });

      const parserRegistry = createParserRegistry({});
      const tsParser = createTypeScriptParser({ language: 'typescript' });
      parserRegistry.registerParser('typescript', tsParser);

      const indexer = createCodebaseIndexer({
        projectRoot: testProjectRoot,
        indexStore,
        parserRegistry
      });

      await indexer.indexProject({
        languages: ['typescript']
      });

      // Search using FTS5
      const searchResults = await indexStore.query(
        `SELECT * FROM codebase_symbols_fts 
         WHERE codebase_symbols_fts MATCH ? 
         LIMIT 10`,
        ['search']
      ) as any[];

      // Should find the searchDatabase function
      expect(searchResults.length).toBeGreaterThan(0);
      
      const foundSymbol = searchResults.find((s: any) => 
        s.symbol_name?.includes('search') || s.signature?.includes('search')
      );
      
      expect(foundSymbol).toBeDefined();

      await indexStore.close();
    }, 30000);
  });
});
