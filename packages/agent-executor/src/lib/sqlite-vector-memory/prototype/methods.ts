import * as fs from 'fs'
import * as path from 'path'
import type { Embedding, SearchOptions, SearchResult, StoreOptions } from '../../vector-memory.js'
import { ISqliteVectorMemory } from '../sqlite-vector-memory.js'

// ─── Module helpers ──────────────────────────────────────────────────────────

export function _toFloat32(emb: Embedding): Float32Array {
  return emb instanceof Float32Array ? emb : new Float32Array(emb);
}

export function _cosineSim(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < len; i++) {
    dot   += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── ISqliteVectorMemory methods ─────────────────────────────────────────────

export function _open(this: ISqliteVectorMemory): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3');
    const dir = path.dirname(this._dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this._db = new Database(this._dbPath);
    this._db.pragma('journal_mode = WAL');
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS vectors (
        store      TEXT    NOT NULL,
        id         TEXT    NOT NULL,
        content    TEXT,
        embedding  BLOB    NOT NULL,
        metadata   TEXT    NOT NULL DEFAULT '{}',
        created_at TEXT    NOT NULL,
        PRIMARY KEY (store, id)
      );
      CREATE INDEX IF NOT EXISTS idx_vectors_store ON vectors(store);
    `);
  } catch {
    this._db = null;
  }
}

export async function store(
  this: ISqliteVectorMemory,
  id: string,
  embedding: Embedding,
  options: StoreOptions = {},
): Promise<void> {
  const emb  = _toFloat32(embedding);
  const blob = Buffer.from(emb.buffer);
  const payload = {
    store:      this._namespace,
    id,
    content:    options.text ?? null,
    embedding:  blob,
    metadata:   JSON.stringify(options.metadata ?? {}),
    created_at: new Date().toISOString(),
  };

  if (this._db) {
    this._db
      .prepare(
        `INSERT OR REPLACE INTO vectors (store, id, content, embedding, metadata, created_at)
         VALUES (@store, @id, @content, @embedding, @metadata, @created_at)`,
      )
      .run(payload);

    const count: number = (
      this._db
        .prepare('SELECT COUNT(*) as n FROM vectors WHERE store = ?')
        .get(this._namespace) as { n: number }
    ).n;
    if (count > this._maxEntries) {
      this._db
        .prepare(
          `DELETE FROM vectors WHERE store = ? AND id IN (
             SELECT id FROM vectors WHERE store = ? ORDER BY created_at ASC LIMIT ?
           )`,
        )
        .run(this._namespace, this._namespace, count - this._maxEntries);
    }
  }
}

export async function search(
  this: ISqliteVectorMemory,
  query: Embedding,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const topK     = options.topK     ?? 5;
  const minScore = options.minScore ?? 0.0;
  const ns       = options.namespace ?? this._namespace;

  if (!this._db) return [];

  const rows: Array<{
    id: string;
    embedding: Buffer;
    metadata: string;
    content: string | null;
    created_at: string;
  }> = this._db
    .prepare('SELECT id, embedding, metadata, content, created_at FROM vectors WHERE store = ?')
    .all(ns);

  if (rows.length === 0) return [];

  const queryVec = _toFloat32(query);
  const scored = rows
    .map((row) => {
      const vec   = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
      const score = _cosineSim(queryVec, vec);
      return {
        id:        row.id,
        score,
        metadata:  JSON.parse(row.metadata) as Record<string, unknown>,
        text:      row.content ?? undefined,
        storedAt:  row.created_at,
      };
    })
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

export async function deleteEntry(this: ISqliteVectorMemory, id: string): Promise<void> {
  this._db?.prepare('DELETE FROM vectors WHERE store = ? AND id = ?').run(this._namespace, id);
}

export async function clear(this: ISqliteVectorMemory, namespace?: string): Promise<void> {
  const ns = namespace ?? this._namespace;
  this._db?.prepare('DELETE FROM vectors WHERE store = ?').run(ns);
}

export async function size(this: ISqliteVectorMemory, namespace?: string): Promise<number> {
  const ns = namespace ?? this._namespace;
  if (!this._db) return 0;
  const row = this._db.prepare('SELECT COUNT(*) as n FROM vectors WHERE store = ?').get(ns) as { n: number };
  return row.n;
}

export function close(this: ISqliteVectorMemory): void {
  this._db?.close();
  this._db = null;
}

export function instanceToFloat32(this: ISqliteVectorMemory, emb: Embedding): Float32Array {
  return _toFloat32(emb);
}

export function instanceCosineSim(this: ISqliteVectorMemory, a: Float32Array, b: Float32Array): number {
  return _cosineSim(a, b);
}
