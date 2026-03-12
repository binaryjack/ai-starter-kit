#!/usr/bin/env node
/**
 * E14 Code Assistant Demo
 * 
 * Demonstrates the complete code indexing and search workflow:
 * 1. Index TypeScript/JavaScript files in the project
 * 2. Extract symbols (classes, functions, interfaces)
 * 3. Build dependency graph
 * 4. Perform full-text search
 */

const path = require('path');
const { createCodebaseIndexStore } = require('../dist/code-assistant/storage/create-codebase-index-store');
const { createCodebaseIndexer } = require('../dist/code-assistant/indexer/create-codebase-indexer');
const { createParserRegistry } = require('../dist/code-assistant/parsers/create-parser-registry');
const { createTypeScriptParser } = require('../dist/code-assistant/parsers/create-typescript-parser');

async function demo() {
  console.log('🚀 E14 Code Assistant Demo\n');
  
  // Configuration
  const projectRoot = path.join(__dirname, '..');
  const dbPath = path.join(projectRoot, '.agents', 'demo-code-index.db');
  const projectId = 'agent-executor-demo';

  try {
    // Step 1: Initialize components
    console.log('📦 Initializing components...');
    const indexStore = await createCodebaseIndexStore({
      dbPath,
      projectId
    });

    const parserRegistry = createParserRegistry({});
    const tsParser = createTypeScriptParser({ language: 'typescript' });
    parserRegistry.registerParser('typescript', tsParser);
    parserRegistry.registerParser('javascript', tsParser);

    const indexer = createCodebaseIndexer({
      projectRoot,
      indexStore,
      parserRegistry
    });

    console.log('✅ Components initialized\n');

    // Step 2: Index the codebase
    console.log('🔍 Indexing code-assistant module...');
    const startTime = Date.now();
    
    const result = await indexer.indexProject({
      languages: ['typescript'],
      excludePatterns: ['node_modules', 'dist', '__tests__', '__test__'],
      incremental: false
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n📊 Indexing Results:');
    console.log(`   Files indexed: ${result.filesIndexed}`);
    console.log(`   Symbols extracted: ${result.symbolsExtracted}`);
    console.log(`   Dependencies tracked: ${result.dependenciesTracked}`);
    console.log(`   Duration: ${duration}s`);
    
    if (result.errors && result.errors.length > 0) {
      console.log(`   ⚠️  Errors: ${result.errors.length}`);
      result.errors.slice(0, 3).forEach(err => console.log(`      - ${err}`));
    }

    // Step 3: Get database statistics
    console.log('\n📈 Database Statistics:');
    const stats = await indexStore.getStats();
    console.log(`   Total files: ${stats.totalFiles}`);
    console.log(`   Total symbols: ${stats.totalSymbols}`);
    console.log(`   Total dependencies: ${stats.totalDependencies}`);

    // Step 4: Query some files
    console.log('\n📂 Sample Files:');
    const allFiles = await indexStore.getAllFiles();
    allFiles.slice(0, 5).forEach(file => {
      console.log(`   - ${file.file_path} (${file.language})`);
    });
    if (allFiles.length > 5) {
      console.log(`   ... and ${allFiles.length - 5} more`);
    }

    // Step 5: Demonstrate file lookup
    console.log('\n🔎 File Lookup Demo:');
    const indexerFile = await indexStore.getFileByPath('src/code-assistant/indexer/codebase-indexer.ts');
    if (indexerFile) {
      console.log(`   Found: ${indexerFile.file_path}`);
      console.log(`   Hash: ${indexerFile.file_hash.substring(0, 12)}...`);
      console.log(`   Size: ${indexerFile.size_bytes} bytes`);
    }

    // Step 6: Full-text search demo
    console.log('\n🔍 Full-Text Search Demo:');
    const searchResults = await indexStore.query(`
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
    `, ['indexer OR parser']);

    if (searchResults && searchResults.length > 0) {
      console.log(`   Found ${searchResults.length} matches:`);
      searchResults.forEach(result => {
        console.log(`   - ${result.kind} "${result.name}" in ${result.file_path}:${result.line_start}`);
      });
    }

    // Cleanup
    await indexStore.close();
    console.log('\n✅ Demo complete!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run demo
demo();
