# PII Scrubbing & Security

**Status**: ✅ Implemented | **Priority**: P1 | **Roadmap**: G-30/31  
**Related**: Audit Logging, Authentication & RBAC, Multi-Tenant Isolation

## Overview

The PII scrubbing middleware **automatically redacts credentials and sensitive data from LLM prompts** before any HTTP call leaves the process. It operates as a transparent wrapper around any `LLMProvider` — your existing code changes in exactly one place and every downstream call is protected.

### Key Capabilities

- **Nine built-in patterns** — AWS keys, GitHub tokens, JWTs, OpenAI / Anthropic keys, Bearer tokens, SSH private keys, `.env` assignments, and credit card numbers
- **Drop-in provider wrapper** — `createPiiSafeProvider(provider)` requires no other changes
- **Custom patterns** — Add project-specific patterns via `model-router.json`
- **Audit-safe output** — Redaction placeholders (e.g. `[REDACTED:GITHUB_TOKEN]`) are safe to log and persist
- **Scrub result metadata** — Know exactly how many secrets were caught and which patterns matched
- **In-process only** — No data sent externally; pure regex scanning

---

## Quick Start

### Drop-in Provider Wrapper (Recommended)

```typescript
import { createPiiSafeProvider } from '@ai-agencee/engine'
import { myAnthropicProvider } from './providers'

// All prompts routed through this provider are scrubbed first
const safeProvider = createPiiSafeProvider(myAnthropicProvider)
```

That's it. Every `complete()` and `stream()` call on `safeProvider` passes through the scrubber before hitting the API.

### Direct Scrubber

```typescript
import { PiiScrubber } from '@ai-agencee/engine'

const scrubber = new PiiScrubber()
const { text, scrubCount, patternsMatched } = scrubber.scrub(fileContent)

if (scrubCount > 0) {
  console.warn(`Scrubbed ${scrubCount} secret(s): ${patternsMatched.join(', ')}`)
}
// text is now safe to send to any LLM
```

---

## Built-in Patterns

| Pattern | Regex summary | Replacement |
|---------|--------------|-------------|
| `AWS_ACCESS_KEY` | `AKIA[0-9A-Z]{16}` | `[REDACTED:AWS_ACCESS_KEY]` |
| `GITHUB_TOKEN` | `gh[pousr]_[A-Za-z0-9_]{36,255}` | `[REDACTED:GITHUB_TOKEN]` |
| `JWT` | Three-part `eyJ…` base64url token | `[REDACTED:JWT]` |
| `SSH_PRIVATE_KEY` | PEM `-----BEGIN … PRIVATE KEY-----` block | `[REDACTED:SSH_PRIVATE_KEY]` |
| `ANTHROPIC_KEY` | `sk-ant-[A-Za-z0-9\-_]{20,}` | `[REDACTED:ANTHROPIC_KEY]` |
| `OPENAI_KEY` | `sk-[A-Za-z0-9]{20,}` (non-Anthropic) | `[REDACTED:OPENAI_KEY]` |
| `GENERIC_BEARER` | `Bearer <token>` in auth headers | `Bearer [REDACTED:TOKEN]` |
| `ENV_ASSIGN` | `UPPER_KEY=<value>` on a line | `UPPER_KEY=[REDACTED:ENV_VALUE]` |
| `CREDIT_CARD` | Luhn-valid Visa / MC / Amex / Discover | `[REDACTED:CREDIT_CARD]` |

Patterns are applied in order; the scrubbed text from each pass is fed to the next.

---

## Configuration

Enable via `model-router.json` (applies globally to all routed calls):

```json
{
  "piiScrubbing": {
    "enabled": true,
    "customPatterns": [
      {
        "name": "INTERNAL_API_KEY",
        "pattern": "IKEY-[A-Za-z0-9]{32}",
        "flags": "g"
      },
      {
        "name": "ACME_TOKEN",
        "pattern": "acme_[a-zA-Z0-9]{24}"
      }
    ]
  }
}
```

- `enabled` — defaults to `true`; set `false` to bypass without removing the config block
- `customPatterns[].pattern` — regex string without delimiters
- `customPatterns[].flags` — defaults to `"g"` if omitted

Custom patterns are appended **after** the nine built-ins, so they can catch project-specific secrets that the defaults don't cover.

---

## API Reference

### `createPiiSafeProvider`

```typescript
function createPiiSafeProvider(
  provider: LLMProvider,
  options?: PiiScrubberOptions,
): LLMProvider
```

Returns a new `LLMProvider` that scrubs every prompt before delegating to the wrapped provider. All other provider behaviour (streaming, tool calls, etc.) is preserved.

### `PiiScrubber`

```typescript
class PiiScrubber {
  constructor(options?: PiiScrubberOptions)

  /** Scrub a single text string and return the result. */
  scrub(text: string): ScrubResult

  /** Returns all active pattern names (built-ins + custom). */
  get patternNames(): string[]
}
```

### Types

```typescript
interface PiiScrubberOptions {
  /** Disable scrubbing entirely. Default: true (enabled). */
  enabled?: boolean;
  /** Extra patterns applied after built-ins. */
  customPatterns?: Array<{
    name: string;
    pattern: string;   // regex string, no delimiters
    flags?: string;    // default 'g'
  }>;
}

interface ScrubResult {
  /** Scrubbed text with redaction placeholders inserted. */
  text: string;
  /** Total number of individual replacements performed. */
  scrubCount: number;
  /** Names of the patterns that matched — safe to log. */
  patternsMatched: string[];
}

interface ScrubPattern {
  name: string;
  pattern: RegExp;
  replacement: string;
}
```

---

## Examples

### Scanning a File Before Injection

```typescript
import { PiiScrubber } from '@ai-agencee/engine'
import { readFileSync } from 'fs'

const scrubber = new PiiScrubber()
const raw = readFileSync('.env.local', 'utf-8')
const { text: safe, scrubCount, patternsMatched } = scrubber.scrub(raw)

if (scrubCount > 0) {
  console.warn(`⚠️  Scrubbed ${scrubCount} item(s) from .env.local: ${patternsMatched.join(', ')}`)
}

// Feed `safe` to the LLM, not `raw`
await llm.complete({ messages: [{ role: 'user', content: safe }] })
```

### Protecting a Code Review Pipeline

```typescript
import { createPiiSafeProvider, AnthropicProvider } from '@ai-agencee/engine'

const base = new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY })

// All code sent for review is automatically stripped of credentials
const safeProvider = createPiiSafeProvider(base, {
  customPatterns: [
    { name: 'INTERNAL_DB_URL', pattern: 'postgres://[^\\s]+' },
  ],
})

// Use safeProvider exactly like a normal provider
const response = await safeProvider.complete({ messages })
```

### Audit Integration

```typescript
const { text, scrubCount, patternsMatched } = scrubber.scrub(prompt)

if (scrubCount > 0) {
  await auditLogger.log({
    event:    'pii-scrubbed',
    count:    scrubCount,
    patterns: patternsMatched,   // e.g. ['GITHUB_TOKEN']
    // NOTE: never log `prompt`; log `text` if you must log the content
  })
}
```

---

## What Gets Scrubbed (Examples)

| Input | Output |
|-------|--------|
| `AKIAIOSFODNN7EXAMPLE` | `[REDACTED:AWS_ACCESS_KEY]` |
| `ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456` | `[REDACTED:GITHUB_TOKEN]` |
| `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.abc123` | `[REDACTED:JWT]` |
| `sk-ant-api03-xxxxxxxxxxxxxxxxxxxx` | `[REDACTED:ANTHROPIC_KEY]` |
| `DATABASE_URL=postgres://user:hunter2@db/prod` | `DATABASE_URL=[REDACTED:ENV_VALUE]` |
| `Authorization: Bearer eyAbc...` | `Authorization: Bearer [REDACTED:TOKEN]` |

---

## Security Considerations

| Concern | Notes |
|---------|-------|
| False positives | Replacement is conservative — legitimate base64 strings _may_ be flagged as JWTs if they match the three-segment pattern |
| False negatives | Custom or obfuscated secrets not matching any pattern will pass through — supplement with custom patterns for known internal formats |
| Streaming | `createPiiSafeProvider` scrubs the assembled prompt _before_ streaming begins, not token-by-token |
| Logging scrubbed text | `[REDACTED:X]` placeholders are safe to log to audit trails; the original secrets are never stored |
| Performance | Regex scanning is in-process and memory-only; no measurable latency on typical prompt sizes |

---

## Related Features

- [Audit Logging](./10-audit-logging.md) — Log scrub events to the immutable audit trail
- [Authentication & RBAC](./09-rbac-auth.md) — Identity and permission enforcement
- [Multi-Tenant Isolation](./11-multi-tenant.md) — Per-tenant data separation
- [Model Routing & Cost Tracking](./03-model-routing-cost.md) — Provider configuration

---

**Last Updated**: March 7, 2026  
**Roadmap**: G-30/31 — PII Scrubbing & Injection Defence  
**Implementation**: `packages/agent-executor/src/lib/pii-scrubber.ts`
