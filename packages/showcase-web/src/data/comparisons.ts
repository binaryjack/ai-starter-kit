export type ComparisonStatus = 'yes' | 'no' | 'partial'

export interface ComparisonRow {
  need:           string
  genericChat:    ComparisonStatus
  codegenCopilot: ComparisonStatus
  aiAgencee:      ComparisonStatus
  notes?:         string
}

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    need:           'Structured multi-step plan from a vague idea',
    genericChat:    'no',
    codegenCopilot: 'partial',
    aiAgencee:      'yes',
    notes:          '5-phase BA-led discovery → wired sprint plan',
  },
  {
    need:           'Parallel agent coordination with sync points',
    genericChat:    'no',
    codegenCopilot: 'no',
    aiAgencee:      'yes',
    notes:          'DAG barriers, soft-align, read-contract',
  },
  {
    need:           'Automatic retry + escalation on failure',
    genericChat:    'no',
    codegenCopilot: 'no',
    aiAgencee:      'yes',
    notes:          'retryBudget, HANDOFF, ESCALATE verdicts',
  },
  {
    need:           'Human-in-the-loop approval gates',
    genericChat:    'no',
    codegenCopilot: 'no',
    aiAgencee:      'yes',
    notes:          'needs-human-review checkpoint',
  },
  {
    need:           'Enterprise: RBAC, audit, multi-tenant, PII, OIDC',
    genericChat:    'no',
    codegenCopilot: 'no',
    aiAgencee:      'yes',
    notes:          'E1–E13 enforced at runtime',
  },
  {
    need:           'Zero-cost evaluation + CI integration',
    genericChat:    'no',
    codegenCopilot: 'no',
    aiAgencee:      'yes',
    notes:          'Mock provider, $0.00, no keys',
  },
  {
    need:           'Extensible: custom agents, checks, providers',
    genericChat:    'partial',
    codegenCopilot: 'partial',
    aiAgencee:      'yes',
    notes:          'Plugin system + TypeScript Builder API',
  },
  {
    need:           'Per-run cost tracking & budget enforcement',
    genericChat:    'no',
    codegenCopilot: 'no',
    aiAgencee:      'yes',
  },
  {
    need:           'Real-time streaming output',
    genericChat:    'partial',
    codegenCopilot: 'partial',
    aiAgencee:      'yes',
    notes:          'Every provider, including Mock',
  },
  {
    need:           'MCP / Claude Desktop integration',
    genericChat:    'no',
    codegenCopilot: 'partial',
    aiAgencee:      'yes',
    notes:          'Native MCP server, zero extra config',
  },
]

export interface StatItem {
  value: string
  label: string
  href?:  string
}

export const STATS: StatItem[] = [
  { value: '424',  label: 'Tests passing' },
  { value: '13',   label: 'Enterprise features (E1–E13)' },
  { value: '7',    label: 'LLM providers' },
  { value: '$0',   label: 'Cost to try — live simulator', href: '/simulate' },
]
