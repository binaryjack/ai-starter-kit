# Provider Configuration

**Status**: ✅ Implemented | **Priority**: P2 | **Roadmap**: Core  
**Related**: Model Routing & Cost Tracking, Secrets Management

## Overview

The engine supports **six LLM providers** out of the box: Anthropic, OpenAI, Ollama, Google Gemini, AWS Bedrock, and VS Code Sampling. All are configured through a single `agents/model-router.json` file. Providers are selected automatically by task type via the [Model Router](./03-model-routing-cost.md).

---

## model-router.json Structure

```json
{
  "defaultProvider": "anthropic",
  "tiers": {
    "haiku":  { "provider": "anthropic", "model": "claude-haiku-3-5" },
    "sonnet": { "provider": "anthropic", "model": "claude-sonnet-3-7" },
    "opus":   { "provider": "anthropic", "model": "claude-opus-4" }
  },
  "providers": {
    "anthropic": {
      "apiKey": "${ANTHROPIC_API_KEY}"
    },
    "openai": {
      "apiKey": "${OPENAI_API_KEY}"
    },
    "ollama": {
      "baseUrl": "http://localhost:11434"
    },
    "gemini": {
      "apiKey": "${GEMINI_API_KEY}"
    },
    "bedrock": {
      "region": "us-east-1"
    }
  },
  "piiScrubbing": {
    "enabled": true
  }
}
```

Environment variable interpolation (`${VAR}`) is supported in all string values.

---

## Anthropic

```json
{
  "defaultProvider": "anthropic",
  "tiers": {
    "haiku":  { "provider": "anthropic", "model": "claude-haiku-3-5" },
    "sonnet": { "provider": "anthropic", "model": "claude-sonnet-3-7" },
    "opus":   { "provider": "anthropic", "model": "claude-opus-4" }
  },
  "providers": {
    "anthropic": { "apiKey": "${ANTHROPIC_API_KEY}" }
  }
}
```

Environment variable: `ANTHROPIC_API_KEY`  
Streaming: SSE (`text_delta` events)

---

## OpenAI

```json
{
  "defaultProvider": "openai",
  "tiers": {
    "haiku":  { "provider": "openai", "model": "gpt-4o-mini" },
    "sonnet": { "provider": "openai", "model": "gpt-4o" },
    "opus":   { "provider": "openai", "model": "o1" }
  },
  "providers": {
    "openai": {
      "apiKey":  "${OPENAI_API_KEY}",
      "baseUrl": "https://api.openai.com/v1"
    }
  }
}
```

Environment variable: `OPENAI_API_KEY`  
Streaming: SSE with `stream_options` (includes usage)  
Custom `baseUrl` enables Azure OpenAI or compatible endpoints.

---

## Ollama (Local / Self-hosted)

```json
{
  "defaultProvider": "ollama",
  "tiers": {
    "haiku":  { "provider": "ollama", "model": "llama3.2:3b" },
    "sonnet": { "provider": "ollama", "model": "llama3.1:8b" },
    "opus":   { "provider": "ollama", "model": "llama3.1:70b" }
  },
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434"
    }
  }
}
```

No API key required. Start Ollama: `ollama serve`  
Pull models: `ollama pull llama3.1:8b`  
Streaming: newline-delimited JSON

---

## Google Gemini

```json
{
  "tiers": {
    "haiku":  { "provider": "gemini", "model": "gemini-2.0-flash-lite" },
    "sonnet": { "provider": "gemini", "model": "gemini-2.0-flash" },
    "opus":   { "provider": "gemini", "model": "gemini-2.0-pro" }
  },
  "providers": {
    "gemini": { "apiKey": "${GEMINI_API_KEY}" }
  }
}
```

Environment variable: `GEMINI_API_KEY`  
Streaming: Chunked HTTP response

---

## AWS Bedrock

```json
{
  "tiers": {
    "haiku":  { "provider": "bedrock", "model": "anthropic.claude-haiku-3-5-v1" },
    "sonnet": { "provider": "bedrock", "model": "anthropic.claude-sonnet-3-7-v1" },
    "opus":   { "provider": "bedrock", "model": "anthropic.claude-opus-4-v1" }
  },
  "providers": {
    "bedrock": {
      "region":          "us-east-1",
      "accessKeyId":     "${AWS_ACCESS_KEY_ID}",
      "secretAccessKey": "${AWS_SECRET_ACCESS_KEY}"
    }
  }
}
```

Uses AWS SigV4 signing. Configure credentials via env vars or IAM role (no config needed for instance roles).

---

## VS Code Sampling (IDE Extension)

Used automatically when running inside VS Code with the ai-agencee extension. Falls back to batch if streaming is not available in the IDE context. No configuration required.

---

## Mixed Provider Config

Route different task types to different providers:

```json
{
  "tiers": {
    "haiku":  { "provider": "ollama",    "model": "llama3.2:3b" },
    "sonnet": { "provider": "anthropic", "model": "claude-sonnet-3-7" },
    "opus":   { "provider": "anthropic", "model": "claude-opus-4" }
  }
}
```

This keeps cheap tasks local (free) while routing complex reasoning to Anthropic.

---

## Fallback Chain

Configure a fallback provider for resilience:

```json
{
  "tiers": {
    "sonnet": {
      "provider": "anthropic",
      "model":    "claude-sonnet-3-7",
      "fallback": {
        "provider": "openai",
        "model":    "gpt-4o"
      }
    }
  }
}
```

If the primary provider returns a 5xx or rate-limit error, the model router automatically retries with the fallback. See [Resilience Patterns](./07-resilience-patterns.md) for full retry configuration.

---

## Cost Rates

Define per-token cost rates for budget enforcement:

```json
{
  "costRates": {
    "claude-haiku-3-5":  { "input": 0.0000008,  "output": 0.000004 },
    "claude-sonnet-3-7": { "input": 0.000003,   "output": 0.000015 },
    "claude-opus-4":     { "input": 0.000015,   "output": 0.000075 },
    "gpt-4o-mini":       { "input": 0.00000015, "output": 0.0000006 },
    "gpt-4o":            { "input": 0.0000025,  "output": 0.00001 }
  }
}
```

Rates are in USD per token.

---

## Related Features

- [Model Routing & Cost Tracking](./03-model-routing-cost.md) — Task-type → tier → model
- [Secrets Management](./27-secrets-management.md) — Secure API key injection
- [PII Scrubbing](./12-pii-security.md) — Scrubbing before any provider call
- [Resilience Patterns](./07-resilience-patterns.md) — Retry and fallback

---

**Last Updated**: March 7, 2026  
**Roadmap**: Core  
**Implementation**: `packages/agent-executor/src/lib/providers/`, `model-router.ts`
