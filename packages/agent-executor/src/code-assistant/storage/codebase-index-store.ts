/**
 * SQLite-based storage for codebase index
 * Manages files, symbols, dependencies, and embeddings
 */

import Database from 'better-sqlite3';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { CodebaseIndexStoreOptions } from './codebase-index-store.types';

function cosineSimilarityBuffers(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length)
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < len; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

export type CodebaseIndexStoreInstance = {
  _db: Database.Database | null;
  _dbPath: string;
  _projectId: string;
  initialize(): Promise<void>;
  upsertFile(fileData: any): Promise<number>;
  upsertSymbols(fileId: number, symbols: any[]): Promise<void>;
  upsertDependencies(dependencies: any[]): Promise<void>;
  getFileByPath(filePath: string): Promise<any>;
  getFileByHash(hash: string): Promise<any>;
  getAllFiles(): Promise<any[]>;
  getSymbolsByFile(fileId: number): Promise<{ id: number; name: string; docstring: string | null; is_exported: number }[]>;
  storeEmbedding(symbolId: number, vector: Float32Array): Promise<void>;
  semanticSearch(queryVector: Float32Array, topK: number, ftsQuery?: string): Promise<import('../embeddings/embedding-provider.types').SemanticSearchResult[]>;
  rebuildFts(): void;
  query(sql: string, params?: any[]): Promise<any>;
  getStats(): Promise<{ totalFiles: number; totalSymbols: number; totalDependencies: number }>;
  close(): Promise<void>;
  _createTables(): Promise<void>;
  _migrateEmbeddingColumn(): void;
};

export const CodebaseIndexStore = function(this: CodebaseIndexStoreInstance, options: CodebaseIndexStoreOptions) {
  const { dbPath, projectId } = options;
  
  Object.defineProperty(this, '_db', {
    enumerable: false,
    writable: true,
    value: null
  });
  
  Object.defineProperty(this, '_dbPath', {
    enumerable: false,
    value: dbPath
  });
  
  Object.defineProperty(this, '_projectId', {
    enumerable: false,
    value: projectId
  });
};

CodebaseIndexStore.prototype.initialize = async function(this: CodebaseIndexStoreInstance): Promise<void> {
  // Ensure directory exists
  const dir = path.dirname(this._dbPath);
  await fs.mkdir(dir, { recursive: true });
  
  // Open database
  this._db = new Database(this._dbPath);
  this._db!.pragma('journal_mode = WAL');
  this._db!.pragma('foreign_keys = ON');
  
  // Create tables
  await this._createTables();
  // Add embedding column if this is an existing DB that pre-dates it
  this._migrateEmbeddingColumn();
};

CodebaseIndexStore.prototype._createTables = async function(this: CodebaseIndexStoreInstance): Promise<void> {
  this._db!.exec(`
    CREATE TABLE IF NOT EXISTS codebase_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      language TEXT NOT NULL,
      size_bytes INTEGER,
      last_indexed_at INTEGER,
      UNIQUE(project_id, file_path)
    );
    
    CREATE INDEX IF NOT EXISTS idx_files_project ON codebase_files(project_id);
    CREATE INDEX IF NOT EXISTS idx_files_hash ON codebase_files(file_hash);
    
    CREATE TABLE IF NOT EXISTS codebase_symbols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      line_start INTEGER,
      line_end INTEGER,
      signature TEXT,
      docstring TEXT,
      is_exported BOOLEAN,
      FOREIGN KEY(file_id) REFERENCES codebase_files(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_symbols_name ON codebase_symbols(name);
    CREATE INDEX IF NOT EXISTS idx_symbols_kind ON codebase_symbols(kind);
    CREATE INDEX IF NOT EXISTS idx_symbols_file ON codebase_symbols(file_id);
    
    CREATE VIRTUAL TABLE IF NOT EXISTS codebase_symbols_fts USING fts5(
      name, signature, docstring,
      content='codebase_symbols',
      content_rowid='id'
    );
    
    CREATE TABLE IF NOT EXISTS codebase_dependencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      source_file_id INTEGER NOT NULL,
      target_file_id INTEGER,
      import_specifier TEXT,
      dependency_type TEXT,
      FOREIGN KEY(source_file_id) REFERENCES codebase_files(id) ON DELETE CASCADE,
      FOREIGN KEY(target_file_id) REFERENCES codebase_files(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_deps_source ON codebase_dependencies(source_file_id);
    CREATE INDEX IF NOT EXISTS idx_deps_target ON codebase_dependencies(target_file_id);
  `);
};

CodebaseIndexStore.prototype._migrateEmbeddingColumn = function(this: CodebaseIndexStoreInstance): void {
  // SQLite does not support IF NOT EXISTS for ALTER TABLE, so we check first.
  const cols = this._db!.pragma('table_info(codebase_symbols)') as { name: string }[]
  if (!cols.some(c => c.name === 'embedding')) {
    this._db!.exec('ALTER TABLE codebase_symbols ADD COLUMN embedding BLOB')
  }
};

CodebaseIndexStore.prototype.getSymbolsByFile = async function(
  this: CodebaseIndexStoreInstance,
  fileId: number
): Promise<{ id: number; name: string; docstring: string | null; is_exported: number }[]> {
  return this._db!
    .prepare('SELECT id, name, docstring, is_exported FROM codebase_symbols WHERE file_id = ?')
    .all(fileId) as { id: number; name: string; docstring: string | null; is_exported: number }[]
};

CodebaseIndexStore.prototype.storeEmbedding = async function(
  this: CodebaseIndexStoreInstance,
  symbolId: number,
  vector: Float32Array
): Promise<void> {
  this._db!
    .prepare('UPDATE codebase_symbols SET embedding = ? WHERE id = ?')
    .run(Buffer.from(vector.buffer), symbolId)
};

CodebaseIndexStore.prototype.semanticSearch = async function(
  this: CodebaseIndexStoreInstance,
  queryVector: Float32Array,
  topK: number,
  ftsQuery?: string
): Promise<import('../embeddings/embedding-provider.types').SemanticSearchResult[]> {
  type Row = {
    id: number; name: string; kind: string; signature: string | null;
    docstring: string | null; file_path: string; embedding: Buffer
  }

  const rows: Row[] = ftsQuery
    ? this._db!.prepare(`
        SELECT s.id, s.name, s.kind, s.signature, s.docstring, f.file_path, s.embedding
        FROM codebase_symbols_fts fts
        JOIN codebase_symbols s ON fts.rowid = s.id
        JOIN codebase_files f ON s.file_id = f.id
        WHERE f.project_id = ? AND fts MATCH ? AND s.embedding IS NOT NULL
        LIMIT 200
      `).all(this._projectId, ftsQuery) as Row[]
    : this._db!.prepare(`
        SELECT s.id, s.name, s.kind, s.signature, s.docstring, f.file_path, s.embedding
        FROM codebase_symbols s
        JOIN codebase_files f ON s.file_id = f.id
        WHERE f.project_id = ? AND s.embedding IS NOT NULL
      `).all(this._projectId) as Row[]

  const scored = rows.map(row => {
    const vec = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4)
    const score = cosineSimilarityBuffers(queryVector, vec)
    return { id: row.id, name: row.name, kind: row.kind, signature: row.signature,
             docstring: row.docstring, file_path: row.file_path, score }
  })

  return scored.sort((a, b) => b.score - a.score).slice(0, topK)
};

CodebaseIndexStore.prototype.rebuildFts = function(this: CodebaseIndexStoreInstance): void {
  this._db!.exec("INSERT INTO codebase_symbols_fts(codebase_symbols_fts) VALUES('rebuild')");
};

CodebaseIndexStore.prototype.upsertFile = async function(this: CodebaseIndexStoreInstance, fileData: any): Promise<number> {
  const stmt = this._db!.prepare(`
    INSERT INTO codebase_files (project_id, file_path, file_hash, language, size_bytes, last_indexed_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, file_path) DO UPDATE SET
      file_hash = excluded.file_hash,
      language = excluded.language,
      size_bytes = excluded.size_bytes,
      last_indexed_at = excluded.last_indexed_at
    RETURNING id
  `);
  
  const result = stmt.get(
    this._projectId,
    fileData.filePath,
    fileData.hash,
    fileData.language,
    fileData.sizeBytes || 0,
    Date.now()
  ) as { id: number };
  
  return result.id;
};

CodebaseIndexStore.prototype.upsertSymbols = async function(this: CodebaseIndexStoreInstance, fileId: number, symbols: any[]): Promise<void> {
  // Delete existing symbols for this file
  this._db!.prepare('DELETE FROM codebase_symbols WHERE file_id = ?').run(fileId);
  
  if (symbols.length === 0) return;
  
  const stmt = this._db!.prepare(`
    INSERT INTO codebase_symbols (
      file_id, name, kind, line_start, line_end, signature, docstring, is_exported
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const transaction = this._db!.transaction((symbolList: any[]) => {
    for (const symbol of symbolList) {
      stmt.run(
        fileId,
        symbol.name,
        symbol.kind,
        symbol.lineStart,
        symbol.lineEnd,
        symbol.signature || null,
        symbol.docstring || null,
        symbol.isExported ? 1 : 0
      );
    }
  });
  
  transaction(symbols);
};

CodebaseIndexStore.prototype.upsertDependencies = async function(this: CodebaseIndexStoreInstance, dependencies: any[]): Promise<void> {
  // Clear existing dependencies for this project
  this._db!.prepare('DELETE FROM codebase_dependencies WHERE project_id = ?').run(this._projectId);
  
  if (dependencies.length === 0) return;
  
  const stmt = this._db!.prepare(`
    INSERT INTO codebase_dependencies (
      project_id, source_file_id, target_file_id, import_specifier, dependency_type
    ) VALUES (?, ?, ?, ?, ?)
  `);
  
  const transaction = this._db!.transaction((depList: any[]) => {
    for (const dep of depList) {
      stmt.run(
        this._projectId,
        dep.sourceFileId,
        dep.targetFileId || null,
        dep.importSpecifier,
        dep.type
      );
    }
  });
  
  transaction(dependencies);
};

CodebaseIndexStore.prototype.getFileByPath = async function(this: CodebaseIndexStoreInstance, filePath: string): Promise<any> {
  // Normalize path to use forward slashes for cross-platform consistency
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  const stmt = this._db!.prepare(`
    SELECT * FROM codebase_files
    WHERE project_id = ? AND file_path = ?
  `);
  
  return stmt.get(this._projectId, normalizedPath);
};

CodebaseIndexStore.prototype.getFileByHash = async function(this: CodebaseIndexStoreInstance, hash: string): Promise<any> {
  const stmt = this._db!.prepare(`
    SELECT * FROM codebase_files
    WHERE project_id = ? AND file_hash = ?
  `);
  
  return stmt.get(this._projectId, hash);
};

CodebaseIndexStore.prototype.getAllFiles = async function(this: CodebaseIndexStoreInstance): Promise<any[]> {
  const stmt = this._db!.prepare(`
    SELECT * FROM codebase_files WHERE project_id = ?
  `);
  
  return stmt.all(this._projectId);
};

CodebaseIndexStore.prototype.query = async function(this: CodebaseIndexStoreInstance, sql: string, params: any[] = []): Promise<any> {
  const stmt = this._db!.prepare(sql);
  
  // Check if it's a SELECT query
  if (sql.trim().toUpperCase().startsWith('SELECT')) {
    return stmt.all(...params);
  } else {
    return stmt.run(...params);
  }
};

CodebaseIndexStore.prototype.getStats = async function(this: CodebaseIndexStoreInstance): Promise<{ totalFiles: number; totalSymbols: number; totalDependencies: number }> {
  const filesCount = this._db!.prepare(
    'SELECT COUNT(*) as count FROM codebase_files WHERE project_id = ?'
  ).get(this._projectId) as { count: number };
  
  const symbolsCount = this._db!.prepare(`
    SELECT COUNT(*) as count FROM codebase_symbols s
    JOIN codebase_files f ON s.file_id = f.id
    WHERE f.project_id = ?
  `).get(this._projectId) as { count: number };
  
  const depsCount = this._db!.prepare(
    'SELECT COUNT(*) as count FROM codebase_dependencies WHERE project_id = ?'
  ).get(this._projectId) as { count: number };
  
  return {
    totalFiles: filesCount.count,
    totalSymbols: symbolsCount.count,
    totalDependencies: depsCount.count
  };
};

CodebaseIndexStore.prototype.close = async function(this: CodebaseIndexStoreInstance): Promise<void> {
  if (this._db) {
    this._db.close();
    this._db = null;
  }
};
