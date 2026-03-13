/**
 * CLI Command: ai-kit code search
 * Full-text search (FTS5) or semantic vector search across indexed symbols.
 */

import { OllamaEmbeddingProvider, OpenAIEmbeddingProvider } from '@ai-agencee/engine/code-assistant/embeddings';
import { createCodebaseIndexStore } from '@ai-agencee/engine/code-assistant/storage';
import * as path from 'node:path';

type SearchOptions = {
  project?: string;
  kind?: string;
  limit?: number;
  json?: boolean;
  semantic?: boolean;
};

type SymbolRow = {
  name: string;
  kind: string;
  line_start: number;
  line_end: number;
  signature: string | null;
  file_path: string;
};

export const runCodeSearch = async function(term: string, options: SearchOptions = {}): Promise<void> {
  if (!term || term.trim() === '') {
    console.error('❌ Search term is required. Usage: ai-kit code search <term>');
    process.exit(1);
  }

  const { project = process.cwd(), kind, limit = 20, json = false, semantic = false } = options;

  const projectRoot = path.resolve(project);
  const dbPath = path.join(projectRoot, '.agents', 'code-index.db');
  const projectId = path.basename(projectRoot);

  let store: Awaited<ReturnType<typeof createCodebaseIndexStore>>;
  try {
    store = await createCodebaseIndexStore({ dbPath, projectId });
  } catch {
    console.error('❌ Could not open index. Run: ai-kit code index first.');
    process.exit(1);
  }

  try {
    if (semantic) {
      await runSemanticSearch(store, term, { kind, limit, json });
    } else {
      await runFtsSearch(store, term, { kind, limit, json });
    }
  } finally {
    await store.close();
  }
};

async function runFtsSearch(
  store: Awaited<ReturnType<typeof createCodebaseIndexStore>>,
  term: string,
  options: { kind?: string; limit: number; json: boolean }
): Promise<void> {
  const { kind, limit, json } = options;
  const kindFilter = kind ? 'AND s.kind = ?' : '';
  const params: (string | number)[] = [term, (store as any)._projectId];
  if (kind) params.push(kind);
  params.push(limit);

  const rows = (await store.query(
    `SELECT s.name, s.kind, s.line_start, s.line_end, s.signature, f.file_path
     FROM codebase_symbols_fts fts
     JOIN codebase_symbols s ON s.id = fts.rowid
     JOIN codebase_files f ON s.file_id = f.id
     WHERE codebase_symbols_fts MATCH ?
       AND f.project_id = ?
       ${kindFilter}
     ORDER BY rank
     LIMIT ?`,
    params
  )) as SymbolRow[];

  printResults(rows, term, json);
}

async function runSemanticSearch(
  store: Awaited<ReturnType<typeof createCodebaseIndexStore>>,
  term: string,
  options: { kind?: string; limit: number; json: boolean }
): Promise<void> {
  const { limit, json } = options;

  // Pick embedding provider: OpenAI if key available, else Ollama
  const provider = process.env['OPENAI_API_KEY']
    ? new (OpenAIEmbeddingProvider as any)({ apiKey: process.env['OPENAI_API_KEY'] })
    : new (OllamaEmbeddingProvider as any)()

  let queryVector: Float32Array
  try {
    const vectors = await provider.embed([term])
    queryVector = vectors[0]
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`❌ Embedding failed: ${msg}`)
    console.error('   Make sure Ollama is running (ollama serve) or set OPENAI_API_KEY.')
    process.exit(1)
  }

  const results = await (store as any).semanticSearch(queryVector, limit)

  if (results.length === 0) {
    if (json) { console.log(JSON.stringify([], null, 2)); }
    else { console.log(`🔍 No semantic results for "${term}"`); }
    process.exit(1)
  }

  if (json) {
    console.log(JSON.stringify(results, null, 2))
    return
  }

  console.log(`🔍 Found ${results.length} semantic result(s) for "${term}"\n`)
  for (const r of results) {
    const score = (r.score as number).toFixed(3)
    const sig   = r.signature ? `  ${r.signature}` : ''
    console.log(`  [${r.kind}] ${r.name}  (score: ${score})`)
    console.log(`          ${r.file_path}${sig}`)
    console.log()
  }
}

function printResults(rows: SymbolRow[], term: string, json: boolean): void {
  if (rows.length === 0) {
    if (json) { console.log(JSON.stringify([], null, 2)); }
    else { console.log(`🔍 No results for "${term}"`); }
    process.exit(1);
  }

  if (json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log(`🔍 Found ${rows.length} result(s) for "${term}"\n`);
  for (const row of rows) {
    const location = `${row.file_path}:${row.line_start}`;
    const signature = row.signature ? `  ${row.signature}` : '';
    console.log(`  [${row.kind}] ${row.name}`);
    console.log(`          ${location}${signature}`);
    console.log();
  }
}
