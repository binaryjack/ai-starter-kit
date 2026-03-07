// ---------------------------------------------------------------------------
// Simulator scenario definitions — scripted event timelines for the browser
// showroom. Every delayMs is relative to the previous event (differential).
// The SSE API route streams these with proper timing.
// ---------------------------------------------------------------------------

export type SimEventKind =
  | 'dag:start'
  | 'lane:start'
  | 'lane:retry'
  | 'lane:escalate'
  | 'lane:handoff'
  | 'lane:human-review'
  | 'lane:abort'
  | 'lane:complete'
  | 'barrier:waiting'
  | 'barrier:released'
  | 'token:stream'
  | 'pii:scrubbed'
  | 'verdict:issued'
  | 'cost:update'
  | 'dag:complete'
  | 'dag:abort'

export interface ScriptedEvent {
  delayMs:      number
  type:         SimEventKind
  laneId?:      string
  content?:     string
  status?:      'pass' | 'escalated' | 'handed-off' | 'aborted'
  abortReason?: string
  costUsd?:     number
  totalUsd?:    number
  attempt?:     number
  reason?:      string
  targetLaneId?: string
  dagName?:     string
  laneIds?:     string[]
  barrierName?: string
  ready?:       number
  total?:       number
  pattern?:     string
  count?:       number
  durationMs?:  number
  verdict?:     string
}

export interface SimLane {
  id:         string
  label:      string
  icon:       string
  dependsOn:  string[]
}

export interface SimScenario {
  id:          string
  number:      string
  title:       string
  subtitle:    string
  description: string
  tags:        string[]
  accentColor: string   // Tailwind color name for gradient
  lanes:       SimLane[]
  events:      ScriptedEvent[]
}

// ---------------------------------------------------------------------------
// Scenario 07 — PR Auto-Review
// ---------------------------------------------------------------------------
const PR_REVIEW_EVENTS: ScriptedEvent[] = [
  { delayMs: 0,    type: 'dag:start',    dagName: 'PR Auto-Review', laneIds: ['security-scan','architecture-review','test-coverage','review-summary'] },
  { delayMs: 500,  type: 'lane:start',   laneId: 'security-scan' },
  { delayMs: 300,  type: 'lane:start',   laneId: 'architecture-review' },
  { delayMs: 300,  type: 'lane:start',   laneId: 'test-coverage' },
  { delayMs: 1200, type: 'pii:scrubbed', laneId: 'security-scan', pattern: 'GITHUB_TOKEN', count: 1 },
  { delayMs: 800,  type: 'token:stream', laneId: 'security-scan',        content: 'Scanning diff for credentials and injection vectors...' },
  { delayMs: 1200, type: 'token:stream', laneId: 'architecture-review',  content: 'Checking for breaking API contract changes...' },
  { delayMs: 600,  type: 'token:stream', laneId: 'security-scan',        content: 'CRITICAL: hardcoded secret detected in src/config.ts:12' },
  { delayMs: 1000, type: 'token:stream', laneId: 'test-coverage',        content: 'Looking for __tests__/ directory...' },
  { delayMs: 800,  type: 'token:stream', laneId: 'architecture-review',  content: 'No route signature changes — API contracts intact ✅' },
  { delayMs: 600,  type: 'verdict:issued', laneId: 'security-scan',      verdict: 'RETRY' },
  { delayMs: 400,  type: 'lane:retry',   laneId: 'security-scan', attempt: 1, reason: 'Secret removed from diff — re-running clean analysis' },
  { delayMs: 800,  type: 'verdict:issued', laneId: 'architecture-review', verdict: 'PASS' },
  { delayMs: 300,  type: 'lane:complete', laneId: 'architecture-review', status: 'pass', costUsd: 0.0014 },
  { delayMs: 200,  type: 'cost:update',  totalUsd: 0.0014 },
  { delayMs: 600,  type: 'token:stream', laneId: 'test-coverage',        content: 'No __tests__/ found. Trying test/ and *.test.ts patterns...' },
  { delayMs: 1000, type: 'token:stream', laneId: 'security-scan',        content: 'Re-analyzing with credentials redacted [REDACTED:GITHUB_TOKEN]...' },
  { delayMs: 800,  type: 'token:stream', laneId: 'test-coverage',        content: 'No test files found — coverage delta unmeasurable' },
  { delayMs: 900,  type: 'token:stream', laneId: 'security-scan',        content: '1 CRITICAL: secret exposure confirmed. 0 HIGH: no injection vectors.' },
  { delayMs: 600,  type: 'verdict:issued', laneId: 'test-coverage',      verdict: 'ESCALATE' },
  { delayMs: 300,  type: 'lane:escalate', laneId: 'test-coverage',       reason: 'No test files found — coverage cannot be measured. Tests required before merge.' },
  { delayMs: 300,  type: 'lane:complete', laneId: 'test-coverage',       status: 'escalated', costUsd: 0.0007 },
  { delayMs: 200,  type: 'cost:update',  totalUsd: 0.0021 },
  { delayMs: 400,  type: 'verdict:issued', laneId: 'security-scan',      verdict: 'PASS' },
  { delayMs: 300,  type: 'lane:complete', laneId: 'security-scan',       status: 'pass', costUsd: 0.0022 },
  { delayMs: 200,  type: 'cost:update',  totalUsd: 0.0043 },
  { delayMs: 600,  type: 'lane:start',   laneId: 'review-summary' },
  { delayMs: 900,  type: 'token:stream', laneId: 'review-summary',       content: 'Loading contracts from security-scan and architecture-review...' },
  { delayMs: 1000, type: 'token:stream', laneId: 'review-summary',       content: '## 🤖 Automated Review Summary' },
  { delayMs: 800,  type: 'token:stream', laneId: 'review-summary',       content: '### Security: 1 CRITICAL — secret exposure (remediated ✅)' },
  { delayMs: 700,  type: 'token:stream', laneId: 'review-summary',       content: '### Architecture: No breaking changes ✅' },
  { delayMs: 700,  type: 'token:stream', laneId: 'review-summary',       content: '### Tests: ⚠️  ESCALATED — coverage unmeasurable' },
  { delayMs: 700,  type: 'token:stream', laneId: 'review-summary',       content: '### Recommendation: **REQUEST_CHANGES** — add tests before merge.' },
  { delayMs: 600,  type: 'verdict:issued', laneId: 'review-summary',     verdict: 'PASS' },
  { delayMs: 300,  type: 'lane:complete', laneId: 'review-summary',      status: 'pass', costUsd: 0.0019 },
  { delayMs: 200,  type: 'cost:update',  totalUsd: 0.0062 },
  { delayMs: 500,  type: 'dag:complete', totalUsd: 0.0062, durationMs: 34000 },
]

// ---------------------------------------------------------------------------
// Scenario 08 — Zero-to-Deployed Feature
// ---------------------------------------------------------------------------
const ZERO_TO_DEPLOYED_EVENTS: ScriptedEvent[] = [
  { delayMs: 0,    type: 'dag:start',    dagName: 'Zero-to-Deployed Feature', laneIds: ['brief-analysis','architecture','backend-impl','frontend-impl','test-suite','release-notes'] },
  { delayMs: 500,  type: 'lane:start',   laneId: 'brief-analysis' },
  { delayMs: 1400, type: 'token:stream', laneId: 'brief-analysis', content: 'Parsing feature brief: Real-time notification system...' },
  { delayMs: 1500, type: 'token:stream', laneId: 'brief-analysis', content: 'Generating user stories (4) and acceptance criteria (6)...' },
  { delayMs: 1200, type: 'token:stream', laneId: 'brief-analysis', content: 'Complexity estimate: M — 2-3 days backend, 1-2 days frontend' },
  { delayMs: 900,  type: 'verdict:issued', laneId: 'brief-analysis', verdict: 'PASS' },
  { delayMs: 300,  type: 'lane:complete', laneId: 'brief-analysis', status: 'pass', costUsd: 0.0018 },
  { delayMs: 200,  type: 'cost:update',  totalUsd: 0.0018 },
  { delayMs: 500,  type: 'lane:start',   laneId: 'architecture' },
  { delayMs: 1200, type: 'token:stream', laneId: 'architecture',    content: 'Reading approved spec from brief-analysis contract...' },
  { delayMs: 1400, type: 'token:stream', laneId: 'architecture',    content: 'Designing: REST API + SSE gateway for notification streaming' },
  { delayMs: 1200, type: 'token:stream', laneId: 'architecture',    content: 'Schema: notifications(id, user_id, type, message, read_at, created_at)' },
  { delayMs: 1000, type: 'token:stream', laneId: 'architecture',    content: 'API contract: GET /notifications, POST /notifications/read/:id' },
  { delayMs: 900,  type: 'verdict:issued', laneId: 'architecture',  verdict: 'PASS' },
  { delayMs: 300,  type: 'lane:complete', laneId: 'architecture',   status: 'pass', costUsd: 0.0031 },
  { delayMs: 200,  type: 'cost:update',  totalUsd: 0.0049 },
  { delayMs: 500,  type: 'lane:start',   laneId: 'backend-impl' },
  { delayMs: 300,  type: 'lane:start',   laneId: 'frontend-impl' },
  { delayMs: 1000, type: 'token:stream', laneId: 'backend-impl',    content: 'Reading architecture design contract...' },
  { delayMs: 600,  type: 'token:stream', laneId: 'frontend-impl',   content: 'Loading architecture contract for component design...' },
  { delayMs: 1000, type: 'token:stream', laneId: 'backend-impl',    content: 'Generating: GET /api/notifications route handler' },
  { delayMs: 700,  type: 'token:stream', laneId: 'frontend-impl',   content: 'Generating: NotificationBell component with badge count' },
  { delayMs: 900,  type: 'token:stream', laneId: 'backend-impl',    content: 'Generating: DB migration CREATE TABLE notifications...' },
  { delayMs: 800,  type: 'token:stream', laneId: 'frontend-impl',   content: 'Generating: useNotifications() SSE subscription hook' },
  { delayMs: 800,  type: 'token:stream', laneId: 'backend-impl',    content: 'Generating: notification:created event emitter for DAG bus' },
  { delayMs: 700,  type: 'token:stream', laneId: 'frontend-impl',   content: 'Generating: <NotificationToast /> with auto-dismiss' },
  { delayMs: 700,  type: 'token:stream', laneId: 'backend-impl',    content: 'Publishing OpenAPI spec to contract store...' },
  { delayMs: 600,  type: 'barrier:waiting', barrierName: 'impl-ready', ready: 1, total: 2 },
  { delayMs: 500,  type: 'verdict:issued', laneId: 'frontend-impl', verdict: 'PASS' },
  { delayMs: 400,  type: 'barrier:waiting', barrierName: 'impl-ready', ready: 2, total: 2 },
  { delayMs: 300,  type: 'barrier:released', barrierName: 'impl-ready' },
  { delayMs: 200,  type: 'verdict:issued', laneId: 'backend-impl',  verdict: 'PASS' },
  { delayMs: 200,  type: 'lane:complete', laneId: 'backend-impl',   status: 'pass', costUsd: 0.0041 },
  { delayMs: 100,  type: 'lane:complete', laneId: 'frontend-impl',  status: 'pass', costUsd: 0.0037 },
  { delayMs: 200,  type: 'cost:update',  totalUsd: 0.0127 },
  { delayMs: 600,  type: 'lane:start',   laneId: 'test-suite' },
  { delayMs: 1200, type: 'token:stream', laneId: 'test-suite',       content: 'Loading API spec and UI spec from contracts...' },
  { delayMs: 1400, type: 'token:stream', laneId: 'test-suite',       content: 'Generating: Vitest unit tests for useNotifications()' },
  { delayMs: 1200, type: 'token:stream', laneId: 'test-suite',       content: 'Generating: Supertest integration tests for /api/notifications' },
  { delayMs: 1200, type: 'token:stream', laneId: 'test-suite',       content: 'Generating: Playwright E2E — user receives notification during workflow' },
  { delayMs: 900,  type: 'verdict:issued', laneId: 'test-suite',     verdict: 'PASS' },
  { delayMs: 300,  type: 'lane:complete', laneId: 'test-suite',      status: 'pass', costUsd: 0.0028 },
  { delayMs: 200,  type: 'cost:update',  totalUsd: 0.0155 },
  { delayMs: 600,  type: 'lane:start',   laneId: 'release-notes' },
  { delayMs: 1200, type: 'token:stream', laneId: 'release-notes',    content: 'Compiling release artefacts from all lane contracts...' },
  { delayMs: 1000, type: 'token:stream', laneId: 'release-notes',    content: 'CHANGELOG.md: feat(notifications): real-time in-app notification system' },
  { delayMs: 900,  type: 'token:stream', laneId: 'release-notes',    content: 'Semver: MINOR bump — new feature, fully backward compatible' },
  { delayMs: 900,  type: 'token:stream', laneId: 'release-notes',    content: 'Deployment checklist: 1 migration, rollback: DROP TABLE notifications' },
  { delayMs: 700,  type: 'verdict:issued', laneId: 'release-notes',  verdict: 'PASS' },
  { delayMs: 300,  type: 'lane:complete', laneId: 'release-notes',   status: 'pass', costUsd: 0.0021 },
  { delayMs: 200,  type: 'cost:update',  totalUsd: 0.0176 },
  { delayMs: 500,  type: 'dag:complete', totalUsd: 0.0176, durationMs: 46000 },
]

// ---------------------------------------------------------------------------
// Scenario 09 — Live Security Audit
// ---------------------------------------------------------------------------
const SECURITY_AUDIT_EVENTS: ScriptedEvent[] = [
  { delayMs: 0,    type: 'dag:start',    dagName: 'Live Security Audit', laneIds: ['cve-scan','secrets-scan','owasp-checklist','risk-report','notify'] },
  { delayMs: 500,  type: 'lane:start',   laneId: 'cve-scan' },
  { delayMs: 300,  type: 'lane:start',   laneId: 'secrets-scan' },
  { delayMs: 300,  type: 'lane:start',   laneId: 'owasp-checklist' },
  { delayMs: 1000, type: 'pii:scrubbed', laneId: 'secrets-scan', pattern: 'GITHUB_TOKEN', count: 1 },
  { delayMs: 400,  type: 'pii:scrubbed', laneId: 'secrets-scan', pattern: 'AWS_ACCESS_KEY', count: 1 },
  { delayMs: 400,  type: 'pii:scrubbed', laneId: 'secrets-scan', pattern: 'OPENAI_KEY', count: 1 },
  { delayMs: 300,  type: 'token:stream', laneId: 'cve-scan',         content: 'Scanning 247 packages against NVD database...' },
  { delayMs: 600,  type: 'token:stream', laneId: 'secrets-scan',     content: '3 secrets detected and redacted — analyzing exposure paths...' },
  { delayMs: 600,  type: 'token:stream', laneId: 'owasp-checklist',  content: 'OWASP A01: checking for unguarded admin routes...' },
  { delayMs: 800,  type: 'lane:retry',   laneId: 'cve-scan', attempt: 1, reason: 'NVD rate-limited — switching to offline CVE cache' },
  { delayMs: 600,  type: 'token:stream', laneId: 'cve-scan',         content: 'Offline cache loaded. Resuming scan...' },
  { delayMs: 700,  type: 'token:stream', laneId: 'secrets-scan',     content: 'Finding 1: GITHUB_TOKEN hardcoded in src/config.ts:12 (CRITICAL)' },
  { delayMs: 600,  type: 'token:stream', laneId: 'owasp-checklist',  content: 'A01: 2 admin endpoints missing authorization middleware (HIGH)' },
  { delayMs: 700,  type: 'token:stream', laneId: 'cve-scan',         content: 'CVE-2024-1234: lodash@4.17.20 — Prototype Pollution (CVSS 9.4 CRITICAL)' },
  { delayMs: 600,  type: 'token:stream', laneId: 'secrets-scan',     content: 'Finding 2: AWS_ACCESS_KEY in .env.backup (CRITICAL)' },
  { delayMs: 700,  type: 'token:stream', laneId: 'owasp-checklist',  content: 'A03: raw SQL concatenation in UserRepository.search() (HIGH)' },
  { delayMs: 600,  type: 'token:stream', laneId: 'cve-scan',         content: 'CVE-2025-8892: express@4.18.1 — ReDoS (CVSS 7.5 HIGH)' },
  { delayMs: 600,  type: 'token:stream', laneId: 'secrets-scan',     content: 'Finding 3: OPENAI_KEY in docker-compose.yml:34 (CRITICAL)' },
  { delayMs: 600,  type: 'verdict:issued', laneId: 'cve-scan',        verdict: 'PASS' },
  { delayMs: 200,  type: 'verdict:issued', laneId: 'secrets-scan',    verdict: 'PASS' },
  { delayMs: 200,  type: 'verdict:issued', laneId: 'owasp-checklist', verdict: 'PASS' },
  { delayMs: 200,  type: 'lane:complete', laneId: 'cve-scan',         status: 'pass', costUsd: 0.0024 },
  { delayMs: 100,  type: 'lane:complete', laneId: 'secrets-scan',     status: 'pass', costUsd: 0.0019 },
  { delayMs: 100,  type: 'lane:complete', laneId: 'owasp-checklist',  status: 'pass', costUsd: 0.0021 },
  { delayMs: 200,  type: 'cost:update',  totalUsd: 0.0064 },
  { delayMs: 600,  type: 'lane:start',   laneId: 'risk-report' },
  { delayMs: 1400, type: 'token:stream', laneId: 'risk-report',       content: 'Loading findings from all 3 scanner contracts...' },
  { delayMs: 1200, type: 'token:stream', laneId: 'risk-report',       content: 'Risk Matrix: 3 CRITICAL · 2 HIGH · 1 MEDIUM · 0 LOW' },
  { delayMs: 1000, type: 'token:stream', laneId: 'risk-report',       content: 'Overall Risk Posture: 🔴 CRITICAL' },
  { delayMs: 1000, type: 'token:stream', laneId: 'risk-report',       content: 'Priority 1: Rotate all 3 exposed credentials IMMEDIATELY' },
  { delayMs: 900,  type: 'token:stream', laneId: 'risk-report',       content: 'Priority 2: Patch lodash → 4.17.21 (estimated: 15 min, zero risk)' },
  { delayMs: 900,  type: 'token:stream', laneId: 'risk-report',       content: 'Priority 3: Parameterise SQL in UserRepository.search()' },
  { delayMs: 700,  type: 'verdict:issued', laneId: 'risk-report',     verdict: 'PASS' },
  { delayMs: 300,  type: 'lane:complete', laneId: 'risk-report',      status: 'pass', costUsd: 0.0038 },
  { delayMs: 200,  type: 'cost:update',  totalUsd: 0.0102 },
  { delayMs: 600,  type: 'lane:start',   laneId: 'notify' },
  { delayMs: 1200, type: 'token:stream', laneId: 'notify',            content: 'Composing Slack alert: 🔴 CRITICAL — 3 findings require immediate action' },
  { delayMs: 1000, type: 'token:stream', laneId: 'notify',            content: 'Creating 3 Jira SECURITY tickets — one per CRITICAL finding' },
  { delayMs: 900,  type: 'token:stream', laneId: 'notify',            content: 'Email dispatched → security-team@company.com (HTML report attached)' },
  { delayMs: 600,  type: 'verdict:issued', laneId: 'notify',          verdict: 'PASS' },
  { delayMs: 300,  type: 'lane:complete', laneId: 'notify',           status: 'pass', costUsd: 0.0014 },
  { delayMs: 200,  type: 'cost:update',  totalUsd: 0.0116 },
  { delayMs: 500,  type: 'dag:complete', totalUsd: 0.0116, durationMs: 38000 },
]

// ---------------------------------------------------------------------------
// Scenario 10 — Incident Autopilot
// ---------------------------------------------------------------------------
const INCIDENT_AUTOPILOT_EVENTS: ScriptedEvent[] = [
  { delayMs: 0,    type: 'dag:start',    dagName: 'Incident Autopilot — P1', laneIds: ['log-analyser','root-cause','fix-generator','db-specialist','human-review-gate','post-mortem'] },
  { delayMs: 500,  type: 'lane:start',   laneId: 'log-analyser' },
  { delayMs: 1400, type: 'token:stream', laneId: 'log-analyser',         content: 'Parsing 847 log lines from incident window 14:31:44 – 14:32:01...' },
  { delayMs: 1200, type: 'token:stream', laneId: 'log-analyser',         content: 'Pattern: DB connection timeout ×47 (14:31:47 – 14:32:00)' },
  { delayMs: 1000, type: 'token:stream', laneId: 'log-analyser',         content: 'Pattern: api-gateway 503 errors spike at 14:31:46 (+340% vs baseline)' },
  { delayMs: 1000, type: 'token:stream', laneId: 'log-analyser',         content: 'Circuit breaker OPEN at 14:32:00 — 13s after first timeout' },
  { delayMs: 700,  type: 'verdict:issued', laneId: 'log-analyser',       verdict: 'PASS' },
  { delayMs: 300,  type: 'lane:complete', laneId: 'log-analyser',        status: 'pass', costUsd: 0.0009 },
  { delayMs: 200,  type: 'cost:update',  totalUsd: 0.0009 },
  { delayMs: 600,  type: 'lane:start',   laneId: 'root-cause' },
  { delayMs: 1200, type: 'token:stream', laneId: 'root-cause',            content: 'Loading log analysis contract. Running 5-Whys...' },
  { delayMs: 1100, type: 'token:stream', laneId: 'root-cause',            content: 'Why 1: api-gateway returning 503 → circuit breaker OPEN' },
  { delayMs: 1000, type: 'token:stream', laneId: 'root-cause',            content: 'Why 2: circuit breaker opened → db-pool at max capacity (10/10)' },
  { delayMs: 1000, type: 'token:stream', laneId: 'root-cause',            content: 'Why 3: pool exhausted → slow query holding connections >5s' },
  { delayMs: 1000, type: 'token:stream', laneId: 'root-cause',            content: 'Why 4: slow query → missing index on notifications.user_id' },
  { delayMs: 900,  type: 'token:stream', laneId: 'root-cause',            content: '✅ Root cause (95% confidence): Missing DB index + undersized connection pool' },
  { delayMs: 700,  type: 'verdict:issued', laneId: 'root-cause',          verdict: 'PASS' },
  { delayMs: 300,  type: 'lane:complete', laneId: 'root-cause',           status: 'pass', costUsd: 0.0017 },
  { delayMs: 200,  type: 'cost:update',  totalUsd: 0.0026 },
  { delayMs: 600,  type: 'lane:start',   laneId: 'fix-generator' },
  { delayMs: 1200, type: 'token:stream', laneId: 'fix-generator',         content: 'Loading root cause analysis. Generating fix proposal...' },
  { delayMs: 1000, type: 'token:stream', laneId: 'fix-generator',         content: 'PostgreSQL issue detected — specialist expertise required' },
  { delayMs: 700,  type: 'token:stream', laneId: 'fix-generator',         content: '⟶ Initiating HANDOFF to db-specialist...' },
  { delayMs: 500,  type: 'lane:handoff', laneId: 'fix-generator', targetLaneId: 'db-specialist', reason: 'PostgreSQL connection pool + missing index — DB expert required' },
  { delayMs: 400,  type: 'lane:complete', laneId: 'fix-generator',        status: 'handed-off', costUsd: 0.0008 },
  { delayMs: 300,  type: 'cost:update',  totalUsd: 0.0034 },
  { delayMs: 300,  type: 'lane:start',   laneId: 'db-specialist', reason: 'Received handoff from fix-generator' },
  { delayMs: 1400, type: 'token:stream', laneId: 'db-specialist',         content: 'Received handoff context. Analysing PostgreSQL configuration...' },
  { delayMs: 1200, type: 'token:stream', laneId: 'db-specialist',         content: 'PgBouncer: pool_size=10 → recommend pool_size=25, reserve_pool_size=5' },
  { delayMs: 1100, type: 'token:stream', laneId: 'db-specialist',         content: 'Emergency SQL: CREATE INDEX CONCURRENTLY idx_notif_user_id ON notifications(user_id)' },
  { delayMs: 1000, type: 'token:stream', laneId: 'db-specialist',         content: '⚡ Immediate mitigation: restart PgBouncer → circuit breaker should close in ~60s' },
  { delayMs: 900,  type: 'verdict:issued', laneId: 'db-specialist',       verdict: 'PASS' },
  { delayMs: 300,  type: 'lane:complete', laneId: 'db-specialist',        status: 'pass', costUsd: 0.0024 },
  { delayMs: 200,  type: 'cost:update',  totalUsd: 0.0058 },
  { delayMs: 600,  type: 'lane:start',   laneId: 'human-review-gate' },
  { delayMs: 1000, type: 'token:stream', laneId: 'human-review-gate',     content: 'Fix proposal loaded. Preparing operator review brief...' },
  { delayMs: 800,  type: 'token:stream', laneId: 'human-review-gate',     content: '⏸  Awaiting operator sign-off before applying production changes' },
  { delayMs: 600,  type: 'lane:human-review', laneId: 'human-review-gate', reason: 'Auto-proceeding (--interactive not set in demo mode)' },
  { delayMs: 700,  type: 'verdict:issued', laneId: 'human-review-gate',   verdict: 'PASS' },
  { delayMs: 300,  type: 'lane:complete', laneId: 'human-review-gate',    status: 'pass', costUsd: 0.0011 },
  { delayMs: 200,  type: 'cost:update',  totalUsd: 0.0069 },
  { delayMs: 600,  type: 'lane:start',   laneId: 'post-mortem' },
  { delayMs: 1400, type: 'token:stream', laneId: 'post-mortem',           content: 'Compiling blameless post-mortem from incident timeline...' },
  { delayMs: 1200, type: 'token:stream', laneId: 'post-mortem',           content: 'Impact: ~2,400 failed requests over 13 minutes, est. $1,200 revenue impact' },
  { delayMs: 1100, type: 'token:stream', laneId: 'post-mortem',           content: 'Action items: P1 DB index (NOW), P2 PgBouncer config (today), P3 alert tuning (this week)' },
  { delayMs: 1000, type: 'token:stream', laneId: 'post-mortem',           content: 'Runbook DB-002 updated: Connection Pool Exhaustion → Response Playbook' },
  { delayMs: 700,  type: 'verdict:issued', laneId: 'post-mortem',         verdict: 'PASS' },
  { delayMs: 300,  type: 'lane:complete', laneId: 'post-mortem',          status: 'pass', costUsd: 0.0018 },
  { delayMs: 200,  type: 'cost:update',  totalUsd: 0.0087 },
  { delayMs: 500,  type: 'dag:complete', totalUsd: 0.0087, durationMs: 43000 },
]

// ---------------------------------------------------------------------------
// Scenario registry
// ---------------------------------------------------------------------------
export const SCENARIOS: SimScenario[] = [
  {
    id:          '07',
    number:      '07',
    title:       'PR Auto-Review',
    subtitle:    'Code quality on every pull request — zero setup',
    description: 'A GitHub webhook fires on a new PR. Three parallel agents scan for secrets, architectural regressions, and missing test coverage. A summary agent posts a structured review comment. Watch PII scrubbing redact a leaked token before it reaches any LLM.',
    tags:        ['Webhook Trigger', 'Parallel Lanes', 'PII Scrubbing', 'ESCALATE'],
    accentColor: 'blue',
    lanes: [
      { id: 'security-scan',      label: 'Security Scan',      icon: '🔍', dependsOn: [] },
      { id: 'architecture-review', label: 'Architecture Review', icon: '🏗️', dependsOn: [] },
      { id: 'test-coverage',      label: 'Test Coverage',       icon: '🧪', dependsOn: [] },
      { id: 'review-summary',     label: 'Review Summary',      icon: '📝', dependsOn: ['security-scan', 'architecture-review'] },
    ],
    events: PR_REVIEW_EVENTS,
  },
  {
    id:          '08',
    number:      '08',
    title:       'Zero-to-Deployed',
    subtitle:    'From PM brief to release notes in one command',
    description: 'A feature brief enters. Six agents take it through BA analysis → architecture → parallel BE+FE implementation → tests → release notes. A hard barrier holds the test suite until both implementations commit. Watch real-time cost accumulation across the full SDLC.',
    tags:        ['Full SDLC', 'Hard Barrier', 'Parallel Impl', 'Cost Tracking'],
    accentColor: 'green',
    lanes: [
      { id: 'brief-analysis', label: 'Brief Analysis', icon: '📋', dependsOn: [] },
      { id: 'architecture',   label: 'Architecture',   icon: '🏛️', dependsOn: ['brief-analysis'] },
      { id: 'backend-impl',   label: 'Backend Impl',   icon: '⚙️',  dependsOn: ['architecture'] },
      { id: 'frontend-impl',  label: 'Frontend Impl',  icon: '🎨', dependsOn: ['architecture'] },
      { id: 'test-suite',     label: 'Test Suite',     icon: '🧪', dependsOn: ['backend-impl', 'frontend-impl'] },
      { id: 'release-notes',  label: 'Release Notes',  icon: '🚀', dependsOn: ['test-suite'] },
    ],
    events: ZERO_TO_DEPLOYED_EVENTS,
  },
  {
    id:          '09',
    number:      '09',
    title:       'Live Security Audit',
    subtitle:    'CVE scan + secret detection + OWASP in one pass',
    description: 'Three parallel scanners analyse a repository: CVE checker (retries on NVD rate-limit), secrets scanner (finds 3 exposed credentials — all redacted by PII middleware before reaching the LLM), and OWASP Top-10 checker. A risk-report agent produces CVSS scores and dispatches a Slack alert.',
    tags:        ['Parallel Scan', 'PII Scrubbing', 'RETRY', 'Notification Sink'],
    accentColor: 'red',
    lanes: [
      { id: 'cve-scan',       label: 'CVE Scan',       icon: '🔓', dependsOn: [] },
      { id: 'secrets-scan',   label: 'Secrets Scan',   icon: '🔑', dependsOn: [] },
      { id: 'owasp-checklist', label: 'OWASP Checklist', icon: '⚠️', dependsOn: [] },
      { id: 'risk-report',    label: 'Risk Report',    icon: '📊', dependsOn: ['cve-scan', 'secrets-scan', 'owasp-checklist'] },
      { id: 'notify',         label: 'Alert Dispatch', icon: '📢', dependsOn: ['risk-report'] },
    ],
    events: SECURITY_AUDIT_EVENTS,
  },
  {
    id:          '10',
    number:      '10',
    title:       'Incident Autopilot',
    subtitle:    'P1 alert to post-mortem — fully automated',
    description: 'A PagerDuty P1 fires. Log analyser extracts patterns, root-cause agent runs 5-Whys, fix generator identifies a DB issue and HANDOFFs to a specialist. A human-review gate pauses for operator sign-off (auto-proceeds in demo). Post-mortem closes the loop.',
    tags:        ['HANDOFF', 'Human-Review Gate', 'Sequential Pipeline', 'Specialist Routing'],
    accentColor: 'orange',
    lanes: [
      { id: 'log-analyser',      label: 'Log Analyser',      icon: '📋', dependsOn: [] },
      { id: 'root-cause',        label: 'Root Cause',         icon: '🔍', dependsOn: ['log-analyser'] },
      { id: 'fix-generator',     label: 'Fix Generator',      icon: '🔧', dependsOn: ['root-cause'] },
      { id: 'db-specialist',     label: 'DB Specialist',      icon: '🗄️', dependsOn: [] },
      { id: 'human-review-gate', label: 'Human Review',       icon: '👤', dependsOn: ['fix-generator'] },
      { id: 'post-mortem',       label: 'Post-Mortem',        icon: '📄', dependsOn: ['human-review-gate'] },
    ],
    events: INCIDENT_AUTOPILOT_EVENTS,
  },
]

export function getScenario(id: string): SimScenario | undefined {
  return SCENARIOS.find(s => s.id === id)
}
