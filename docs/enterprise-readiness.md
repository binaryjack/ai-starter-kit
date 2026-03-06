# Enterprise Readiness Roadmap

Status as of latest commit. All **E1–E13** items are shipped and actively enforced at runtime.

---

## Completed (E1–E10, E13)

| ID | Feature | File(s) | Status |
|----|---------|---------|--------|
| E1 | PII scrubbing | `agent-executor/src/lib/pii-scrubber.ts` | ✅ Enforced via `createPiiSafeProvider()` wrapper |
| E2 | Security policy + CI audit | `SECURITY.md`, `.github/workflows/security-audit.yml` | ✅ `pnpm audit --audit-level=high` on every push/PR |
| E3 | Multi-tenant isolation | `agent-executor/src/lib/tenant-registry.ts` | ✅ Path-isolated run roots per tenant |
| E4 | GDPR data CLI | `cli/src/commands/data.ts` | ✅ `data:export`, `data:delete`, `data:list-tenants` |
| E5 | OIDC JWT auth | `mcp/src/oidc-auth.ts` → **wired into** `mcp/src/sse-server.ts` | ✅ RS256/ES256 Bearer token enforced on `/events`; `/health` open |
| E6 | Rate limiting | `agent-executor/src/lib/rate-limiter.ts` → **wired into** `agent-executor/src/lib/dag-orchestrator.ts` | ✅ `assertWithinLimits()` + `acquireRun()` before each DAG execution |
| E7 | DAG visualizer | `cli/src/commands/visualize.ts` | ✅ Mermaid + DOT output from DAG JSON |
| E8 | Prompt injection detection | `agent-executor/src/lib/prompt-injection-detector.ts` → **wired via** `ModelRouter.wrapAllProviders()` | ✅ 10 signature families; `warn`/`block` mode; `DagRunOptions.injectionDetection` |
| E10 | AWS Bedrock provider | `agent-executor/src/lib/providers/bedrock.provider.ts` → **SigV4** via Node `crypto` module | ✅ Converse API; auto-registered when AWS credentials are set; model mapping config in `model-router.json` |
| E11 | Jira/Linear sync | `agent-executor/src/lib/issue-sync.ts` | ✅ `IssueSync` subscribes to `DagEventBus`; creates issues on `dag:end` failure/partial via Jira REST or Linear GraphQL |
| E12 | Slack/Teams notifications | `agent-executor/src/lib/notification-sink.ts` | ✅ `NotificationSink` fires on `dag:end`; Slack incoming webhook + Teams incoming webhook; zero external SDK |
| E13 | Run advisor (auto-tune) | `agent-executor/src/lib/run-advisor.ts` → **integrated into** `dag-orchestrator.js` post-execution | ✅ 6 recommendation types: HIGH_RETRY_RATE, SLOW_LANE, FLAKY_LANE, DOWNGRADE_MODEL, BUDGET_SUGGESTION, DAG_UNSTABLE |

**Test coverage**: 424 tests passing across all packages.

---

## Advanced Features (G-series)

| ID | Feature | File(s) | Status |
|----|---------|---------|--------|
| G-13 | Vector memory | `agent-executor/src/lib/vector-memory.ts` | ✅ In-memory semantic search |
| G-16 | Webhook triggers | `agent-executor/src/lib/webhook-trigger.ts` | ✅ GitHub webhook listener for DAG execution |
| G-22 | DAG builder fluent API | `agent-executor/src/lib/dag-builder.ts` | ✅ Type-safe TypeScript DSL |
| G-24/G-25 | SQLite vector memory | `agent-executor/src/lib/sqlite-vector-memory.ts` | ✅ Persistent embeddings via `better-sqlite3` |
| G-37 | Prompt distillation | `agent-executor/src/lib/distillation.ts` | ✅ Few-shot example collection |
| G-38 | Code sandbox | `agent-executor/src/lib/code-sandbox.ts` | ✅ Isolated code execution (Node/Python/Bash) |
| G-50 | LLM-as-judge eval | `agent-executor/src/lib/eval-harness.ts` | ✅ Structured evaluation harness |

---

## E8 Runtime Enforcement Detail

`prompt-injection-detector.ts` + `dag-orchestrator.ts`:
- Enabled via `DagRunOptions.injectionDetection.enabled = true`
- After model router is built, `modelRouter.wrapAllProviders(createInjectionSafeProvider)` wraps every registered provider
- On each LLM call: `PromptInjectionDetector.enforce(prompt, mode)` scans all non-skipped message roles
- **10 detection families**: IGNORE_INSTRUCTIONS, SYSTEM_OVERRIDE, ROLE_JAILBREAK, NEW_DIRECTIVE, PROMPT_LEAK, CONTEXT_FENCE, INDIRECT_INJECTION, TASK_OVERRIDE, DATA_ESCAPE, SUDO_COMMAND
- **Confidence**: 1 family → 0.3 (low), 2 → 0.6 (medium), 3+ → 0.9 (high)
- **`warn` mode** (default): structured JSON warning to stderr, request continues — backwards compatible
- **`block` mode**: throws `PromptInjectionError` before the LLM call, carries full `InjectionScanResult`
- `skipRoles` option lets you exclude trusted system messages from scanning
- `customSignatures` extension point for project-specific injection patterns

---

## E10 Runtime Enforcement Detail

`bedrock.provider.ts` — AWS Bedrock Converse API:
- Authentication via standard AWS credential chain:
  1. Constructor parameters (`apiKey` = accessKeyId, `secretKey`, `sessionToken`)
  2. Environment variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` (optional)
  3. Region from `AWS_REGION` || `AWS_DEFAULT_REGIONAL` (default: `us-east-1`)
- Signing: AWS Signature Version 4 implemented with Node's built-in `crypto` module (zero additional dependencies)
- Model mapping (configurable in `model-router.json`):
  - `haiku`  → `us.anthropic.claude-haiku-4-5-20241022-v1:0` ($0.80/1M input)
  - `sonnet` → `us.anthropic.claude-sonnet-4-5-20241022-v1:0` ($3.00/1M input)
  - `opus`   → `us.anthropic.claude-opus-4-5-20240229-v1:0` ($15.00/1M input)
- Supports Bedrock-hosted models: Claude (Anthropic), Titan (AWS), Llama (Meta), etc.
- Binary event frame parser for streaming responses
- Wired into `ModelRouter` — auto-registered when AWS credentials detected

---

## E13 Runtime Enforcement Detail

`run-advisor.ts` — Auto-tune recommendations:
- Analyzes historical DAG runs stored in `.agents/runs/`
- Data sources:
  - `manifest.json` — run-level metadata from `RunRegistry`
  - `results/dag-<runId>.json` — `LaneResult` / `DagResult` from `DagResultBuilder`
- 6 recommendation categories:
  - **HIGH_RETRY_RATE** — lane exceeds `maxAvgRetries` threshold (default 1.5)
  - **SLOW_LANE** — lane average duration exceeds `slowLaneMs` (default 30,000ms)
  - **FLAKY_LANE** — lane failure/escalation rate exceeds `maxFailureRate` (0.2)
  - **DOWNGRADE_MODEL** — lane passes 100% reliably → consider switching from opus to sonnet
  - **BUDGET_SUGGESTION** — suggest per-run budget cap (only with ≥5 successful runs)
  - **DAG_UNSTABLE** — overall DAG success rate below `minSuccessRate` (0.8)
- Configurable thresholds + `lookback` window (def: 20 most recent runs)
- Usage:
  ```typescript
  const advisor = new RunAdvisor(projectRoot);
  const report  = await advisor.analyse({ lookback: 20 });
  console.log(advisor.formatReport(report));
  ```
- CLI integration: `pnpm ai-kit advise [--json]`

---

## E5 Runtime Enforcement Detail

`sse-server.ts` — `startSseServer()`:
- `createOidcMiddleware()` is instantiated once per server start
- If `AIKIT_OIDC_ISSUER` env var is **unset** → no-op (backwards compatible)
- If **set** → JWKS fetched from `{issuer}/.well-known/jwks.json`, RS256/ES256 Bearer JWT validated before any `/events` SSE connection is established
- `/health` is always open (safe for load balancer probes)

## E6 Runtime Enforcement Detail

`dag-orchestrator.ts` — `DagOrchestrator.execute()`:
1. After RBAC principal resolution: `rbac.getRateLimits(principal)` reads optional `rateLimits` block from `rbac.json`
2. `rateLimiter.assertWithinLimits(principal, limits)` — throws `RateLimitExceededError` synchronously before execution starts
3. `rateLimiter.acquireRun(principal)` — increments concurrent-run counter; returns `releaseRateLimit` fn
4. On completion: `releaseRateLimit()` decrements counter; `rateLimiter.recordTokens()` persists input/output totals from `CostTracker.summary()`

---

## Backlog (E9)

| ID | Feature | Priority | Notes |
|----|---------|------------|-------|
| E9 | Python MCP bridge | P2 | `subprocess` bridge so Python tools register as MCP servers |
---

## SOC2 Path (Process Work — No Code Required)

- [ ] Vanta / Drata onboarding
- [ ] External penetration test
- [ ] Change management policy doc
- [ ] Business Continuity Plan (BCP) doc
- [ ] Annual access review process
