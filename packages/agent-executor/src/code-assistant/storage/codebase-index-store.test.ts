/**
 * Unit tests for CodebaseIndexStore
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { CodebaseIndexStoreInstance } from './codebase-index-store.types'
import { createCodebaseIndexStore } from './create-codebase-index-store'

describe('CodebaseIndexStore', () => {
  let store: CodebaseIndexStoreInstance;
  const testDbPath = path.join(__dirname, '__test__', 'test-index.db');
  const testProjectId = 'test-project';

  beforeEach(async () => {
    // Ensure test directory exists
    await fs.mkdir(path.dirname(testDbPath), { recursive: true });
    
    // Remove existing test database
    try {
      await fs.unlink(testDbPath);
    } catch {
      // Ignore if file doesn't exist
    }

    store = await createCodebaseIndexStore({
      dbPath: testDbPath,
      projectId: testProjectId
    });
  });

  afterEach(async () => {
    if (store) {
      await store.close();
    }

    // Clean up test database
    try {
      await fs.unlink(testDbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('initialize', () => {
    it('should create database file', async () => {
      const exists = await fs.access(testDbPath)
        .then(() => true)
        .catch(() => false);
      
      expect(exists).toBe(true);
    });

    it('should create all required tables', async () => {
      const tables = store._db!.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' 
        ORDER BY name
      `).all() as { name: string }[];

      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('codebase_files');
      expect(tableNames).toContain('codebase_symbols');
      expect(tableNames).toContain('codebase_dependencies');
      expect(tableNames).toContain('codebase_symbols_fts');
    });

    it('should create FTS5 virtual table', async () => {
      const ftsInfo = store._db!.prepare(`
        SELECT sql FROM sqlite_master 
        WHERE name='codebase_symbols_fts'
      `).get() as { sql: string };

      expect(ftsInfo.sql).toContain('USING fts5');
    });
  });

  describe('upsertFile', () => {
    it('should insert a new file record', async () => {
      const fileId = await store.upsertFile({
        filePath: 'src/test.ts',
        hash: 'abc123',
        language: 'typescript',
        sizeBytes: 1024
      });

      expect(fileId).toBeGreaterThan(0);
    });

    it('should return existing file ID on duplicate insert', async () => {
      const fileData = {
        filePath: 'src/test.ts',
        hash: 'abc123',
        language: 'typescript',
        sizeBytes: 1024
      };

      const id1 = await store.upsertFile(fileData);
      const id2 = await store.upsertFile(fileData);

      expect(id1).toBe(id2);
    });

    it('should update file hash when path matches', async () => {
      const fileId = await store.upsertFile({
        filePath: 'src/test.ts',
        hash: 'hash1',
        language: 'typescript',
        sizeBytes: 1024
      });

      await store.upsertFile({
        filePath: 'src/test.ts',
        hash: 'hash2',
        language: 'typescript',
        sizeBytes: 2048
      });

      const file = await store.getFileByPath('src/test.ts');
      expect(file.file_hash).toBe('hash2');
      expect(file.size_bytes).toBe(2048);
    });
  });

  describe('upsertSymbols', () => {
    let fileId: number;

    beforeEach(async () => {
      fileId = await store.upsertFile({
        filePath: 'src/test.ts',
        hash: 'abc123',
        language: 'typescript',
        sizeBytes: 1024
      });
    });

    it('should insert symbol records', async () => {
      const symbols = [
        {
          name: 'testFunction',
          kind: 'function',
          lineStart: 1,
          lineEnd: 10,
          signature: 'function testFunction(): void',
          docstring: 'Test function',
          isExported: true
        }
      ];

      await store.upsertSymbols(fileId, symbols);

      const count = store._db!.prepare(`
        SELECT COUNT(*) as count FROM codebase_symbols 
        WHERE file_id = ?
      `).get(fileId) as { count: number };

      expect(count.count).toBe(1);
    });

    it('should handle empty symbol array', async () => {
      await store.upsertSymbols(fileId, []);

      const count = store._db!.prepare(`
        SELECT COUNT(*) as count FROM codebase_symbols 
        WHERE file_id = ?
      `).get(fileId) as { count: number };

      expect(count.count).toBe(0);
    });

    it('should replace existing symbols for file', async () => {
      const symbols1 = [
        {
          name: 'func1',
          kind: 'function',
          lineStart: 1,
          lineEnd: 5,
          isExported: true
        }
      ];

      const symbols2 = [
        {
          name: 'func2',
          kind: 'function',
          lineStart: 10,
          lineEnd: 20,
          isExported: false
        },
        {
          name: 'func3',
          kind: 'function',
          lineStart: 25,
          lineEnd: 30,
          isExported: true
        }
      ];

      await store.upsertSymbols(fileId, symbols1);
      await store.upsertSymbols(fileId, symbols2);

      const count = store._db!.prepare(`
        SELECT COUNT(*) as count FROM codebase_symbols 
        WHERE file_id = ?
      `).get(fileId) as { count: number };

      expect(count.count).toBe(2);
    });

    it('should update FTS index', async () => {
      const symbols = [
        {
          name: 'searchableFunction',
          kind: 'function',
          lineStart: 1,
          lineEnd: 5,
          isExported: true
        }
      ];

      await store.upsertSymbols(fileId, symbols);

      // Query FTS index
      const result = store._db!.prepare(`
        SELECT COUNT(*) as count FROM codebase_symbols_fts 
        WHERE codebase_symbols_fts MATCH 'searchableFunction'
      `).get() as { count: number };

      expect(result.count).toBeGreaterThan(0);
    });
  });

  describe('upsertDependencies', () => {
    let sourceFileId: number;
    let targetFileId: number;

    beforeEach(async () => {
      sourceFileId = await store.upsertFile({
        filePath: 'src/source.ts',
        hash: 'hash1',
        language: 'typescript',
        sizeBytes: 1024
      });

      targetFileId = await store.upsertFile({
        filePath: 'src/target.ts',
        hash: 'hash2',
        language: 'typescript',
        sizeBytes: 512
      });
    });

    it('should insert dependency records', async () => {
      const dependencies = [
        {
          sourceFileId,
          targetFileId,
          importSpecifier: './target',
          type: 'local' as const
        }
      ];

      await store.upsertDependencies(dependencies);

      const count = store._db!.prepare(`
        SELECT COUNT(*) as count FROM codebase_dependencies
      `).get() as { count: number };

      expect(count.count).toBe(1);
    });

    it('should handle external dependencies (null targetFileId)', async () => {
      const dependencies = [
        {
          sourceFileId,
          targetFileId: null,
          importSpecifier: 'lodash',
          type: 'npm' as const
        }
      ];

      await store.upsertDependencies(dependencies);

      const dep = store._db!.prepare(`
        SELECT * FROM codebase_dependencies 
        WHERE source_file_id = ?
      `).get(sourceFileId) as any;

      expect(dep.target_file_id).toBeNull();
      expect(dep.import_specifier).toBe('lodash');
      expect(dep.dependency_type).toBe('npm');
    });

    it('should replace existing dependencies', async () => {
      const deps1 = [
        {
          sourceFileId,
          targetFileId,
          importSpecifier: './target',
          type: 'local' as const
        }
      ];

      const deps2 = [
        {
          sourceFileId,
          targetFileId: null,
          importSpecifier: 'react',
          type: 'npm' as const
        }
      ];

      await store.upsertDependencies(deps1);
      await store.upsertDependencies(deps2);

      const count = store._db!.prepare(`
        SELECT COUNT(*) as count FROM codebase_dependencies
      `).get() as { count: number };

      expect(count.count).toBe(1);
    });
  });

  describe('getFileByPath', () => {
    it('should retrieve file by path', async () => {
      await store.upsertFile({
        filePath: 'src/test.ts',
        hash: 'abc123',
        language: 'typescript',
        sizeBytes: 1024
      });

      const file = await store.getFileByPath('src/test.ts');

      expect(file).toBeDefined();
      expect(file.file_path).toBe('src/test.ts');
      expect(file.file_hash).toBe('abc123');
    });

    it('should return undefined for non-existent file', async () => {
      const file = await store.getFileByPath('nonexistent.ts');
      expect(file).toBeUndefined();
    });
  });

  describe('getFileByHash', () => {
    it('should retrieve file by hash', async () => {
      await store.upsertFile({
        filePath: 'src/test.ts',
        hash: 'unique-hash',
        language: 'typescript',
        sizeBytes: 1024
      });

      const file = await store.getFileByHash('unique-hash');

      expect(file).toBeDefined();
      expect(file.file_hash).toBe('unique-hash');
    });

    it('should return undefined for non-existent hash', async () => {
      const file = await store.getFileByHash('nonexistent-hash');
      expect(file).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return stats for empty database', async () => {
      const stats = await store.getStats();

      expect(stats).toEqual({
        totalFiles: 0,
        totalSymbols: 0,
        totalDependencies: 0
      });
    });

    it('should return accurate stats', async () => {
      const fileId1 = await store.upsertFile({
        filePath: 'src/file1.ts',
        hash: 'hash1',
        language: 'typescript',
        sizeBytes: 1024
      });

      const fileId2 = await store.upsertFile({
        filePath: 'src/file2.ts',
        hash: 'hash2',
        language: 'typescript',
        sizeBytes: 512
      });

      await store.upsertSymbols(fileId1, [
        { name: 'func1', kind: 'function', lineStart: 1, lineEnd: 5, isExported: true }
      ]);

      await store.upsertSymbols(fileId2, [
        { name: 'func2', kind: 'function', lineStart: 1, lineEnd: 5, isExported: true },
        { name: 'func3', kind: 'function', lineStart: 10, lineEnd: 15, isExported: false }
      ]);

      await store.upsertDependencies([
        {
          sourceFileId: fileId1,
          targetFileId: fileId2,
          importSpecifier: './file2',
          type: 'local'
        }
      ]);

      const stats = await store.getStats();

      expect(stats.totalFiles).toBe(2);
      expect(stats.totalSymbols).toBe(3);
      expect(stats.totalDependencies).toBe(1);
    });
  });

  describe('close', () => {
    it('should close database connection', async () => {
      await store.close();
      
      // Attempting to query after close should throw
      expect(() => {
        store._db!.prepare('SELECT 1').get();
      }).toThrow();
    });
  });
});
