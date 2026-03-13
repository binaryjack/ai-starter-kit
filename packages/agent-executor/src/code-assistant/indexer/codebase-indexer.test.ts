/**
 * Unit tests for CodebaseIndexer
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createParserRegistry } from '../parsers/create-parser-registry';
import { createTypeScriptParser } from '../parsers/create-typescript-parser';
import type { CodebaseIndexStoreInstance } from '../storage/codebase-index-store.types';
import { createCodebaseIndexStore } from '../storage/create-codebase-index-store';
import type { CodebaseIndexerInstance } from './codebase-indexer.types';
import { createCodebaseIndexer } from './create-codebase-indexer';

describe('CodebaseIndexer', () => {
  let indexer: CodebaseIndexerInstance;
  let indexStore: CodebaseIndexStoreInstance;
  const testDir = path.join(__dirname, '__test__', 'indexer-test');
  const testDbPath = path.join(testDir, 'test-index.db');

  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });

    // Create test files
    await fs.writeFile(
      path.join(testDir, 'index.ts'),
      `
        export function main() {
          console.log('Hello');
        }
      `
    );

    await fs.writeFile(
      path.join(testDir, 'utils.ts'),
      `
        export function helper() {
          return 42;
        }
        
        export const CONFIG = {
          version: '1.0.0'
        };
      `
    );

    await fs.writeFile(
      path.join(testDir, 'types.ts'),
      `
        export interface User {
          id: string;
          name: string;
        }
        
        export type UserId = string;
      `
    );

    // Create subdirectory with file
    await fs.mkdir(path.join(testDir, 'lib'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'lib', 'core.ts'),
      `
        import { helper } from '../utils';
        
        export function process() {
          return helper();
        }
      `
    );

    // Initialize index store
    indexStore = await createCodebaseIndexStore({
      dbPath: testDbPath,
      projectId: 'test-project'
    });

    // Initialize parser registry
    const parserRegistry = createParserRegistry({});
    const tsParser = createTypeScriptParser({ language: 'typescript' });
    parserRegistry.registerParser('typescript', tsParser);
    parserRegistry.registerParser('javascript', tsParser);

    // Initialize indexer
    indexer = createCodebaseIndexer({
      projectRoot: testDir,
      indexStore,
      parserRegistry
    });
  });

  afterEach(async () => {
    if (indexStore) {
      await indexStore.close();
    }

    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('indexProject', () => {
    it('should index all TypeScript files', async () => {
      const result = await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      expect(result.filesIndexed).toBe(4);
      expect(result.symbolsExtracted).toBeGreaterThan(0);
    });

    it('should extract symbols from files', async () => {
      const result = await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      expect(result.symbolsExtracted).toBeGreaterThan(0);
      
      // Verify symbols in database
      const stats = await indexStore.getStats();
      expect(stats.totalSymbols).toBe(result.symbolsExtracted);
    });

    it('should track dependencies', async () => {
      const result = await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      expect(result.dependenciesTracked).toBeGreaterThan(0);
      
      // Verify dependencies in database
      const stats = await indexStore.getStats();
      expect(stats.totalDependencies).toBe(result.dependenciesTracked);
    });

    it('should respect language filter', async () => {
      // Create a Python file (should be ignored)
      await fs.writeFile(
        path.join(testDir, 'script.py'),
        'def main():\n    pass'
      );

      const result = await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      // Should still only index TypeScript files
      expect(result.filesIndexed).toBe(4);
    });

    it('should respect exclude patterns', async () => {
      // Create node_modules directory
      await fs.mkdir(path.join(testDir, 'node_modules'), { recursive: true });
      await fs.writeFile(
        path.join(testDir, 'node_modules', 'package.ts'),
        'export const pkg = {};'
      );

      const result = await indexer.indexProject({
        incremental: false,
        languages: ['typescript'],
        excludePatterns: ['node_modules']
      });

      // node_modules should be excluded
      const stats = await indexStore.getStats();
      expect(stats.totalFiles).toBe(4); // Original 4 files only
    });

    it('should measure duration', async () => {
      const result = await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      expect(result.duration).toBeGreaterThan(0);
      expect(result.duration).toBeLessThan(10); // Should complete in < 10 seconds
    });

    it('should calculate cost (currently $0)', async () => {
      const result = await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      expect(result.cost).toBe(0);
    });

    it('should handle empty project', async () => {
      // Remove all test files
      await fs.rm(path.join(testDir, 'index.ts'));
      await fs.rm(path.join(testDir, 'utils.ts'));
      await fs.rm(path.join(testDir, 'types.ts'));
      await fs.rm(path.join(testDir, 'lib'), { recursive: true });

      const result = await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      expect(result.filesIndexed).toBe(0);
      expect(result.symbolsExtracted).toBe(0);
      expect(result.dependenciesTracked).toBe(0);
    });
  });

  describe('incremental indexing', () => {
    it('should skip unchanged files on second run', async () => {
      // First index
      const result1 = await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      expect(result1.filesIndexed).toBe(4);

      // Second index with incremental=true
      const result2 = await indexer.indexProject({
        incremental: true,
        languages: ['typescript']
      });

      // No files should be re-indexed (all unchanged)
      expect(result2.filesIndexed).toBe(0);
    });

    it('should re-index only changed files', async () => {
      // First index
      await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      // Modify one file
      await fs.writeFile(
        path.join(testDir, 'utils.ts'),
        `
          export function helper() {
            return 100; // Changed value
          }
        `
      );

      // Second index with incremental=true
      const result = await indexer.indexProject({
        incremental: true,
        languages: ['typescript']
      });

      // Only 1 file should be re-indexed
      expect(result.filesIndexed).toBe(1);
    });

    it('should index new files on incremental run', async () => {
      // First index
      await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      // Add new file
      await fs.writeFile(
        path.join(testDir, 'new-file.ts'),
        'export function newFunc() {}'
      );

      // Second index with incremental=true
      const result = await indexer.indexProject({
        incremental: true,
        languages: ['typescript']
      });

      // Should index the new file
      expect(result.filesIndexed).toBe(1);
    });
  });

  describe('force re-index', () => {
    it('should re-index all files when incremental=false', async () => {
      // First index
      const result1 = await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      expect(result1.filesIndexed).toBe(4);

      // Force re-index
      const result2 = await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      // All files should be re-indexed
      expect(result2.filesIndexed).toBe(4);
    });
  });

  describe('dependency resolution', () => {
    it('should resolve local imports', async () => {
      await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      // Check that lib/core.ts → utils.ts dependency was tracked
      const deps = indexStore._db!.prepare(`
        SELECT d.*, 
               sf.file_path as source_path,
               tf.file_path as target_path
        FROM codebase_dependencies d
        JOIN codebase_files sf ON d.source_file_id = sf.id
        LEFT JOIN codebase_files tf ON d.target_file_id = tf.id
        WHERE sf.file_path LIKE '%core.ts'
          AND d.import_specifier = '../utils'
      `).all();

      expect(deps).toHaveLength(1);
      expect(deps[0]).toMatchObject({
        dependency_type: 'local'
      });
    });

    it('should track external (npm) dependencies', async () => {
      // Add file with npm import
      await fs.writeFile(
        path.join(testDir, 'app.ts'),
        `
          import React from 'react';
          export function App() {}
        `
      );

      await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      const deps = indexStore._db!.prepare(`
        SELECT * FROM codebase_dependencies
        WHERE import_specifier = 'react'
      `).all();

      expect(deps).toHaveLength(1);
      expect(deps[0]).toMatchObject({
        dependency_type: 'npm',
        target_file_id: null
      });
    });

    it('should identify builtin Node.js modules', async () => {
      // Add file with Node.js import
      await fs.writeFile(
        path.join(testDir, 'server.ts'),
        `
          import * as fs from 'fs';
          export function read() {}
        `
      );

      await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      const deps = indexStore._db!.prepare(`
        SELECT * FROM codebase_dependencies
        WHERE import_specifier = 'fs'
      `).all();

      expect(deps).toHaveLength(1);
      expect(deps[0]).toMatchObject({
        dependency_type: 'builtin'
      });
    });
  });

  describe('error handling', () => {
    it('should continue indexing on parse errors', async () => {
      // Create file with syntax error
      await fs.writeFile(
        path.join(testDir, 'broken.ts'),
        'export function broken() { this is invalid syntax'
      );

      const result = await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      // Should still index valid files
      expect(result.filesIndexed).toBeGreaterThan(0);
    });

    it('should handle missing files gracefully', async () => {
      // Index first
      await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      // Delete a file
      await fs.unlink(path.join(testDir, 'utils.ts'));

      // Try incremental index
      const result = await indexer.indexProject({
        incremental: true,
        languages: ['typescript']
      });

      // Should not crash
      expect(result).toBeDefined();
    });
  });

  describe('file discovery', () => {
    it('should find files in subdirectories', async () => {
      const result = await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      const stats = await indexStore.getStats();
      
      // Should include lib/core.ts from subdirectory
      const files = indexStore._db!.prepare(`
        SELECT file_path FROM codebase_files
        WHERE file_path LIKE '%lib%'
      `).all();

      expect(files.length).toBeGreaterThan(0);
    });

    it('should handle multiple file extensions', async () => {
      // Add JavaScript file
      await fs.writeFile(
        path.join(testDir, 'legacy.js'),
        'export function legacy() {}'
      );

      const result = await indexer.indexProject({
        incremental: false,
        languages: ['typescript', 'javascript']
      });

      // Should index both .ts and .js files
      expect(result.filesIndexed).toBe(5); // 4 .ts + 1 .js
    });
  });

  describe('statistics', () => {
    it('should provide accurate file count', async () => {
      const result = await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      const stats = await indexStore.getStats();
      expect(stats.totalFiles).toBe(result.filesIndexed);
    });

    it('should provide accurate symbol count', async () => {
      const result = await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      const stats = await indexStore.getStats();
      expect(stats.totalSymbols).toBe(result.symbolsExtracted);
    });

    it('should provide accurate dependency count', async () => {
      const result = await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      const stats = await indexStore.getStats();
      expect(stats.totalDependencies).toBe(result.dependenciesTracked);
    });
  });

  describe('parallel parsing and FTS rebuild', () => {
    it('produces correct symbol count with more files than concurrency', async () => {
      for (let i = 0; i < 6; i++) {
        await fs.writeFile(
          path.join(testDir, `extra-${i}.ts`),
          `export function extra${i}() { return ${i}; }`
        );
      }

      const result = await indexer.indexProject({
        incremental: false,
        languages: ['typescript']
      });

      // 4 original + 6 new = 10
      expect(result.filesIndexed).toBe(10);
      expect(result.symbolsExtracted).toBeGreaterThan(0);
    });

    it('FTS is searchable after indexProject completes', async () => {
      await indexer.indexProject({ incremental: false, languages: ['typescript'] });

      const row = indexStore._db!.prepare(
        `SELECT COUNT(*) as count FROM codebase_symbols_fts WHERE codebase_symbols_fts MATCH 'main'`
      ).get() as { count: number };
      expect(row.count).toBeGreaterThan(0);
    });

    it('symbol counts match across repeated parallel runs', async () => {
      const r1 = await indexer.indexProject({ incremental: false, languages: ['typescript'] });
      const r2 = await indexer.indexProject({ incremental: false, languages: ['typescript'] });
      expect(r1.symbolsExtracted).toBe(r2.symbolsExtracted);
      expect(r1.filesIndexed).toBe(r2.filesIndexed);
    });
  });
});
