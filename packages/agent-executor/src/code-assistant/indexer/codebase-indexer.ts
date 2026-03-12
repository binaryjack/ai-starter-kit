/**
 * Codebase Indexer - Main orchestrator for indexing projects
 * Discovers files, parses them, extracts symbols and dependencies
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import { glob } from 'glob';
import * as path from 'path';
import type { CodebaseIndexerInstance, CodebaseIndexerOptions, DependencyGraph, FileParseResult, IndexProjectOptions, IndexResult } from './codebase-indexer.types';

export const CodebaseIndexer = function(this: CodebaseIndexerInstance, options: CodebaseIndexerOptions) {
  const {
    projectRoot,
    indexStore,
    parserRegistry,
    embeddingProvider,
    modelRouter,
    auditLog
  } = options;
  
  Object.defineProperty(this, '_projectRoot', {
    enumerable: false,
    value: projectRoot
  });
  
  Object.defineProperty(this, '_indexStore', {
    enumerable: false,
    value: indexStore
  });
  
  Object.defineProperty(this, '_parserRegistry', {
    enumerable: false,
    value: parserRegistry
  });
  
  Object.defineProperty(this, '_embeddingProvider', {
    enumerable: false,
    value: embeddingProvider
  });
  
  Object.defineProperty(this, '_modelRouter', {
    enumerable: false,
    value: modelRouter
  });
  
  Object.defineProperty(this, '_auditLog', {
    enumerable: false,
    value: auditLog
  });
  
  Object.defineProperty(this, '_state', {
    enumerable: false,
    value: {
      indexedFiles: new Set(),
      symbolCache: new Map(),
      depGraph: null
    }
  });
};

CodebaseIndexer.prototype.indexProject = async function(this: CodebaseIndexerInstance, options: IndexProjectOptions = {}): Promise<IndexResult> {
  const startTime = Date.now();
  
  const {
    incremental = true,
    languages = ['typescript', 'javascript', 'python'],
    excludePatterns = ['node_modules', 'dist', 'build', '.git', 'coverage'],
    budgetCap = Infinity
  } = options;
  
  let totalCost = 0;
  
  // Phase 1: File discovery
  const files = await this._discoverFiles({
    extensions: this._getExtensions(languages),
    exclude: excludePatterns
  });
  
  // Phase 2: Incremental check
  const filesToIndex = incremental
    ? await this._detectChanges(files)
    : files;
  
  if (filesToIndex.length === 0) {
    return {
      filesIndexed: 0,
      symbolsExtracted: 0,
      dependenciesTracked: 0,
      cost: 0,
      duration: (Date.now() - startTime) / 1000
    };
  }
  
  // Phase 3: Parse files in parallel
  const parseResults = [];
  const errors = [];
  
  for (const filePath of filesToIndex) {
    try {
      const result = await this._parseFile(filePath);
      if (result) {
        parseResults.push(result);
      }
    } catch (error: any) {
      errors.push(`${filePath}: ${error?.message || 'Unknown error'}`);
    }
  }
  
  // Phase 4: Store symbols
  let totalSymbols = 0;
  
  for (const result of parseResults) {
    const fileId = await this._indexStore.upsertFile({
      filePath: result.filePath,
      hash: result.hash,
      language: result.language,
      sizeBytes: result.sizeBytes
    });
    
    await this._indexStore.upsertSymbols(fileId, result.symbols);
    totalSymbols += result.symbols.length;
  }
  
  // Phase 5: Build dependency graph
  const depGraph = await this._buildDepGraph(parseResults);
  
  // Transform edges for database storage
  const dbEdges = depGraph.edges.map(e => ({
    sourceFileId: parseInt(e.source),
    targetFileId: e.target ? parseInt(e.target) : null,
    importSpecifier: e.importSpecifier,
    type: e.type
  }));
  
  await this._indexStore.upsertDependencies(dbEdges);
  
  // Phase 6: Generate embeddings (if provider available and under budget)
  let embeddingsGenerated = 0;
  
  if (this._embeddingProvider && totalCost < budgetCap) {
    // Extract embedding targets (function names, docstrings)
    const embeddingTargets = this._extractEmbeddingTargets(parseResults);
    
    // TODO: Implement embedding generation
    // This would use the embedding provider to generate vectors
    // and store them in the database
  }
  
  // Phase 7: Audit log
  if (this._auditLog) {
    this._auditLog.write({
      event: 'codebase-indexed',
      filesProcessed: filesToIndex.length,
      symbolsExtracted: totalSymbols,
      cost: totalCost,
      errors: errors.length
    });
  }
  
  return {
    filesIndexed: filesToIndex.length,
    symbolsExtracted: totalSymbols,
    dependenciesTracked: depGraph.edges.length,
    embeddingsGenerated,
    cost: totalCost,
    duration: (Date.now() - startTime) / 1000,
    errors: errors.length > 0 ? errors : undefined
  };
};

CodebaseIndexer.prototype._discoverFiles = async function(this: CodebaseIndexerInstance, options: { extensions: string[]; exclude: string[] }): Promise<string[]> {
  const { extensions, exclude } = options;
  
  const patterns = extensions.map(ext => `**/*.${ext}`);
  const ignorePatterns = exclude.map(pattern => `**/${pattern}/**`);
  
  const files = await glob(patterns, {
    cwd: this._projectRoot,
    ignore: ignorePatterns,
    absolute: false,
    nodir: true
  });
  
  // Normalize paths to use forward slashes for cross-platform consistency
  return files.map(file => file.replace(/\\/g, '/'));
};

CodebaseIndexer.prototype._detectChanges = async function(this: CodebaseIndexerInstance, files: string[]): Promise<string[]> {
  const changed = [];
  
  for (const filePath of files) {
    const fullPath = path.join(this._projectRoot, filePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const hash = this._hashContent(content);
    
    // Check if file exists in index with same hash
    const existing = await this._indexStore.getFileByPath(filePath);
    
    if (!existing || existing.file_hash !== hash) {
      changed.push(filePath);
    }
  }
  
  return changed;
};

CodebaseIndexer.prototype._parseFile = async function(this: CodebaseIndexerInstance, filePath: string): Promise<FileParseResult | null> {
  const fullPath = path.join(this._projectRoot, filePath);
  const content = await fs.readFile(fullPath, 'utf-8');
  const hash = this._hashContent(content);
  const stats = await fs.stat(fullPath);
  
  // Get parser for this file
  const parser = this._parserRegistry.getParser(filePath);
  if (!parser) {
    return null;
  }
  
  // Parse
  const ast = await parser.parse(content, { filePath });
  
  // Extract symbols
  const symbols = await parser.extractSymbols(ast);
  const imports = await parser.extractImports(ast);
  const exports = await parser.extractExports(ast);
  
  // Detect language
  const language = this._detectLanguage(filePath);
  
  return {
    filePath,
    hash,
    symbols,
    imports,
    exports,
    language,
    sizeBytes: stats.size
  };
};

CodebaseIndexer.prototype._buildDepGraph = async function(this: CodebaseIndexerInstance, parseResults: FileParseResult[]): Promise<DependencyGraph> {
  const edges = [];
  const fileIdByPath = new Map();
  
  // Get file IDs
  for (const result of parseResults) {
    const file = await this._indexStore.getFileByPath(result.filePath);
    if (file) {
      fileIdByPath.set(result.filePath, file.id);
    }
  }
  
  // Build edges from imports
  for (const result of parseResults) {
    const sourceFileId = fileIdByPath.get(result.filePath);
    if (!sourceFileId) continue;
    
    for (const imp of result.imports) {
      let targetFileId = null;
      
      // Resolve local imports
      if (imp.type === 'local') {
        const resolvedPath = this._resolveImport(result.filePath, imp.specifier, fileIdByPath);
        targetFileId = fileIdByPath.get(resolvedPath || '');
      }
      
      edges.push({
        source: String(sourceFileId),
        target: targetFileId ? String(targetFileId) : '',
        importSpecifier: imp.specifier,
        type: imp.type
      });
    }
  }
  
  return {
    nodes: Array.from(fileIdByPath.keys()),
    edges
  };
};

CodebaseIndexer.prototype._resolveImport = function(this: CodebaseIndexerInstance, fromFile: string, specifier: string, fileIdByPath: Map<string, number>): string | null {
  // Simple resolution (can be enhanced)
  if (!specifier.startsWith('.')) {
    return null; // External package
  }
  
  const fromDir = path.dirname(fromFile);
  let resolved = path.normalize(path.join(fromDir, specifier));
  
  // Try adding extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py'];
  for (const ext of extensions) {
    const withExt = resolved + ext;
    if (fileIdByPath.has(withExt)) {
      return withExt;
    }
  }
  
  // Try index files
  for (const ext of extensions) {
    const indexFile = path.join(resolved, `index${ext}`);
    if (fileIdByPath.has(indexFile)) {
      return indexFile;
    }
  }
  
  return null;
};

CodebaseIndexer.prototype._extractEmbeddingTargets = function(this: CodebaseIndexerInstance, parseResults: FileParseResult[]): Array<{ symbolId?: number; text: string }> {
  const targets = [];
  
  for (const result of parseResults) {
    for (const symbol of result.symbols) {
      // Only embed exported symbols with docstrings
      if (symbol.isExported && symbol.docstring) {
        targets.push({
          text: `${symbol.name}: ${symbol.docstring}`
        });
      }
    }
  }
  
  return targets;
};

CodebaseIndexer.prototype._hashContent = function(this: CodebaseIndexerInstance, content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
};

CodebaseIndexer.prototype._getExtensions = function(this: CodebaseIndexerInstance, languages: string[]): string[] {
  const extensionMap: Record<string, string[]> = {
    typescript: ['ts', 'tsx'],
    javascript: ['js', 'jsx', 'mjs'],
    python: ['py'],
    java: ['java'],
    go: ['go'],
    rust: ['rs']
  };
  
  return languages.flatMap(lang => extensionMap[lang] || []);
};

CodebaseIndexer.prototype._detectLanguage = function(this: CodebaseIndexerInstance, filePath: string): string {
  const ext = path.extname(filePath).slice(1);
  
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    py: 'python',
    java: 'java',
    go: 'go',
    rs: 'rust'
  };
  
  return languageMap[ext] || 'unknown';
};
