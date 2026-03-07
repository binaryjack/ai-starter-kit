import type { IconName } from '@ai-agencee/ui/icons'

export type UseCasePersona =
  | 'CTO'
  | 'Engineering Lead'
  | 'Solo Dev'
  | 'Compliance Officer'
  | 'Architect'
  | 'Security Lead'
  | 'QA Lead'
  | 'Cloud Admin'
  | 'Sysadmin'

export interface UseCase {
  id: string
  persona: UseCasePersona
  icon: IconName
  title: string
  problem: string
  solution: string
  proof: string
  tag: string
}

export const USE_CASES: UseCase[] = [
  {
    id: 'transversal-features',
    persona: 'Engineering Lead',
    icon: 'trigger',
    title: 'Transversal features that span every story',
    problem:
      `Auth, observability, rate-limiting, and GDPR consent don't belong to any single squad — yet every squad is blocked until they land. Your backlog is full of "dependencies on platform team".`,
    solution:
      'Assign cross-cutting concerns to dedicated parallel lanes. A DAG-supervised swarm runs the Auth agent, Observability agent, and Compliance agent concurrently — each with clear boundaries — and synchronises at a merge gate before any feature agent touches them.',
    proof: 'Parallel lane execution · Barrier sync · ESCALATE if a prerequisite fails',
    tag: 'Parallel orchestration',
  },
  {
    id: 'data-sovereignty',
    persona: 'CTO',
    icon: 'encryption',
    title: 'GDPR & HIPAA — data never leaves the perimeter',
    problem:
      'Your legal team vetoed the AI pilot because the model API call sends source code and PII to a US datacentre. Every cloud LLM is a potential DPA violation.',
    solution:
      'Wire an Ollama node into the model router. All sensitive lanes (PII scrubbing, code review, security audit) are pinned to the local provider. Cloud models are allowed only for non-sensitive summarisation tasks. The routing config is a single JSON file — fully auditable.',
    proof: 'PiiScrubber · LLMProvider.kind = "ollama" · per-run audit log',
    tag: 'Data sovereignty',
  },
  {
    id: 'solo-dev-strict-mode',
    persona: 'Solo Dev',
    icon: 'worker',
    title: 'One developer — a full multi-agent team in strict mode',
    problem:
      "You're solo. You need the BA, architect, backend, frontend, and QA roles covered. But generic prompting gives you inconsistent output — agents forget their scope, hallucinate APIs, or silently drop constraints mid-session.",
    solution:
      'Drop your XML instruction manifest. Each role gets a typed <persona>, <constraints>, and <output-contract>. The Supervisor enforces them before any agent writes a line. No drift, no scope creep, no half-implemented patterns.',
    proof: 'XML manifest · Supervisor agent · quality-gates.xml validation',
    tag: 'Instruction enforcement',
  },
  {
    id: 'legacy-modernisation',
    persona: 'Engineering Lead',
    icon: 'modular',
    title: 'Legacy modernisation without the 2-year rewrite',
    problem:
      'You have 200k lines of jQuery and PHP. A rewrite is off the table. Incremental strangler-fig takes years of manual effort and kills team morale.',
    solution:
      'Feed the legacy codebase into the BA agent as context. The plan system decomposes the migration into vertical slices — each a DAG run that reads legacy code, writes an adapter, generates regression tests, and opens a PR. One slice per sprint, forever.',
    proof: 'Plan system · 5-phase DAG · per-task context injection',
    tag: 'Incremental migration',
  },
  {
    id: 'incident-autopilot',
    persona: 'CTO',
    icon: 'target',
    title: 'On-call at 3am — agent swarm triages before you wake up',
    problem:
      "A production alert fires. By the time the on-call dev is awake, coffee in hand, and has read the Sentry trace — it's been 20 minutes and customers are screaming.",
    solution:
      'A GitHubWebhookTrigger fires the incident DAG. One agent reads logs, another queries the metric spike, a third cross-references recent commits. The Supervisor composes the root-cause summary, drafts a patch, and opens a PR with a runbook comment — before the on-call phone rings a second time.',
    proof: 'GitHubWebhookTrigger · DAG execution · PR auto-description agent',
    tag: 'Incident automation',
  },
  {
    id: 'budget-controlled-spend',
    persona: 'CTO',
    icon: 'budget',
    title: 'AI spend that never surprises the CFO',
    problem:
      "Last month's LLM bill was 4x the forecast. Nobody knows which agent, tenant, or run caused it. The CFO wants a cap and the engineering team wants freedom.",
    solution:
      'Every run is tracked in TenantRunRegistry with a per-run token budget. The model router auto-downgrades to a cheaper model tier when the budget floor is near. Retry budgets prevent runaway exponential backoff. Full cost breakdown per lane in the run audit log.',
    proof: 'TenantRunRegistry · RetryBudget · ModelRouter cost tiers · per-run audit',
    tag: 'Cost governance',
  },
  {
    id: 'architect-adr-enforcement',
    persona: 'Architect',
    icon: 'architecture',
    title: 'ADRs that actually enforce themselves',
    problem:
      'Architecture decisions live in a wiki nobody reads. New devs re-introduce patterns already rejected six months ago. The architect finds out in code review — too late and too expensive.',
    solution:
      'The architecture agent reads quality-gates.xml and architecture-rules.xml on every plan run. It flags constraint violations before any backend or frontend agent writes a line, and auto-generates a structured ADR linked to the triggering task.',
    proof: 'architecture-rules.xml · quality-gates.xml · ADR agent · Supervisor ESCALATE',
    tag: 'Architecture governance',
  },
  {
    id: 'security-shift-left',
    persona: 'Security Lead',
    icon: 'security',
    title: 'Security review in the same sprint — not the next one',
    problem:
      'Security always reviews at the end. Findings block releases, engineers push back, and fixes are rushed. Your SAST/DAST pipeline catches issues after the code is already merged.',
    solution:
      'A security agent runs in parallel with backend and frontend lanes. It scans generated code for OWASP Top 10, checks dependency manifests for CVEs, and enforces RBAC schemas — all before the PR is opened. Findings trigger ESCALATE to the supervisor, not an email three days later.',
    proof: 'Security agent lane · PiiScrubber · RBAC schema check · per-run audit log',
    tag: 'Shift-left security',
  },
  {
    id: 'testers-generated-coverage',
    persona: 'QA Lead',
    icon: 'testing',
    title: 'Test coverage generated from the same context as the code',
    problem:
      'Tests are written after the fact, cover only happy paths, and drift from the implementation. Regression failures in staging are a weekly ritual that erodes team confidence.',
    solution:
      'The testing agent shares the exact same task context as the backend agent. It generates unit tests, integration contracts, and edge-case scenarios in the same DAG run — not a separate ticket. Coverage gates are enforced by quality-gates.xml before the lane can APPROVE.',
    proof: 'Testing agent · E2E agent · quality-gates.xml coverage gate · DAG APPROVE',
    tag: 'Automated QA',
  },
  {
    id: 'cloud-admin-iac-drift',
    persona: 'Cloud Admin',
    icon: 'cloud',
    title: 'IaC drift caught before it reaches production',
    problem:
      'Three environments, two cloud accounts, one out-of-date Terraform module. Someone applied a hotfix directly to prod last quarter. Now nobody trusts the state file.',
    solution:
      'A DAG run queries live infra state, diffs it against the declared IaC, and generates a remediation PR with the delta already written. The Cloud Admin reviews a three-line diff instead of a three-hour audit.',
    proof: 'DAG execution · per-task context injection · PR auto-description agent · audit log',
    tag: 'IaC governance',
  },
  {
    id: 'sysadmin-runbook-sync',
    persona: 'Sysadmin',
    icon: 'network',
    title: 'Runbooks that update themselves after every incident',
    problem:
      'The runbook says restart service X. Service X was renamed eight months ago. Nobody updated the doc. The on-call engineer spent 40 minutes on something that should have taken two.',
    solution:
      'A post-incident DAG run reads the resolution steps from the closed PR, diffs them against the existing runbook, and opens a documentation PR with the delta. The knowledge base stays current with zero manual effort.',
    proof: 'GitHubWebhookTrigger · summary agent · document agent · PR auto-description',
    tag: 'Ops knowledge base',
  },
] satisfies UseCase[]
