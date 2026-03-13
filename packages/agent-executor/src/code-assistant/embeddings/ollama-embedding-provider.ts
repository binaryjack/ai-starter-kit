/**
 * Ollama Embedding Provider
 *
 * Calls POST /api/embeddings on a local Ollama instance.
 * Default model: nomic-embed-text (768 dimensions).
 * Requests are made sequentially (Ollama doesn't batch natively).
 */

import type { EmbeddingProvider, EmbeddingVector, OllamaEmbeddingProviderOptions } from './embedding-provider.types'

export type OllamaEmbeddingProviderInstance = EmbeddingProvider & {
  _model:   string
  _baseURL: string
  _embedOne(text: string): Promise<EmbeddingVector>
}

export const OllamaEmbeddingProvider = function(
  this: OllamaEmbeddingProviderInstance,
  options: OllamaEmbeddingProviderOptions = {}
) {
  const {
    model   = 'nomic-embed-text',
    baseURL = 'http://localhost:11434',
  } = options

  Object.defineProperty(this, '_model',   { enumerable: false, value: model })
  Object.defineProperty(this, '_baseURL', { enumerable: false, value: baseURL })
  Object.defineProperty(this, 'model',    { enumerable: true,  value: model })
  // nomic-embed-text is 768 dims; mxbai-embed-large is 1024
  Object.defineProperty(this, 'dimensions', {
    enumerable: true,
    value: model.includes('large') ? 1024 : 768,
  })
} as unknown as new (options?: OllamaEmbeddingProviderOptions) => OllamaEmbeddingProviderInstance

OllamaEmbeddingProvider.prototype._embedOne = async function(
  this: OllamaEmbeddingProviderInstance,
  text: string
): Promise<EmbeddingVector> {
  const response = await fetch(`${this._baseURL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: this._model, prompt: text }),
  })

  if (!response.ok) {
    let message = response.statusText
    try {
      const body = await response.json() as { error?: string }
      message = body.error ?? message
    } catch { /* ignore json parse error */ }
    throw new Error(`Ollama embeddings error ${response.status}: ${message}`)
  }

  const body = await response.json() as { embedding: number[] }
  return new Float32Array(body.embedding)
}

OllamaEmbeddingProvider.prototype.embed = async function(
  this: OllamaEmbeddingProviderInstance,
  texts: string[]
): Promise<EmbeddingVector[]> {
  const CONCURRENCY = 4
  const results: EmbeddingVector[] = new Array(texts.length)

  for (let i = 0; i < texts.length; i += CONCURRENCY) {
    const chunk = texts.slice(i, i + CONCURRENCY)
    const vecs = await Promise.all(chunk.map(t => this._embedOne(t)))
    vecs.forEach((v, j) => { results[i + j] = v })
  }

  return results
}
