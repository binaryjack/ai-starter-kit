/**
 * Type definitions for Codebase Index Store
 */

import type Database from 'better-sqlite3';

export type CodebaseIndexStoreOptions = {
  dbPath: string;
  projectId: string;
};

export type CodebaseIndexStoreInstance = {
  _db: Database.Database | null;
  _projectId: string;
  _dbPath: string;
  initialize(): Promise<void>;
  _createTables(): Promise<void>;
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
};

export type FileRecord = {
  id: number;
  projectId: string;
  filePath: string;
  fileHash: string;
  language: string;
  sizeBytes: number;
  lastIndexedAt: number;
};

export type SymbolRecord = {
  id: number;
  fileId: number;
  name: string;
  kind: string;
  lineStart: number;
  lineEnd: number;
  signature?: string;
  docstring?: string;
  isExported: boolean;
};

export type DependencyRecord = {
  id: number;
  projectId: string;
  sourceFileId: number;
  targetFileId?: number;
  importSpecifier: string;
  dependencyType: 'local' | 'npm' | 'builtin';
};
