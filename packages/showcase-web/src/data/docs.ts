import type { IconName } from '@ai-agencee/ui/icons'

export interface DocSection {
  id:          string
  label:       string
  content:     string
}

export interface DocTopic {
  id:          string
  slug:        string
  title:       string
  description: string
  icon:        IconName
  category:    'orchestration' | 'enterprise' | 'dx' | 'observability'
  sections:    DocSection[]
  relatedSlugs?: string[]
}

export const DOC_TOPICS: DocTopic[] = [
  {
    id:          'dag-orchestration',
    slug:        'dag-orchestration',
    title:       'DAG Orchestration',
    description: 'How to define, wire, and run multi-agent workflows using JSON-declarative directed acyclic graphs.',
    icon:        'branching',
    category:    'orchestration',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `A **DAG (Directed Acyclic Graph)** in ai-agencee is a JSON file that declares named lanes, their checks, and dependency relationships. The engine parses the graph, resolves the execution order, and runs independent lanes in parallel.\n\nEach lane contains an ordered list of **check handlers** — deterministic validators, LLM generators, or LLM reviewers. A lane completes when all its checks pass (or exhaust their retry budget).`,
      },
      {
        id:      'anatomy',
        label:   'DAG Anatomy',
        content: `\`\`\`json
{
  "name": "My First DAG",
  "lanes": [
    {
      "id": "analyse",
      "agentFile": "agents/01-business-analyst.agent.json",
      "dependsOn": []
    },
    {
      "id": "backend",
      "agentFile": "agents/03-backend.agent.json",
      "supervisorFile": "agents/backend.supervisor.json",
      "dependsOn": ["analyse"]
    },
    {
      "id": "frontend",
      "agentFile": "agents/04-frontend.agent.json",
      "dependsOn": ["analyse"]
    },
    {
      "id": "e2e",
      "agentFile": "agents/06-e2e.agent.json",
      "barrier": "hard",
      "dependsOn": ["backend", "frontend"]
    }
  ]
}
\`\`\``,
      },
      {
        id:      'barriers',
        label:   'Barriers',
        content: `**Hard barrier** — all upstream lanes must have \`PASS\` from their supervisor before the downstream lane starts. Blocks on any failure.\n\n**Soft-align barrier** — downstream starts once all upstream lanes reach a checkpoint, even if not yet complete. Used for read-contract pattern (Frontend reads Backend API schema without waiting for full implementation).`,
      },
      {
        id:      'supervisors',
        label:   'Supervisors',
        content: `A supervisor JSON file \`agents/my.supervisor.json\` contains an ordered list of checks that run **after** the lane completes. Possible verdicts:\n\n| Verdict | Effect |\n|---------|--------|\n| \`PASS\` | Lane accepted, dependants unlock |\n| \`RETRY\` | Re-run the lane with injected guidance |\n| \`HANDOFF\` | Pass output to a different lane |\n| \`ESCALATE\` | Stop DAG, alert human reviewer |`,
      },
    ],
    relatedSlugs: ['model-routing', 'resilience', 'builder-api'],
  },
  {
    id:          'model-routing',
    slug:        'model-routing',
    title:       'Model Routing & Cost',
    description: 'How ai-agencee selects the right model tier for each task and enforces per-run budgets.',
    icon:        'branching',
    category:    'orchestration',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `The model router inspects the \`taskType\` field on each check and maps it to a model family (haiku/sonnet/opus). It then picks the cheapest provider that satisfies the tier and has remaining budget.`,
      },
      {
        id:      'tier-table',
        label:   'Tier Table',
        content: `| Task type | Family | Anthropic model | OpenAI model | Cost / 1 M tokens |\n|---|---|---|---|---|\n| \`file-analysis\` | haiku | claude-haiku-4-5 | gpt-4o-mini | $0.80 |\n| \`code-generation\` | sonnet | claude-sonnet-4-5 | gpt-4o | $3.00 |\n| \`code-review\` | sonnet | claude-sonnet-4-5 | gpt-4o | $3.00 |\n| \`architecture-decision\` | opus | claude-opus-4-5 | gpt-4o | $15.00 |\n| \`security-review\` | opus | claude-opus-4-5 | gpt-4o | $15.00 |`,
      },
      {
        id:      'budget',
        label:   'Budget Enforcement',
        content: `Set \`budgetUsd\` in your DAG or pass \`--budget 1.00\` to the CLI. When the remaining budget falls below the cost of the next check, the router falls back to a cheaper model tier. If no tier fits, the lane is suspended and a \`budget-exceeded\` event fires.`,
      },
      {
        id:      'providers',
        label:   'Supported Providers',
        content: `- **Anthropic** — Claude 3 / 4 family via SSE\n- **OpenAI** — GPT-4o family via SSE + stream_options\n- **VS Code Sampling** — Copilot routing for in-editor workflows\n- **Mock** — Built-in deterministic, zero-cost, zero-key provider\n- **Ollama** — Local models (Enterprise)\n- **Bedrock** — AWS-hosted Claude (Enterprise)\n- **Gemini** — Google AI (Enterprise)`,
      },
    ],
    relatedSlugs: ['dag-orchestration', 'resilience'],
  },
  {
    id:          'resilience',
    slug:        'resilience',
    title:       'Resilience Patterns',
    description: 'Retry policies, circuit breakers, and graceful fallbacks that keep your workflows running through transient failures.',
    icon:        'security',
    category:    'orchestration',
    sections: [
      {
        id:      'retry',
        label:   'Retry Policy',
        content: `Every LLM call is wrapped in an exponential-backoff retry loop:\n\n- **4 attempts** by default (configurable)\n- **1 s → 32 s** max delay (2ⁿ s × jitter)\n- Retries on HTTP 429, 500, 503\n- Respects \`Retry-After\` response headers`,
      },
      {
        id:      'circuit-breaker',
        label:   'Circuit Breaker',
        content: `Per-provider circuit breaker with three states:\n\n| State | Behaviour |\n|-------|----------|\n| **CLOSED** | Normal operation |\n| **OPEN** | Fast-fail all requests; no LLM calls |\n| **HALF_OPEN** | One probe request; success → CLOSED, failure → OPEN |\n\nThreshold: 5 consecutive failures → OPEN. Cooldown: 60 s.`,
      },
      {
        id:      'verdicts',
        label:   'Supervisor Verdicts',
        content: `When a supervisor check fails beyond its \`retryBudget\`, the engine chooses a verdict:\n\n- **RETRY** — Re-run with injected corrective prompt\n- **HANDOFF** — Forward output to a specialist lane\n- **ESCALATE** — Halt DAG, fire \`human-review-required\` event`,
      },
    ],
    relatedSlugs: ['dag-orchestration', 'event-bus'],
  },
  {
    id:          'cli',
    slug:        'cli',
    title:       'CLI Reference',
    description: 'Complete reference for ai-kit CLI commands, flags, and environment variables.',
    icon:        'tools',
    category:    'dx',
    sections: [
      {
        id:      'install',
        label:   'Installation',
        content: `\`\`\`sh
# Global install
npm install -g @ai-agencee/cli

# Or as a dev dependency
npm install -D @ai-agencee/cli
\`\`\``,
      },
      {
        id:      'commands',
        label:   'Commands',
        content: `| Command | Description |\n|---------|-------------|\n| \`ai-kit init [--strict]\` | Scaffold project with coding standards |\n| \`ai-kit sync\` | Sync existing templates |\n| \`ai-kit check\` | Validate project structure |\n| \`ai-kit agent:dag <dag.json>\` | Execute a DAG workflow |\n| \`ai-kit plan\` | Interactive 5-phase planning session |\n| \`ai-kit visualize <dag.json>\` | Output Mermaid / DOT diagram |\n| \`ai-kit data:export --tenant <id>\` | GDPR export |\n| \`ai-kit data:delete --tenant <id>\` | GDPR deletion |\n| \`ai-kit data:list-tenants\` | List all tenant IDs |`,
      },
      {
        id:      'providers',
        label:   'Provider Flags',
        content: `\`\`\`sh
# Mock provider — zero cost, no API key
ai-kit agent:dag ./my-dag.json --provider mock

# Anthropic
ANTHROPIC_API_KEY=sk-... ai-kit agent:dag ./my-dag.json

# OpenAI
OPENAI_API_KEY=sk-... ai-kit agent:dag ./my-dag.json --provider openai

# With budget cap
ai-kit agent:dag ./my-dag.json --budget 2.50
\`\`\``,
      },
    ],
    relatedSlugs: ['dag-orchestration', 'mcp'],
  },
  {
    id:          'mcp',
    slug:        'mcp',
    title:       'MCP Integration',
    description: 'Connect ai-agencee to Claude Desktop or VS Code Copilot via the Model Context Protocol.',
    icon:        'plugin',
    category:    'dx',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `The MCP package (\`@ai-agencee/mcp\`) exposes an SSE server that speaks the Model Context Protocol. Claude Desktop and VS Code Copilot can call ai-agencee tools directly from the chat interface.`,
      },
      {
        id:      'claude-setup',
        label:   'Claude Desktop Setup',
        content: `Add to \`~/Library/Application Support/Claude/claude_desktop_config.json\`:\n\n\`\`\`json
{
  "mcpServers": {
    "ai-agencee": {
      "command": "npx",
      "args": ["@ai-agencee/mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-..."
      }
    }
  }
}
\`\`\``,
      },
      {
        id:      'tools',
        label:   'Available MCP Tools',
        content: `| Tool | Description |\n|------|-------------|\n| \`@init\` | Load project coding standards and quality rules |\n| \`@check\` | Validate project structure |\n| \`@rules\` | Access coding standards & guidelines |\n| \`@patterns\` | Design patterns library |\n| \`@bootstrap\` | Get setup configuration |`,
      },
    ],
    relatedSlugs: ['cli', 'dag-orchestration'],
  },
  {
    id:          'rbac',
    slug:        'rbac',
    title:       'RBAC & OIDC Auth',
    description: 'Role-based access control with RS256/ES256 JWT validation and per-principal rate limiting.',
    icon:        'auth',
    category:    'enterprise',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `The SSE server validates \`Authorization: Bearer <jwt>\` tokens on every connection. Each token carries a \`principal\` claim that is used for per-principal rate limiting, cost attribution, and audit logging.`,
      },
      {
        id:      'config',
        label:   'Configuration',
        content: `\`\`\`sh
# Set JWKS endpoint for RS256/ES256 validation
OIDC_JWKS_URI=https://auth.example.com/.well-known/jwks.json
OIDC_ISSUER=https://auth.example.com
OIDC_AUDIENCE=ai-agencee

# Or use symmetric HS256 (dev/test only — use a long random string)
JWT_SECRET=<your-long-random-secret>
\`\`\``,
      },
      {
        id:      'gdpr',
        label:   'GDPR CLI',
        content: `\`\`\`sh
# Export all data for a principal
ai-kit data:export --principal user@example.com

# Delete all data for a tenant
ai-kit data:delete --tenant acme-corp

# List all tenants
ai-kit data:list-tenants
\`\`\``,
      },
    ],
    relatedSlugs: ['audit-logging', 'multi-tenant'],
  },
  {
    id:          'audit-logging',
    slug:        'audit-logging',
    title:       'Audit Logging',
    description: 'Hash-chained tamper-proof audit logs — every agent action recorded for compliance.',
    icon:        'document',
    category:    'enterprise',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `Every agent action, model call, token cost, verdict, and GDPR operation is written to an append-only log file. Each entry includes a SHA-256 hash of the previous entry — any tampering is detected on read.`,
      },
      {
        id:      'schema',
        label:   'Log Schema',
        content: `Each log entry contains:\n- \`timestamp\` — ISO 8601\n- \`principal\` — authenticated user/service\n- \`tenantId\` — tenant scope\n- \`action\` — event type (lane:start, llm:call, verdict:issued, gdpr:export, etc.)\n- \`payload\` — event-specific data\n- \`prevHash\` — SHA-256 of previous entry\n- \`hash\` — SHA-256 of this entry`,
      },
    ],
    relatedSlugs: ['rbac', 'multi-tenant'],
  },
  {
    id:          'builder-api',
    slug:        'builder-api',
    title:       'TypeScript Builder API',
    description: 'Fluent type-safe DSL for constructing DAGs in code instead of JSON.',
    icon:        'modular',
    category:    'dx',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `The Builder API lets you construct DAGs programmatically with full TypeScript inference — no JSON required. The result can be serialized to the standard DAG JSON format.`,
      },
      {
        id:      'example',
        label:   'Example',
        content: `\`\`\`typescript
import { DagBuilder } from '@ai-agencee/engine'

const dag = new DagBuilder('My DAG')
  .lane('analyse', { agentFile: 'agents/01-business-analyst.agent.json' })
  .lane('backend', { agentFile: 'agents/03-backend.agent.json', dependsOn: ['analyse'] })
  .lane('frontend', { agentFile: 'agents/04-frontend.agent.json', dependsOn: ['analyse'] })
  .barrier('hard', ['backend', 'frontend'])
  .lane('e2e', { agentFile: 'agents/06-e2e.agent.json', dependsOn: ['backend', 'frontend'] })
  .build()

await orchestrator.runDag(dag)
\`\`\``,
      },
    ],
    relatedSlugs: ['dag-orchestration', 'cli'],
  },
  {
    id:          'event-bus',
    slug:        'event-bus',
    title:       'Event Bus',
    description: 'Typed real-time event subscriptions for lane status, token streams, cost updates, and webhook triggers.',
    icon:        'api',
    category:    'observability',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `Every DAG run emits typed lifecycle events on the global event bus. Subscribe to them programmatically or receive them via SSE / webhooks.`,
      },
      {
        id:      'events',
        label:   'Event Types',
        content: `| Event | Payload |\n|-------|---------|\n| \`lane:start\` | \`{ laneId, dagId, timestamp }\` |\n| \`lane:complete\` | \`{ laneId, status, costUsd }\` |\n| \`token:delta\` | \`{ laneId, token, totalTokens }\` |\n| \`cost:update\` | \`{ laneId, incrementalUsd, totalUsd }\` |\n| \`verdict:issued\` | \`{ laneId, verdict, guidance }\` |\n| \`human-review-required\` | \`{ laneId, reason, context }\` |`,
      },
      {
        id:      'subscribe',
        label:   'Subscribe',
        content: `\`\`\`typescript
import { getGlobalEventBus } from '@ai-agencee/engine'

const bus = getGlobalEventBus()

bus.on('lane:complete', ({ laneId, status, costUsd }) => {
  console.log(\`Lane \${laneId} → \${status} ($\${costUsd.toFixed(4)})\`)
})
\`\`\``,
      },
    ],
    relatedSlugs: ['dag-orchestration', 'rbac'],
  },
  {
    id:          'streaming',
    slug:        'streaming',
    title:       'Real-Time Streaming',
    description: 'Token-by-token LLM output streamed live to your UI via a simple callback — supported by Anthropic, OpenAI, Ollama, Gemini, and more.',
    icon:        'performance',
    category:    'orchestration',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `By default the engine awaits the full LLM response before continuing. Enable streaming to receive each token the moment the model emits it — ideal for chat UIs, live progress bars, and latency-sensitive workflows.

Streaming is opt-in at the \`CheckContext\` level: set the \`onLlmStream\` callback before running a DAG and the engine switches every LLM call on that run to its streaming path automatically.`,
      },
      {
        id:      'providers',
        label:   'Supported Providers',
        content: `| Provider | Streaming protocol |\n|----------|-------------------|\n| Anthropic | SSE (\`text_delta\` events) |\n| OpenAI | SSE (\`stream_options\` with usage) |\n| Ollama | SSE (newline-delimited JSON) |\n| Gemini | Chunked HTTP response |\n| VS Code Sampling | Fallback (batch, emits single chunk) |\n| Mock | Word-level simulation (testing) |

All providers go through \`ModelRouter.streamRoute()\`, which returns an async generator of string tokens.`,
      },
      {
        id:      'usage',
        label:   'Usage',
        content: `\`\`\`typescript
import { AgentExecutor } from '@ai-agencee/engine'

const executor = new AgentExecutor({ dagFile: 'dag.json' })

await executor.run({
  onLlmStream: (token: string) => {
    process.stdout.write(token)   // or push to SSE, WebSocket, etc.
  },
})
\`\`\`

The \`onLlmStream\` callback receives individual string tokens as the model streams them. Any handler that triggers an LLM call (e.g. \`llm-generate\`, \`llm-review\`) will honour the callback automatically.`,
      },
      {
        id:      'programmatic',
        label:   'ModelRouter direct',
        content: `\`\`\`typescript
import { ModelRouter } from '@ai-agencee/engine'

const router = new ModelRouter(config)

for await (const token of router.streamRoute('code-generation', { messages })) {
  process.stdout.write(token)
}
\`\`\``,
      },
    ],
    relatedSlugs: ['dag-orchestration', 'event-bus', 'model-routing'],
  },
  {
    id:          'multi-tenant',
    slug:        'multi-tenant',
    title:       'Multi-Tenant Isolation',
    description: 'Per-tenant run sandboxing with path-isolated storage, GDPR-compliant data export and erasure, and zero cross-tenant data leakage.',
    icon:        'enterprise',
    category:    'enterprise',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `\`TenantRunRegistry\` extends the base run registry with per-tenant filesystem isolation. Every run is stored under a dedicated tenant subtree so that no two tenants can ever read or overwrite each other's data.

This is the authoritative implementation for **GDPR Art. 17** (Right to Erasure) and **GDPR Art. 20** (Data Portability) in the engine.`,
      },
      {
        id:      'layout',
        label:   'Storage Layout',
        content: `\`\`\`
.agents/
  tenants/
    <tenantId>/
      runs/
        <runId>/
          config.json       # RunMeta (status, timestamps, dagFile)
          events.ndjson     # Append-only structured event log
          result.json       # Final run result (written on complete)
\`\`\`

\`tenantId\` is resolved in priority order:
1. Explicit constructor argument
2. \`AIKIT_TENANT_ID\` environment variable
3. \`"default"\` — single-tenant / local-dev mode`,
      },
      {
        id:      'usage',
        label:   'Usage',
        content: `\`\`\`typescript
import { TenantRunRegistry } from '@ai-agencee/engine'

// Resolve tenant from AIKIT_TENANT_ID env var (or "default")
const registry = new TenantRunRegistry(process.cwd())

// Or pass an explicit tenant ID
const registry = new TenantRunRegistry(process.cwd(), 'acme-corp')

// Create a run
const meta = await registry.create(runId, 'dag.json')

// Mark completed
await registry.complete(runId, 'completed', resultPayload)

// Append a structured event
await registry.appendEvent(runId, { type: 'lane:complete', laneId: 'review' })
\`\`\``,
      },
      {
        id:      'gdpr',
        label:   'GDPR Operations',
        content: `\`\`\`typescript
// Export all data for a tenant (GDPR Art. 20 — Data Portability)
const summary = await registry.exportTenant('acme-corp', '/tmp/export')
// → { tenantId, destDir, runCount, totalBytes, exportedAt }

// Permanently delete all tenant data (GDPR Art. 17 — Right to Erasure)
const deleted = await registry.deleteTenant('acme-corp')
// → { tenantId, runCount, totalBytesFreed, deletedAt }

// List all known tenant IDs on disk
const tenants = await registry.listTenants()
// → ['default', 'acme-corp', 'beta-org']
\`\`\`

These operations are also exposed via the CLI:
\`\`\`bash
ai-kit data:export --tenant acme-corp --out ./export
ai-kit data:delete --tenant acme-corp
\`\`\``,
      },
    ],
    relatedSlugs: ['rbac', 'audit-logging', 'dag-orchestration'],
  },
  {
    id:          'pii-scrubbing',
    slug:        'pii-scrubbing',
    title:       'PII Scrubbing',
    description: 'Automatic redaction of credentials and sensitive data from LLM prompts before any HTTP call leaves the process — nine built-in patterns, fully extensible.',
    icon:        'encryption',
    category:    'enterprise',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `The PII scrubbing middleware wraps any \`LLMProvider\` transparently. Every prompt is scanned against a set of regex patterns before it is sent to the model API. Matched secrets are replaced with audit-safe placeholders like \`[REDACTED:GITHUB_TOKEN]\`.

The scrubber operates entirely in-process — no data is sent to an external service.`,
      },
      {
        id:      'patterns',
        label:   'Built-in Patterns',
        content: `| Pattern name | Matches |\n|---|---|\n| \`AWS_ACCESS_KEY\` | \`AKIA[A-Z0-9]{16}\` |\n| \`GITHUB_TOKEN\` | \`ghp_\`, \`gho_\`, \`ghs_\`, \`ghu_\`, \`ghr_\` prefixes |\n| \`JWT\` | Three-part base64url token (\`eyJ…\`) |\n| \`SSH_PRIVATE_KEY\` | PEM-encoded RSA / EC / OpenSSH private keys |\n| \`ANTHROPIC_KEY\` | \`sk-ant-…\` |\n| \`OPENAI_KEY\` | \`sk-…\` (non-Anthropic) |\n| \`GENERIC_BEARER\` | \`Authorization: Bearer <token>\` |\n| \`ENV_ASSIGN\` | \`UPPER_KEY=<value>\` environment assignments |\n| \`CREDIT_CARD\` | Luhn-valid Visa / MC / Amex / Discover numbers |`,
      },
      {
        id:      'usage',
        label:   'Usage',
        content: `**Drop-in provider wrapper (recommended)**
\`\`\`typescript
import { createPiiSafeProvider } from '@ai-agencee/engine'
import { anthropicProvider } from './my-providers'

// All calls through safeProvider are scrubbed automatically
const safeProvider = createPiiSafeProvider(anthropicProvider)
\`\`\`

**Direct scrubber**
\`\`\`typescript
import { PiiScrubber } from '@ai-agencee/engine'

const scrubber = new PiiScrubber()
const { text, scrubCount, patternsMatched } = scrubber.scrub(fileContent)

console.log(\`Scrubbed \${scrubCount} secret(s): \${patternsMatched.join(', ')}\`)
\`\`\``,
      },
      {
        id:      'config',
        label:   'Configuration',
        content: `Enable in \`model-router.json\` (or your DAG/agent JSON):
\`\`\`json
{
  "piiScrubbing": {
    "enabled": true,
    "customPatterns": [
      {
        "name": "MY_INTERNAL_TOKEN",
        "pattern": "MYT-[A-Za-z0-9]{32}",
        "flags": "g"
      }
    ]
  }
}
\`\`\`

Custom patterns are appended after the built-ins. The \`flags\` field defaults to \`"g"\` if omitted.`,
      },
    ],
    relatedSlugs: ['audit-logging', 'rbac', 'multi-tenant'],
  },
  {
    id:          'agent-types',
    slug:        'agent-types',
    title:       'Agent Types & Roles',
    description: 'Reference for all agent roles, check types, and the agent JSON configuration format.',
    icon:        'modular',
    category:    'orchestration',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `Every lane in a DAG is backed by an **agent JSON file** that declares the agent's role, model preferences, system prompt, and list of checks.\n\nThe engine loads the agent file, resolves the model tier for each check, and runs each check handler in sequence.`,
      },
      {
        id:      'check-types',
        label:   'Check Types',
        content: `| Check type | Handler | Purpose |\n|---|---|---|\n| \`llm-generate\` | LLM | Generate text/code from a prompt |\n| \`llm-review\` | LLM | Review and score output from another lane |\n| \`file-exists\` | Deterministic | Assert file is present on disk |\n| \`file-matches\` | Deterministic | Assert file content matches a pattern |\n| \`command-succeeds\` | Deterministic | Assert a shell command exits 0 |\n| \`custom\` | Plugin | User-provided check handler |`,
      },
      {
        id:      'agent-json',
        label:   'Agent JSON Format',
        content: `\`\`\`json\n{\n  "name": "Backend Developer",\n  "role": "backend",\n  "model": "sonnet",\n  "systemPrompt": "You are a senior backend engineer...",\n  "checks": [\n    { "type": "llm-generate", "taskType": "code-generation", "retryBudget": 3 },\n    { "type": "file-exists",  "path": "src/server.ts" },\n    { "type": "command-succeeds", "command": "pnpm test" }\n  ]\n}\n\`\`\``,
      },
    ],
    relatedSlugs: ['dag-orchestration', 'check-handlers', 'model-routing'],
  },
  {
    id:          'check-handlers',
    slug:        'check-handlers',
    title:       'Check Handlers',
    description: 'How to implement custom check handlers and plug them into the executor pipeline.',
    icon:        'tools',
    category:    'orchestration',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `A **check handler** is any object that implements \`ICheckHandler\`. The executor calls \`handle(context)\` for each check in sequence. Handlers can be deterministic validators, LLM wrappers, or arbitrary async code.`,
      },
      {
        id:      'interface',
        label:   'ICheckHandler Interface',
        content: `\`\`\`typescript\nimport type { CheckContext, RawCheckResult } from '@ai-agencee/engine'\n\nexport interface ICheckHandler {\n  readonly type: string          // matches check.type in agent JSON\n  handle(ctx: CheckContext): Promise<RawCheckResult>\n}\n\n// RawCheckResult\n// { pass: boolean; output?: string; reason?: string }\n\`\`\``,
      },
      {
        id:      'custom',
        label:   'Custom Handler',
        content: `\`\`\`typescript\nimport type { ICheckHandler, CheckContext, RawCheckResult } from '@ai-agencee/engine'\n\nexport class LintCheckHandler implements ICheckHandler {\n  readonly type = 'lint-pass'\n\n  async handle(ctx: CheckContext): Promise<RawCheckResult> {\n    const exitCode = await runCommand('pnpm lint', ctx.workdir)\n    return { pass: exitCode === 0, reason: exitCode !== 0 ? 'Lint failed' : undefined }\n  }\n}\n\`\`\`\n\nRegister in your plugin manifest or pass directly to \`AgentExecutor\`.`,
      },
    ],
    relatedSlugs: ['agent-types', 'plugin-system', 'dag-orchestration'],
  },
  {
    id:          'plugin-system',
    slug:        'plugin-system',
    title:       'Plugin System',
    description: 'Auto-discover and register agent, tool, check-handler, and provider plugins from any npm package.',
    icon:        'plugin',
    category:    'dx',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `The plugin system scans \`node_modules/\` and a local \`plugins/\` directory for packages that export an \`AiKitPluginManifest\`. Found plugins are registered automatically — no import or config required.`,
      },
      {
        id:      'manifest',
        label:   'Plugin Manifest',
        content: `\`\`\`typescript\nexport const manifest: AiKitPluginManifest = {\n  name:    '@my-org/ai-kit-plugin-lint',\n  version: '1.0.0',\n  kind:    'check-handler',   // 'agent' | 'tool' | 'check-handler' | 'provider'\n  entry:   './dist/index.js',\n}\n\`\`\`\n\nThe \`entry\` module must export a default \`register(registry: PluginRegistry): void\` function.`,
      },
      {
        id:      'manual',
        label:   'Manual Registration',
        content: `\`\`\`typescript\nimport { PluginRegistry } from '@ai-agencee/engine'\nimport { LintCheckHandler } from './my-handlers'\n\nPluginRegistry.register({\n  name:    'lint-pass',\n  kind:    'check-handler',\n  factory: () => new LintCheckHandler(),\n})\n\`\`\``,
      },
    ],
    relatedSlugs: ['check-handlers', 'agent-types', 'cli'],
  },
  {
    id:          'opentelemetry',
    slug:        'opentelemetry',
    title:       'OpenTelemetry Tracing',
    description: 'Distributed tracing for every DAG run, lane, and LLM call — OTLP spans to Jaeger, Zipkin, Datadog, or Honeycomb.',
    icon:        'performance',
    category:    'observability',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `The \`DagTracer\` wraps \`@opentelemetry/sdk-node\` and creates a root span per DAG run. Every lane and every LLM call receives a child span with full attribute sets (model, tokens, cost, verdict, tenant).`,
      },
      {
        id:      'setup',
        label:   'Setup',
        content: `\`\`\`sh\n# Send to Jaeger (dev)\nOTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 ai-kit agent:dag ./my-dag.json\n\n# Send to Honeycomb\nOTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io\nOTEL_EXPORTER_OTLP_HEADERS=x-honeycomb-team=<api-key>\n\`\`\`\n\nOr enable in \`model-router.json\`:\n\`\`\`json\n{ "otel": { "enabled": true, "serviceName": "ai-agencee" } }\n\`\`\``,
      },
      {
        id:      'spans',
        label:   'Span Attributes',
        content: `| Attribute | Example value |\n|---|---|\n| \`dag.id\` | \`run-abc123\` |\n| \`dag.name\` | \`Full Stack Build\` |\n| \`lane.id\` | \`backend\` |\n| \`llm.model\` | \`claude-sonnet-4-5\` |\n| \`llm.input_tokens\` | \`1024\` |\n| \`llm.cost_usd\` | \`0.0031\` |\n| \`dag.tenant_id\` | \`acme-corp\` |\n| \`dag.verdict\` | \`PASS\` |`,
      },
    ],
    relatedSlugs: ['cost-analytics', 'event-bus', 'dag-orchestration'],
  },
  {
    id:          'dashboard',
    slug:        'dashboard',
    title:       'Real-Time Dashboard',
    description: 'Live run progress, lane status, cost totals, and token throughput — powered by the event bus and SSE.',
    icon:        'api',
    category:    'observability',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `The dashboard consumes the **DagEventBus** over an SSE connection. Every lane status change, token emission, and cost update is relayed in real time to any connected browser or monitoring tool.\n\nThe HTTP + React layer is on the roadmap; current usage is via the SSE endpoint or programmatic event bus subscription.`,
      },
      {
        id:      'events',
        label:   'Dashboard Events',
        content: `| Event | What it shows |\n|---|---|\n| \`lane:start\` | Lane begins execution |\n| \`lane:complete\` | Final status + cost for a lane |\n| \`token:delta\` | Streaming token (live output) |\n| \`cost:update\` | Running cost total |\n| \`verdict:issued\` | Supervisor verdict (PASS / RETRY / ESCALATE) |\n| \`human-review-required\` | Escalation alert |`,
      },
      {
        id:      'sse',
        label:   'SSE Endpoint',
        content: `\`\`\`sh\n# Connect to the event stream for a specific run\ncurl -N http://localhost:3001/events?runId=run-abc123\n\`\`\`\n\nEach event is a standard \`text/event-stream\` message:\n\`\`\`\ndata: {"type":"lane:complete","laneId":"backend","costUsd":0.042}\n\`\`\``,
      },
    ],
    relatedSlugs: ['event-bus', 'websocket-sse', 'cost-analytics'],
  },
  {
    id:          'cost-analytics',
    slug:        'cost-analytics',
    title:       'Cost Analytics',
    description: 'Per-call, per-lane, and per-run cost tracking — exportable summaries and budget guards built in.',
    icon:        'document',
    category:    'observability',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `The \`CostTracker\` records a \`CallRecord\` for every LLM invocation (model, task type, input/output tokens, calculated cost). Records are aggregated into \`RunCostSummary\` per lane on completion.`,
      },
      {
        id:      'types',
        label:   'Types',
        content: `\`\`\`typescript\ninterface CallRecord {\n  laneId:       string\n  model:        string\n  taskType:     TaskType\n  inputTokens:  number\n  outputTokens: number\n  costUsd:      number\n  timestamp:    string\n}\n\ninterface RunCostSummary {\n  runId:      string\n  totalUsd:   number\n  byLane:     Record<string, number>\n  callCount:  number\n  exportedAt: string\n}\n\`\`\``,
      },
      {
        id:      'budget',
        label:   'Budget Guards',
        content: `Set a per-run budget in \`model-router.json\` or via the CLI:\n\n\`\`\`sh\nai-kit agent:dag ./my-dag.json --budget 2.50\n\`\`\`\n\nWhen the remaining budget falls below the cost of the next model call, the router falls back to a cheaper tier. If no tier fits, the lane is suspended and a \`budget-exceeded\` event fires.`,
      },
    ],
    relatedSlugs: ['model-routing', 'opentelemetry', 'audit-logging'],
  },
  {
    id:          'vector-memory',
    slug:        'vector-memory',
    title:       'Vector Memory',
    description: 'Persist and retrieve agent memories as vector embeddings — SQLite-backed for local dev, swappable for production.',
    icon:        'modular',
    category:    'dx',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `\`VectorMemory\` lets agents store and retrieve context across runs using embedding similarity. The default \`SqliteVectorMemory\` backend requires zero infrastructure — it runs entirely in-process using a local SQLite file.`,
      },
      {
        id:      'usage',
        label:   'Usage',
        content: `\`\`\`typescript\nimport { SqliteVectorMemory } from '@ai-agencee/engine'\n\nconst mem = new SqliteVectorMemory({ path: '.agents/memory.db', namespace: 'backend-lane' })\n\n// Store a memory\nawait mem.store('sprint-1-patterns', embeddingVector, { source: 'review' })\n\n// Retrieve top-3 similar memories\nconst results = await mem.search(queryEmbedding, { topK: 3, minScore: 0.75 })\n// results: Array<{ id, score, metadata }>\n\`\`\``,
      },
      {
        id:      'backends',
        label:   'Backends',
        content: `| Backend | Package | Use case |\n|---|---|---|\n| \`SqliteVectorMemory\` | built-in | Local dev, single-process |\n| \`PineconeVectorMemory\` | Enterprise | Cloud-scale retrieval |\n| \`PgVectorMemory\` | Enterprise | Existing Postgres infra |\n| \`QdrantVectorMemory\` | Enterprise | Self-hosted vector search |\n\nAll backends implement the same \`VectorMemory\` interface — swap at any time without changing agent code.`,
      },
    ],
    relatedSlugs: ['agent-types', 'plugin-system', 'dag-orchestration'],
  },
  {
    id:          'event-triggers',
    slug:        'event-triggers',
    title:       'Event Triggers',
    description: 'Launch DAG runs automatically from GitHub webhooks, cron schedules, or any HTTP event source.',
    icon:        'api',
    category:    'orchestration',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `The \`WebhookTrigger\` listens for incoming HTTP events and maps them to DAG run invocations. The built-in \`GitHubWebhookTrigger\` validates HMAC-SHA256 signatures and filters by event type before firing a run.`,
      },
      {
        id:      'github',
        label:   'GitHub Webhook',
        content: `\`\`\`typescript\nimport express from 'express'\nimport { GitHubWebhookTrigger } from '@ai-agencee/engine'\n\nconst app = express()\nconst trigger = new GitHubWebhookTrigger({\n  secret:  process.env.GITHUB_WEBHOOK_SECRET!,\n  events:  ['push', 'pull_request'],\n  dagFile: 'agents/dag.json',\n})\n\napp.post('/webhook/github', express.raw({ type: '*/*' }), trigger.handler())\n\`\`\`\n\nSet the webhook secret in GitHub → Settings → Webhooks → Secret.`,
      },
      {
        id:      'custom',
        label:   'Custom Trigger',
        content: `Implement \`WebhookTrigger\` to accept events from Slack, Jira, Linear, or any HTTP source — the interface requires only \`validate(req)\` and \`toRunConfig(payload)\`.`,
      },
    ],
    relatedSlugs: ['dag-orchestration', 'event-bus', 'notifications'],
  },
  {
    id:          'websocket-sse',
    slug:        'websocket-sse',
    title:       'WebSocket / SSE Gateway',
    description: 'Stream live DAG events to any browser or external tool over Server-Sent Events or WebSocket.',
    icon:        'performance',
    category:    'observability',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `The SSE gateway bridges the in-process \`DagEventBus\` to HTTP clients. Each GET to \`/events?runId=<id>\` opens a dedicated \`text/event-stream\` channel scoped to that run. WebSocket support adds bidirectional control (cancel, pause).`,
      },
      {
        id:      'sse',
        label:   'SSE Example',
        content: `\`\`\`javascript\n// Browser\nconst es = new EventSource('/events?runId=run-abc123')\n\nes.onmessage = (e) => {\n  const event = JSON.parse(e.data)\n  if (event.type === 'token:delta') renderToken(event.token)\n  if (event.type === 'lane:complete') updateLaneStatus(event.laneId, event.status)\n}\n\`\`\``,
      },
      {
        id:      'auth',
        label:   'Authentication',
        content: `All SSE and WebSocket endpoints require a valid Bearer token when \`OIDC_JWKS_URI\` is set. The \`principal\` claim from the JWT is used to scope event streams — a user only receives events for runs they initiated.`,
      },
    ],
    relatedSlugs: ['event-bus', 'dashboard', 'rbac'],
  },
  {
    id:          'provider-config',
    slug:        'provider-config',
    title:       'Provider Configuration',
    description: 'Unified configuration for all LLM providers via a single model-router.json file.',
    icon:        'tools',
    category:    'dx',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `All provider settings live in \`model-router.json\`. The file is validated against the published JSON Schema on startup. Providers are resolved lazily — only the provider selected for a given task is initialised.`,
      },
      {
        id:      'config',
        label:   'model-router.json',
        content: `\`\`\`json\n{\n  "defaultProvider": "anthropic",\n  "budgetUsd": 5.00,\n  "providers": {\n    "anthropic": { "apiKey": "\${SECRET:ANTHROPIC_API_KEY}" },\n    "openai":    { "apiKey": "\${SECRET:OPENAI_API_KEY}", "model": "gpt-4o" },\n    "ollama":    { "baseUrl": "http://localhost:11434" },\n    "mock":      { "enabled": true }\n  },\n  "tiers": {\n    "haiku":  { "provider": "anthropic", "model": "claude-haiku-4-5" },\n    "sonnet": { "provider": "anthropic", "model": "claude-sonnet-4-5" },\n    "opus":   { "provider": "anthropic", "model": "claude-opus-4-5" }\n  }\n}\n\`\`\``,
      },
      {
        id:      'env',
        label:   'Environment Override',
        content: `Any provider setting can be overridden at runtime via environment variables:\n\n\`\`\`sh\nAIKIT_PROVIDER=openai OPENAI_API_KEY=sk-... ai-kit agent:dag ./dag.json\n\`\`\`\n\nEnvironment variables take precedence over \`model-router.json\` values.`,
      },
    ],
    relatedSlugs: ['model-routing', 'secrets-management', 'json-schema'],
  },
  {
    id:          'notifications',
    slug:        'notifications',
    title:       'Notification Sinks',
    description: 'Push run completion, failure, and escalation alerts to Slack, email, or any HTTP endpoint.',
    icon:        'api',
    category:    'dx',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `A \`NotificationSink\` subscribes to the event bus and delivers formatted messages on configurable trigger events (run completed, lane failed, ESCALATE verdict, budget exceeded).`,
      },
      {
        id:      'slack',
        label:   'Slack',
        content: `\`\`\`typescript\nimport { SlackNotificationSink } from '@ai-agencee/engine'\n\nconst sink = SlackNotificationSink.fromEnv()\n// reads SLACK_WEBHOOK_URL + SLACK_NOTIFY_ON from environment\n\n// Or explicit:\nconst sink = new SlackNotificationSink({\n  webhookUrl: 'https://hooks.slack.com/services/...',\n  notifyOn:   ['lane:failed', 'escalate', 'budget-exceeded'],\n})\n\`\`\``,
      },
      {
        id:      'email',
        label:   'Email & Webhook',
        content: `\`\`\`typescript\n// Email via SMTP\nconst email = new SmtpNotificationSink({\n  host: 'smtp.example.com', port: 587,\n  from: 'ci@example.com',   to: 'team@example.com',\n})\n\n// Generic HTTP webhook\nconst webhook = new WebhookNotificationSink({\n  url:    'https://example.com/hooks/ai-agencee',\n  secret: process.env.WEBHOOK_SECRET,\n})\n\`\`\``,
      },
    ],
    relatedSlugs: ['event-bus', 'event-triggers', 'audit-logging'],
  },
  {
    id:          'demo-mode',
    slug:        'demo-mode',
    title:       'Demo Mode',
    description: 'Explore ai-agencee with six built-in workflows — zero API keys, zero cost, powered by the Mock provider.',
    icon:        'tools',
    category:    'dx',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `Demo mode runs a curated DAG from the \`agents/demos/\` directory using the built-in **Mock provider**. The Mock provider simulates word-level streaming and returns deterministic responses — no API key or internet connection required.`,
      },
      {
        id:      'scenarios',
        label:   'Demo Scenarios',
        content: `| # | Name | Description |\n|---|---|---|\n| 01 | App Boilerplate | Scaffold a new project from scratch |\n| 02 | Enterprise Skeleton | Multi-tenant app with RBAC and audit logging |\n| 03 | Website Build | Three-lane: design → frontend → e2e |\n| 04 | Feature in Context | Add a feature to an existing codebase |\n| 05 | MVP Sprint | Full five-phase sprint from BA → QA |\n| 06 | Resilience Showcase | Retry, circuit breaker, and ESCALATE demo |`,
      },
      {
        id:      'run',
        label:   'Running a Demo',
        content: `\`\`\`sh\n# Run demo scenario 01\nai-kit demo 01\n\n# Or use the script directly\nnode scripts/demo.js 01\n\n# List all available demos\nai-kit demo --list\n\`\`\``,
      },
    ],
    relatedSlugs: ['cli', 'dag-orchestration', 'provider-config'],
  },
  {
    id:          'json-schema',
    slug:        'json-schema',
    title:       'JSON Schema Validation',
    description: 'Machine-readable schemas for dag.json and agent.json — IDE auto-complete and CI validation out of the box.',
    icon:        'document',
    category:    'dx',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `ai-agencee publishes two JSON Schemas:\n- **\`schemas/dag.schema.json\`** — validates the DAG file (lanes, barriers, supervisors)\n- **\`schemas/agent.schema.json\`** — validates agent files (checks, model config, prompts)\n\nAdd a \`$schema\` field to any file for instant VS Code auto-complete.`,
      },
      {
        id:      'ide',
        label:   'VS Code Setup',
        content: `\`\`\`json\n// dag.json\n{\n  "$schema": "https://unpkg.com/@ai-agencee/engine/schemas/dag.schema.json",\n  "name": "My DAG",\n  "lanes": [...]\n}\n\`\`\`\n\nVS Code detects \`$schema\` automatically — no extension required.`,
      },
      {
        id:      'ci',
        label:   'CI Validation',
        content: `\`\`\`sh\n# Validate all dag.json files with ajv-cli\nnpx ajv-cli validate -s schemas/dag.schema.json -d \"agents/**/*.dag.json\"\n\n# Or use the built-in check command\nai-kit check\n\`\`\``,
      },
    ],
    relatedSlugs: ['dag-orchestration', 'agent-types', 'cli'],
  },
  {
    id:          'secrets-management',
    slug:        'secrets-management',
    title:       'Secrets Management',
    description: 'Pluggable secrets provider with .env, environment variable, and vault backends — no hardcoded API keys.',
    icon:        'encryption',
    category:    'enterprise',
    sections: [
      {
        id:      'overview',
        label:   'Overview',
        content: `The \`SecretsProvider\` interface decouples secret resolution from configuration. DAG and model-router JSON files reference secrets as \`\${SECRET:NAME}\` — the engine resolves them at runtime using the configured provider.`,
      },
      {
        id:      'providers',
        label:   'Built-in Providers',
        content: `| Provider | Class | Use case |\n|---|---|---|\n| .env file | \`DotenvSecretsProvider\` | Local development |\n| Environment | \`EnvSecretsProvider\` | Container / CI |\n| HashiCorp Vault | \`VaultSecretsProvider\` | Enterprise |\n| AWS Secrets Manager | \`AwsSecretsProvider\` | Enterprise |\n\n\`\`\`typescript\nimport { DotenvSecretsProvider } from '@ai-agencee/engine'\n\nconst secrets = new DotenvSecretsProvider('.env.local')\nconst apiKey  = await secrets.get('ANTHROPIC_API_KEY')\n\`\`\``,
      },
      {
        id:      'audit',
        label:   'Audit & Compliance',
        content: `Every call to \`secrets.get()\` writes an entry to the audit log:\n\n\`\`\`\n{ action: "secret:access", key: "ANTHROPIC_API_KEY", principal: "ci-runner", timestamp: "..." }\n\`\`\`\n\nCombine with PII scrubbing to ensure secrets never reach LLM providers even if accidentally injected into prompts.`,
      },
    ],
    relatedSlugs: ['pii-scrubbing', 'audit-logging', 'provider-config'],
  },
]
