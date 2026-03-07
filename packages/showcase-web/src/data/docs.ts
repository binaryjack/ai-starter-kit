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
]
