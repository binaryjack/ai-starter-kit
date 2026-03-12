/**
 * Type definitions for Codebase Indexer
 */

import type { FileParseResult } from '../parsers/parser-protocol.types'

export type { FileParseResult } from '../parsers/parser-protocol.types'

export type CodebaseIndexerOptions = {
  projectRoot: string;
  indexStore: any; // CodebaseIndexStore
  parserRegistry: any; // ParserRegistry
  embeddingProvider?: any; // EmbeddingProvider
  modelRouter?: any; // ModelRouter
  auditLog?: any; // AuditLog
};

export type CodebaseIndexerInstance = {
  _projectRoot: string;
  _indexStore: any;
  _parserRegistry: any;
  _embeddingProvider?: any;
  _modelRouter?: any;
  _auditLog?: any;
  _state: {
    indexedFiles: Set<string>;
    symbolCache: Map<string, Symbol[]>;
    depGraph: DependencyGraph | null;
  };
  indexProject(options?: IndexProjectOptions): Promise<IndexResult>;
  _discoverFiles(options: { extensions: string[]; exclude: string[] }): Promise<string[]>;
  _detectChanges(files: string[]): Promise<string[]>;
  _parseFile(filePath: string): Promise<FileParseResult | null>;
  _buildDepGraph(parseResults: FileParseResult[]): Promise<DependencyGraph>;
  _getExtensions(languages: string[]): string[];
  _detectLanguage(filePath: string): string;
  _hashContent(content: string): string;
  _resolveImport(fromFile: string, specifier: string, fileIdByPath: Map<string, number>): string | null;
  _extractEmbeddingTargets(parseResults: FileParseResult[]): Array<{ symbolId?: number; text: string }>;
  _computeHash(content: string): string;
};

export type IndexProjectOptions = {
  incremental?: boolean;
  languages?: string[];
  excludePatterns?: string[];
  budgetCap?: number;
};

export type IndexResult = {
  filesIndexed: number;
  symbolsExtracted: number;
  dependenciesTracked: number;
  embeddingsGenerated?: number;
  cost: number;
  duration: number;
  errors?: string[];
};

export type Symbol = {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'method';
  lineStart: number;
  lineEnd: number;
  signature?: string;
  docstring?: string;
  isExported: boolean;
  methods?: string[];
};

export type Import = {
  specifier: string;
  type: 'local' | 'npm' | 'builtin';
  names: string[];
};

export type Export = {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable';
};

export type DependencyGraph = {
  nodes: string[];
  edges: DependencyEdge[];
};

export type DependencyEdge = {  source: string;
  target: string;
  importSpecifier: string;
  type: 'local' | 'npm' | 'builtin';
};
