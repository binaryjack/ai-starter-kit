export interface PricingFeature {
  label:     string
  tooltip?:  string
}

export interface PricingTier {
  id:                   string
  name:                 string
  slug:                 string
  monthlyUsd:           number | null       // null = "Custom"
  yearlyUsd:            number | null
  badge?:               string              // e.g. "Most Popular"
  description:          string
  tokenLimitPerMonth:   string             // human-readable
  concurrentRuns:       number | null       // null = unlimited
  features:             PricingFeature[]
  notIncluded:          string[]
  ctaLabel:             string
  ctaHref:              string
  highlighted:          boolean
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id:                 'free',
    name:               'Free',
    slug:               'free',
    monthlyUsd:         0,
    yearlyUsd:          0,
    description:        'Everything you need to evaluate ai-agencee locally. Zero API keys, zero cost.',
    tokenLimitPerMonth: '—',
    concurrentRuns:     1,
    features: [
      { label: 'Full CLI (ai-kit commands)' },
      { label: 'MCP integration (Claude Desktop + VS Code)' },
      { label: 'Mock provider — no API keys needed' },
      { label: 'DAG editor & Mermaid visualizer' },
      { label: 'Community support (GitHub)' },
      { label: 'Unlimited local runs (mock)' },
    ],
    notIncluded: [
      'Real LLM providers (Anthropic / OpenAI)',
      'Managed API keys',
      'Cost dashboards',
      'Audit logs',
      'SLA',
    ],
    ctaLabel:    'Get started free',
    ctaHref:     'https://github.com/binaryjack/ai-agencee',
    highlighted: false,
  },
  {
    id:                 'starter',
    name:               'Starter',
    slug:               'starter',
    monthlyUsd:         29,
    yearlyUsd:          29 * 11,
    badge:              'Cloud — Coming Soon',
    description:        'For indie developers and freelancers who want to run real LLM workflows on their own API keys. Cloud launch coming soon — join the waitlist.',
    tokenLimitPerMonth: '1 M tokens / month',
    concurrentRuns:     5,
    features: [
      { label: 'Everything in Free' },
      { label: 'Anthropic & OpenAI provider support (BYOK)' },
      { label: '1 M tokens / month included' },
      { label: '5 concurrent agent runs' },
      { label: 'Basic cost tracking dashboard' },
      { label: 'Email support' },
      { label: '30-day audit log retention' },
    ],
    notIncluded: [
      'Managed API keys',
      'Custom agent templates',
      'Private DAGs',
      'Compliance exports',
    ],
    ctaLabel:    'Join the waitlist',
    ctaHref:     '/contact',
    highlighted: false,
  },
  {
    id:                 'professional',
    name:               'Professional',
    slug:               'professional',
    monthlyUsd:         99,
    yearlyUsd:          99 * 11,
    badge:              'Most Popular — Coming Soon',
    description:        'For product squads who need managed keys, compliance logs, and custom agents. Cloud launch coming soon — join the waitlist.',
    tokenLimitPerMonth: '10 M tokens / month',
    concurrentRuns:     25,
    features: [
      { label: 'Everything in Starter' },
      { label: '10 M tokens / month' },
      { label: '25 concurrent runs' },
      { label: 'Managed API keys — we handle billing & rate limits', tooltip: 'We absorb provider cost; you get predictable per-seat pricing' },
      { label: 'Advanced cost dashboard + cost optimization tips' },
      { label: 'Custom agent templates (3 / month)' },
      { label: 'Private DAGs' },
      { label: '1-year audit log retention' },
      { label: 'Compliance export (CSV / JSON)' },
      { label: 'Priority support (< 24 h SLA)' },
      { label: '99 % uptime SLA' },
    ],
    notIncluded: [
      'Unlimited tokens',
      'White-label',
      'Dedicated infrastructure',
      'Ollama / Bedrock / Gemini providers',
    ],
    ctaLabel:    'Join the waitlist',
    ctaHref:     '/contact',
    highlighted: true,
  },
  {
    id:                 'enterprise',
    name:               'Enterprise',
    slug:               'enterprise',
    monthlyUsd:         null,
    yearlyUsd:          null,
    description:        'Dedicated infrastructure, unlimited scale, and on-call engineering support for teams building AI-native products. Contact us to be a design partner.',
    tokenLimitPerMonth: 'Unlimited (custom tiers)',
    concurrentRuns:     null,
    features: [
      { label: 'Everything in Professional' },
      { label: 'Unlimited tokens (custom allocation)' },
      { label: 'Unlimited concurrent runs' },
      { label: 'Dedicated infrastructure (single-tenant)' },
      { label: 'Custom model providers — Ollama, Bedrock, Gemini' },
      { label: 'White-label capabilities' },
      { label: 'Custom audit log retention' },
      { label: '99.9 % uptime SLA' },
      { label: 'Dedicated account manager' },
      { label: 'On-site or remote onboarding' },
      { label: 'Custom integrations (Jira, Slack, Teams)' },
    ],
    notIncluded: [],
    ctaLabel:    'Contact us',
    ctaHref:     '/contact',
    highlighted: false,
  },
]

export interface PricingFaqItem {
  question: string
  answer:   string
}

export const PRICING_FAQ: PricingFaqItem[] = [
  {
    question: 'Do I need an API key to try ai-agencee?',
    answer:   'No. The Free tier uses the built-in Mock provider which produces realistic deterministic output at zero cost. You can run full multi-agent DAGs, trigger retries, test escalations, and integrate with your CI pipeline — all without spending anything.',
  },
  {
    question: 'What does "Managed API keys" mean on Professional?',
    answer:   'We provision and rotate Anthropic/OpenAI keys on your behalf. You get predictable per-seat pricing; we absorb rate-limit complexity and per-token billing.',
  },
  {
    question: 'How is token usage counted?',
    answer:   'We count input + output tokens across all LLM calls within a billing month. The mock provider does not consume tokens. Tokens reset on your billing anniversary date.',
  },
  {
    question: 'When will the cloud product launch?',
    answer:   'We are targeting a public cloud launch later in 2026. The architecture, pricing tiers, and feature set are finalised — we are completing infrastructure and onboarding tooling. Join the waitlist via the contact form to be notified at launch.',
  },
  {
    question: 'Can I self-host?',
    answer:   'Yes — the CLI, DAG engine, and MCP server are fully open source (MIT) and available today. Self-hosted deployments have no token limits or SLA. The SaaS tiers will add managed keys, persistent dashboards, and enterprise compliance features once the cloud product launches.',
  },
]
