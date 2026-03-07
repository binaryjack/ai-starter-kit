# Vector Memory & Cross-Run Learning

**Status**: ✅ Implemented | **Priority**: P1 | **Roadmap**: G-24/25  
**Related**: DAG Orchestration, Check Handlers, Provider Configuration

## Overview

`VectorMemory` provides **in-process semantic memory** using cosine similarity search over `Float32Array` embeddings. It enables agents to retrieve relevant context from previous runs, accumulated knowledge bases, or embedded documentation — without requiring a vector database.

For production scale, `SqliteVectorMemory` persists entries to an SQLite file with full-text fallback search.

---

## Key Capabilities

- **Zero external dependencies** — pure `Float32Array` arithmetic (in-memory store)
- **SQLite persistence** — optional durable store via `SqliteVectorMemory`
- **Namespace isolation** — one store per lane, agent, or run
- **Cosine similarity search** — `topK` results with `minScore` threshold
- **Metadata filtering** — arbitrary key/value metadata on every entry
- **Serialization** — JSON round-trip for backup and cross-process transfer
- **LLM embedding integration** — use `LLMProvider.embed()` when available; falls back to zero-vector stubs

---

## Quick Start

```typescript
import { VectorMemory } from '@ai-agencee/engine'

const mem = new VectorMemory({ namespace: 'backend-lane' })

// Store an entry
await mem.store('auth-service', embeddingVector, {
  metadata: { source: 'openapi.yaml', section: 'auth' },
  text:     'Authentication service handles JWT validation',
})

// Search
const results = await mem.search(queryEmbedding, { topK: 3, minScore: 0.7 })
for (const r of results) {
  console.log(`[${r.score.toFixed(3)}] ${r.text}`)
}
```

---

## In-Memory Store

```typescript
import { VectorMemory } from '@ai-agencee/engine'

const mem = new VectorMemory({
  namespace:  'my-agent',
  maxEntries: 5_000,        // evict oldest when exceeded (default: 10 000)
})

// Store
await mem.store(id, embedding, { metadata: { tag: 'api' }, text: 'snippet' })

// Search
const hits = await mem.search(queryEmbedding, { topK: 5, minScore: 0.65 })

// Delete
await mem.delete(id)

// Clear namespace
await mem.clear()

// Serialize to JSON for persistence
const snapshot = mem.serialize()
await fs.writeFile('memory.json', JSON.stringify(snapshot))

// Restore
const restored = VectorMemory.fromJSON(snapshot)
```

---

## SQLite Persistent Store

```typescript
import { SqliteVectorMemory } from '@ai-agencee/engine'

const mem = new SqliteVectorMemory({
  dbPath:    '.agents/memory/backend.db',
  namespace: 'backend-lane',
})

await mem.store(id, embedding, { metadata, text })
const results = await mem.search(queryEmbedding, { topK: 5 })

await mem.close()
```

SQLite store supports:
- Full cross-run persistence (survives process restarts)
- Metadata JSON indexed for fast filtering
- Full-text fallback search on `text` column when embeddings are not available

---

## API Reference

### `VectorMemory`

```typescript
class VectorMemory {
  constructor(options?: VectorMemoryOptions)

  store(id: string, embedding: Embedding, options?: StoreOptions): Promise<void>
  search(query: Embedding, options?: SearchOptions): Promise<SearchResult[]>
  delete(id: string): Promise<boolean>
  clear(): Promise<void>
  size(): number

  serialize(): SerializedMemory
  static fromJSON(data: SerializedMemory): VectorMemory
}
```

### Types

```typescript
type Embedding = number[] | Float32Array

interface VectorMemoryOptions {
  namespace?:  string;   // Default: 'default'
  maxEntries?: number;   // Default: 10 000
}

interface StoreOptions {
  metadata?: Record<string, unknown>;
  text?:     string;
}

interface SearchOptions {
  topK?:      number;   // Default: 5
  minScore?:  number;   // Default: 0.0 (0–1 range)
  namespace?: string;   // Default: current namespace
}

interface SearchResult {
  id:        string;
  score:     number;
  metadata:  Record<string, unknown>;
  text?:     string;
  storedAt:  string;
}

interface MemoryEntry {
  id:        string;
  namespace: string;
  embedding: Float32Array;
  metadata:  Record<string, unknown>;
  text?:     string;
  storedAt:  string;
}
```

---

## Using Embeddings with LLM Providers

When an `LLMProvider` exposes an `embed()` method, you can generate embeddings directly:

```typescript
import { AnthropicProvider, VectorMemory } from '@ai-agencee/engine'

const provider = new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
const mem = new VectorMemory({ namespace: 'project-docs' })

// Embed and store documentation chunks
for (const chunk of docChunks) {
  const embedding = await provider.embed(chunk.text)
  await mem.store(chunk.id, embedding, { text: chunk.text, metadata: { file: chunk.file } })
}

// Embed query and search
const queryEmbedding = await provider.embed('How does authentication work?')
const results = await mem.search(queryEmbedding, { topK: 3, minScore: 0.75 })
```

---

## Cross-Run Knowledge Accumulation

Use `SqliteVectorMemory` pointed at a shared database to accumulate knowledge across multiple DAG runs:

```typescript
const sharedMem = new SqliteVectorMemory({ dbPath: '.agents/shared-knowledge.db' })

// In each run: store findings
await sharedMem.store(findingId, embedding, { metadata: { runId, date: new Date().toISOString() }, text: finding })

// In future runs: retrieve relevant past findings
const priorArt = await sharedMem.search(queryEmbedding, { topK: 10 })
```

---

## Related Features

- [DAG Orchestration](./01-dag-orchestration.md) — Per-lane namespace isolation
- [Provider Configuration](./23-provider-config.md) — LLM providers with `embed()` support
- [Check Handlers](./04-check-handlers.md) — `llm-tool` checks that benefit from memory context

---

**Last Updated**: March 7, 2026  
**Roadmap**: G-24/25 — Vector Memory & Cross-Run Learning  
**Implementation**: `packages/agent-executor/src/lib/vector-memory.ts`, `sqlite-vector-memory.ts`
