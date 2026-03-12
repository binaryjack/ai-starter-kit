# E14 Code Assistant - Quick Start Guide

## Installation

E14 is part of `@ai-agencee/engine` package:

```bash
pnpm install @ai-agencee/engine
```

## Basic Usage

### 1. Index a Codebase

```typescript
import { createCodebaseIndexer, createCodebaseIndexStore, createParserRegistry, createTypeScriptParser } from '@ai-agencee/engine';

// Create index store
const indexStore = await createCodebaseIndexStore({
  dbPath: '.agents/code-index.db',
  projectId: 'my-project'
});

// Create parser registry
const parserRegistry = createParserRegistry({});
const tsParser = createTypeScriptParser({ language: 'typescript' });
parserRegistry.registerParser('typescript', tsParser);
parserRegistry.registerParser('javascript', tsParser);

// Create indexer
const indexer = createCodebaseIndexer({
  projectRoot: process.cwd(),
  indexStore,
  parserRegistry
});

// Index the project
const result = await indexer.indexProject({
  languages: ['typescript', 'javascript'],
  excludePatterns: ['node_modules', 'dist', 'build'],
  incremental: false  // Set to true to only index changed files
});

console.log(`✅ Indexed ${result.filesIndexed} files in ${result.duration}s`);
```

### 2. Query Indexed Files

```typescript
// Get file by path
const file = await indexStore.getFileByPath('src/index.ts');
console.log(file); // { id, file_path, file_hash, language, ... }

// Get all files
const allFiles = await indexStore.getAllFiles();

// Get statistics
const stats = await indexStore.getStats();
console.log(stats); // { totalFiles, totalSymbols, totalDependencies }
```

### 3. Search Symbols

```typescript
// Full-text search for symbols
const results = await indexStore.query(`
  SELECT 
    s.name,
    s.kind,
    f.file_path,
    s.line_start
  FROM codebase_symbols_fts 
  JOIN codebase_symbols s ON codebase_symbols_fts.rowid = s.id
  JOIN codebase_files f ON s.file_id = f.id
  WHERE codebase_symbols_fts MATCH ?
  LIMIT 10
`, ['createIndexer']);

results.forEach(r => {
  console.log(`${r.kind} "${r.name}" in ${r.file_path}:${r.line_start}`);
});
```

### 4. Incremental Indexing

```typescript
// Only re-index files that have changed
const result = await indexer.indexProject({
  languages: ['typescript'],
  excludePatterns: ['node_modules'],
  incremental: true  // ⚡ Only indexes changed files
});

if (result.filesIndexed === 0) {
  console.log('✨ No changes detected, index is up to date');
}
```

## API Reference

### `createCodebaseIndexStore(options)`

Creates a SQLite-backed storage for code index.

**Options:**
- `dbPath` (string): Path to SQLite database file
- `projectId` (string): Unique identifier for this project

**Returns:** `Promise<CodebaseIndexStoreInstance>`

**Methods:**
- `getFileByPath(filePath: string)` - Retrieve file record
- `getFileByHash(hash: string)` - Find file by content hash
- `getAllFiles()` - Get all indexed files
- `getStats()` - Get database statistics
- `query(sql: string, params: any[])` - Run custom SQL query
- `close()` - Close database connection

### `createCodebaseIndexer(options)`

Creates the main indexing orchestrator.

**Options:**
- `projectRoot` (string): Absolute path to project root
- `indexStore` (CodebaseIndexStoreInstance): Storage instance
- `parserRegistry` (ParserRegistryInstance): Parser registry

**Returns:** `CodebaseIndexerInstance`

**Methods:**
- `indexProject(options)` - Index the codebase
  - `languages` (string[]): Languages to index (e.g., `['typescript', 'javascript']`)
  - `excludePatterns` (string[]): Directories/patterns to exclude
  - `incremental` (boolean): Only index changed files

### `createParserRegistry(options)`

Creates a registry for language parsers.

**Returns:** `ParserRegistryInstance`

**Methods:**
- `registerParser(language: string, parser: Parser)` - Register a parser
- `getParser(filePathOrLanguage: string)` - Get parser by language or file extension
- `hasParser(language: string)` - Check if parser exists
- `getSupportedLanguages()` - Get list of supported languages

### `createTypeScriptParser(options)`

Creates a TypeScript/JavaScript parser.

**Options:**
- `language` (string): 'typescript' or 'javascript'

**Returns:** `Parser`

## Common Patterns

### Pattern 1: First-time Indexing

```typescript
// Full index on first run
const result = await indexer.indexProject({
  languages: ['typescript'],
  excludePatterns: ['node_modules', 'dist'],
  incremental: false
});
```

### Pattern 2: Watch Mode

```typescript
import chokidar from 'chokidar';

// Watch for file changes
const watcher = chokidar.watch('src/**/*.ts', {
  ignored: /(^|[\/\\])\../, // ignore dotfiles
});

watcher.on('change', async (path) => {
  console.log(`File ${path} changed, re-indexing...`);
  await indexer.indexProject({
    languages: ['typescript'],
    incremental: true
  });
});
```

### Pattern 3: Search by Symbol Kind

```typescript
// Find all classes
const classes = await indexStore.query(`
  SELECT s.name, f.file_path 
  FROM codebase_symbols s
  JOIN codebase_files f ON s.file_id = f.id
  WHERE s.kind = 'class'
`, []);

// Find all async functions
const asyncFunctions = await indexStore.query(`
  SELECT s.name, s.signature, f.file_path
  FROM codebase_symbols s
  JOIN codebase_files f ON s.file_id = f.id
  WHERE s.kind = 'function' AND s.signature LIKE '%async%'
`, []);
```

### Pattern 4: Dependency Analysis

```typescript
// Find all files that import a specific module
const importers = await indexStore.query(`
  SELECT DISTINCT f.file_path
  FROM codebase_dependencies d
  JOIN codebase_files f ON d.source_file_id = f.id
  WHERE d.import_specifier LIKE ?
`, ['%utils/helpers%']);

// Find all external dependencies
const externalDeps = await indexStore.query(`
  SELECT DISTINCT import_specifier
  FROM codebase_dependencies
  WHERE target_file_id IS NULL
`, []);
```

## Performance Tips

1. **Use incremental indexing** - After initial index, set `incremental: true`
2. **Exclude build artifacts** - Add `dist`, `build`, `node_modules` to `excludePatterns`
3. **Close connections** - Always call `indexStore.close()` when done
4. **Use FTS5 wisely** - Full-text search is fast but use SQL filters when possible
5. **Batch operations** - Index multiple languages in one call rather than separately

## Troubleshooting

### "Cannot find module" errors
Make sure you've built the project:
```bash
pnpm build
```

### Database locked errors
Only one connection can write at a time. Ensure you're not running multiple indexing operations simultaneously.

### Slow indexing
- Check if you're excluding `node_modules` and build directories
- Use `incremental: true` for subsequent runs
- Consider indexing fewer languages if you don't need all of them

### Path not found on Windows
Paths are automatically normalized. If you're still seeing issues, ensure you're using forward slashes in queries:
```typescript
// ✅ Good
await indexStore.getFileByPath('src/index.ts');

// ❌ Avoid
await indexStore.getFileByPath('src\\index.ts');
```

## Demo Script

Run the included demo:
```bash
cd packages/agent-executor
node scripts/demo-code-assistant.js
```

## Next Steps

- Read [E14-CODE-ASSISTANT.md](./E14-CODE-ASSISTANT.md) for architecture details
- Check out [integration tests](../src/code-assistant/__tests__/code-assistant.integration.test.ts) for examples
- Explore the [parser implementation](../src/code-assistant/parsers/typescript-parser.ts)

## Questions?

File an issue or check the test files for usage examples!
