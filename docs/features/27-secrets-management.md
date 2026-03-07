# Secrets Management

**Status**: ✅ Implemented | **Priority**: P1 | **Roadmap**: G-09  
**Related**: Provider Configuration, PII Scrubbing, Multi-Tenant Isolation

## Overview

`SecretsProvider` is a pluggable abstraction for injecting API keys and credentials into DAG runs without hardcoding them in config files. Three built-in providers cover the most common patterns — environment variables, `.env` files, and custom (e.g. Vault, AWS SSM). They can be composed into a priority chain via `CompositeSecretsProvider`.

---

## Quick Start

### Default: environment variables only

```typescript
import { EnvSecretsProvider, DagOrchestrator } from '@ai-agencee/engine'

const orchestrator = new DagOrchestrator(process.cwd(), {
  secrets: new EnvSecretsProvider(),
})
```

This is equivalent to not specifying `secrets` at all — environment variables are always the default.

### With `.env` file fallback

```typescript
import { CompositeSecretsProvider, EnvSecretsProvider, DotenvSecretsProvider } from '@ai-agencee/engine'

const secrets = new CompositeSecretsProvider([
  new EnvSecretsProvider(),         // 1st: process.env
  new DotenvSecretsProvider(cwd),   // 2nd: .env / .env.local
])

const orchestrator = new DagOrchestrator(cwd, { secrets })
```

---

## Built-in Providers

### `EnvSecretsProvider`

Reads secrets from `process.env`. Zero-config default.

```typescript
const provider = new EnvSecretsProvider()
const key = await provider.get('ANTHROPIC_API_KEY')
```

### `DotenvSecretsProvider`

Parses `.env` and `.env.local` files (no external dependency). Later files win over earlier ones (dotenv-flow order).

```typescript
const provider = new DotenvSecretsProvider(
  process.cwd(),
  ['.env', '.env.local', '.env.production'],
)
```

Supported `.env` syntax:
- `KEY=value` — bare value
- `KEY="value with spaces"` — double-quoted
- `KEY='value with spaces'` — single-quoted
- `export KEY=value` — `export` prefix stripped
- `# comment` — ignored
- Blank lines — ignored

Multi-line values and variable interpolation are not supported (zero-dependency constraint).

### `CompositeSecretsProvider`

Chains multiple providers in priority order — first non-`undefined` result wins.

```typescript
const secrets = new CompositeSecretsProvider([
  new EnvSecretsProvider(),
  new DotenvSecretsProvider(cwd),
  new MyVaultProvider(),
])

// Resolves from env first, then .env, then Vault
const key = await secrets.get('ANTHROPIC_API_KEY')
```

---

## Custom Provider

Implement `SecretsProvider` to plug in any backend (HashiCorp Vault, AWS SSM, GCP Secret Manager, etc.):

```typescript
import type { SecretsProvider } from '@ai-agencee/engine'

export class VaultSecretsProvider implements SecretsProvider {
  constructor(private readonly vaultClient: VaultClient) {}

  async get(key: string): Promise<string | undefined> {
    try {
      return await this.vaultClient.read(`secret/aikit/${key}`)
    } catch {
      return undefined
    }
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined
  }
}
```

---

## API Reference

### `SecretsProvider` interface

```typescript
interface SecretsProvider {
  /**
   * Retrieve a secret by name.
   * Returns undefined if not found — never throws for missing secrets.
   */
  get(key: string): Promise<string | undefined>;

  /**
   * Check whether a secret exists without revealing its value.
   */
  has(key: string): Promise<boolean>;
}
```

---

## Well-Known Secret Keys

The following environment variable names are pre-fetched by the orchestrator when a `secrets` provider is configured:

| Key | Used by |
|-----|---------|
| `ANTHROPIC_API_KEY` | Anthropic provider |
| `OPENAI_API_KEY` | OpenAI provider |
| `GEMINI_API_KEY` | Gemini provider |
| `AWS_ACCESS_KEY_ID` | Bedrock provider |
| `AWS_SECRET_ACCESS_KEY` | Bedrock provider |
| `GITHUB_TOKEN` | Webhook trigger, issue sync |
| `AIKIT_TENANT_ID` | Multi-tenant isolation |
| `SLACK_WEBHOOK_URL` | Notification sink |
| `TEAMS_WEBHOOK_URL` | Notification sink |

---

## Using Secrets in Agent JSON

Reference secrets in prompt templates using `${ENV_VAR}` interpolation (requires env var to be set or injected via `SecretsProvider`):

```json
{
  "id": "call-internal-api",
  "type": "run-command",
  "command": "curl -H 'Authorization: Bearer ${INTERNAL_API_KEY}' https://api.internal/health"
}
```

---

## Best Practices

| Practice | Recommendation |
|----------|---------------|
| Never hardcode keys | Use `${VAR}` in JSON configs; inject via `SecretsProvider` |
| Use `.env.local` for dev | Add `.env.local` to `.gitignore`; share `.env.example` with placeholder values |
| CI/CD | Set secrets as repository/pipeline secrets, not in files |
| Production | Use a proper secrets manager (Vault, SSM, Secret Manager) via `CompositeSecretsProvider` |
| Audit | Pair with [PII Scrubbing](./12-pii-security.md) to ensure secrets never reach LLM prompts |

---

## `.env.example` Template

Ship this with your project so collaborators know which secrets to configure:

```bash
# .env.example — copy to .env.local and fill in your values
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=

# Optional
AIKIT_TENANT_ID=my-org
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

---

## Related Features

- [Provider Configuration](./23-provider-config.md) — models that consume secrets
- [PII Scrubbing](./12-pii-security.md) — prevents secrets leaking to LLM APIs
- [Multi-Tenant Isolation](./11-multi-tenant.md) — `AIKIT_TENANT_ID` via secrets
- [CLI Commands](./15-cli-commands.md) — environment variable reference

---

**Last Updated**: March 7, 2026  
**Roadmap**: G-09 — Secrets Management  
**Implementation**: `packages/agent-executor/src/lib/secrets.ts`
