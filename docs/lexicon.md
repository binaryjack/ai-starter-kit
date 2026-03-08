# AI Agencee — Lexicon & Reference Glossary

Alphabetical reference of every acronym, AI term, concept, pattern, and project-specific name used across the codebase and documentation.

---

## A

**ADR** (Architecture Decision Record)  
A short document that captures a significant architectural choice: the context, the decision made, and the consequences. The Architecture Agent is responsible for producing ADRs during the design phase.

**Agent**  
A JSON-configured specialist that executes a list of checks against a target project. Each agent has a name, a task type, and an ordered set of `CheckDefinition` objects. The six built-in agents are: Business Analyst, Architecture, Backend, Frontend, Testing, and E2E. Custom agents can be added by creating a `*.agent.json` file.

**Agent File**  
The `*.agent.json` JSON file that describes what an agent checks, which LLM tier it uses for reasoning tasks, and how it reports results. Validated by `schemas/agent.schema.json`.

**ai-agencee**  
The product name and npm scope (`@ai-agencee/*`). The full system: DAG engine, CLI, MCP bridge, plugin system, and showcase web app.

**ai-kit**  
The CLI binary installed by `@ai-agencee/cli`. Entry point for all terminal operations: `ai-kit plan`, `ai-kit agent:dag`, `ai-kit mcp`, etc.

**Alignment Barrier** → see *Barrier*, *Soft-Align*

**Anthropic**  
AI safety company and LLM provider. Manufactures the Claude model family (Haiku, Sonnet, Opus). Primary default provider in `model-router.json`. API key injected via `ANTHROPIC_API_KEY`.

**API** (Application Programming Interface)  
Contract between software components. In this project commonly refers to the TypeScript Builder API for programmatic DAG construction, or the LLM provider HTTP APIs.

**APPROVE**  
One of three possible supervisor verdicts. Indicates that a DAG phase passed all quality gates and execution should continue to the next phase. See also: *RETRY*, *ESCALATE*.

**AST** (Abstract Syntax Tree)  
Internal tree representation of source code used during static analysis. Referenced in the AI pipeline step `AST_CHECK(core/*)`.

**Audit Event**  
An immutable, hash-chained record emitted for every significant system action (DAG start, check result, supervisor verdict, cost spend, approval). Stored as NDJSON in `.agents/tenants/<tenantId>/runs/<runId>/events.ndjson`.

**Audit Trail**  
The append-only sequence of `AuditEvent` records for a run. Tamper-evident via hash chaining. Critical for SOC 2, HIPAA, and GDPR compliance.

**AWS** (Amazon Web Services)  
Cloud platform. AWS Bedrock is one of the six supported LLM providers in this project. AWS credentials are supplied via environment variables (`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`).

**AWS Bedrock**  
Managed API from AWS for running foundation models (Claude, Titan, Llama, etc.) inside an AWS account without sending data to third-party endpoints. Configured under the `bedrock` key in `model-router.json`.

---

## B

**BA** (Business Analyst)  
The first specialist agent (`01-business-analyst.agent.json`). Orchestrates the overall workflow by decomposing product specifications into features, assigning agents, and sequencing work. Uses the Sonnet model tier.

**Backoff Jitter**  
Randomness added to retry delays to prevent *thundering herd* — multiple clients retrying at exactly the same interval and hammering the same endpoint simultaneously.

**Backpressure**  
A flow-control mechanism that prevents a fast event producer from overwhelming a slow consumer. The Event Bus uses non-blocking writes to handle backpressure.

**Barrier**  
A hard synchronisation point inside a DAG that all lanes must reach before execution advances to the next phase. Two variants: *Hard Barrier* (blocks until all lanes complete) and *Soft-Align* (waits for a quorum).

**Bedrock** → see *AWS Bedrock*

**Budget Enforcement**  
The engine cap on total USD spend for a DAG run. Configured via `budgetUSD` in the DAG file. When a run would exceed the budget, the orchestrator halts execution and emits a `cost:budget-exceeded` event.

**Builder API**  
The TypeScript fluent API (`DagBuilder`, `LaneBuilder`) for constructing DAG definitions programmatically without writing raw JSON. Generates valid schema-compliant objects.

---

## C

**Check**  
The atomic unit of work inside a DAG lane. A check has a `type` (e.g., `file-exists`, `llm-review`, `run-command`), an optional `path`, and pass/fail messages. Executed by a *Check Handler*.

**Check Handler**  
The TypeScript class registered for a specific check `type`. Receives a `CheckContext` and returns a `RawCheckResult`. Custom handlers are added via the *Plugin System*.

**CheckHandlerRegistry**  
The runtime registry that maps check type strings to their handler implementations. Auto-discovers plugins from `node_modules` packages whose name matches `ai-kit-plugin-*`.

**Circuit Breaker**  
A resilience pattern with three states — **Closed** (normal), **Open** (failing; requests short-circuit), and **Half-Open** (probing for recovery). Prevents cascading failures when a provider is consistently unavailable.

**CLI** (Command-Line Interface)  
The `ai-kit` binary. See *ai-kit*.

**Claude**  
The family of LLMs produced by Anthropic. Three tiers used in this project: Haiku (fast/cheap), Sonnet (balanced), Opus (powerful). Model names follow the pattern `claude-<tier>-<version>`.

**CompositeSecretsProvider**  
A secrets provider that chains multiple providers with priority order. Checks each in sequence and returns the first non-null value. Allows layering `.env` files over `process.env` over a Vault backend.

**Cosine Similarity**  
A mathematical metric for measuring how similar two vectors are, regardless of their magnitude. Used by `VectorMemory` to rank search results. Score range: 0 (orthogonal) to 1 (identical direction).

**Cost Attribution**  
Tracking which user, team, or tenant incurred which LLM spend. Stored in `AuditEvent` records and surfaced in the Cost Analytics dashboard.

---

## D

**DAG** (Directed Acyclic Graph)  
A graph where edges have direction and no cycles exist. In this project, a DAG defines the topology of a multi-agent workflow: which lanes run in parallel, what checks each lane contains, where barriers sit, and how supervisors gate phase transitions. Defined in `*.dag.json` and validated by `schemas/dag.schema.json`.

**DagOrchestrator**  
The central runtime class that parses a DAG file, resolves agents, instantiates providers, and drives parallel lane execution. Entry point for all programmatic DAG use.

**Demo Mode**  
A zero-API-key execution mode that replaces real LLM calls with deterministic mock responses. Enables evaluation, CI testing, and learning without spending money. Activated with `--provider mock` or `AIKIT_PROVIDER=mock`.

**DotenvSecretsProvider**  
A built-in `SecretsProvider` that parses `.env` and `.env.local` files without requiring external dependencies. Later files in the configured list take precedence.

---

## E

**E1–E13**  
The thirteen enterprise-grade features shipped in the engine. Covers: multi-tenant isolation, RBAC/OIDC, audit logging, rate limiting, PII scrubbing, cost controls, DAG visualiser, plugin system, GDPR tooling, and more. Status tracked in `docs/enterprise-readiness.md`.

**Embedding**  
A fixed-length numeric vector (`Float32Array`) that represents the semantic meaning of a piece of text. Generated by an LLM embedding model. Used by `VectorMemory` for similarity search.

**EnvSecretsProvider**  
The default `SecretsProvider`. Reads secrets directly from `process.env`. Zero-configuration.

**ESCALATE**  
A supervisor verdict indicating that a phase failed beyond the configured retry budget and requires human intervention. The DAG halts and emits a structured alert. See also: *APPROVE*, *RETRY*.

**Event Bus**  
The in-process typed event emitter (`DagEventBus`) that broadcasts structured events during DAG execution. External systems subscribe to event types and receive data without polling. Bridgeable to WebSocket or SSE for browser clients.

**Exponential Backoff**  
A retry strategy where each subsequent delay is multiplied by a fixed factor (e.g., 1s → 2s → 4s → 8s). Prevents overloading a recovering service. Combined with *Backoff Jitter* to desynchronise clients.

---

## F

**failSeverity**  
The importance level of a failed check: `'info'` | `'warning'` | `'error'`. Error-severity failures can block supervisor approval.

**Feature-Sliced Design (FSD)**  
A frontend architecture methodology that organises code by business feature rather than technical layer. Enforced by the Supervisor Agent: strict cross-slice isolation, all public API exported from `index.ts`, no direct imports across feature boundaries.

**Float32Array**  
A JavaScript typed array of 32-bit IEEE 754 floating-point numbers. The raw format for all embedding vectors in `VectorMemory`. Chosen for memory efficiency and fast arithmetic.

---

## G

**GDPR** (General Data Protection Regulation)  
EU data protection law. The engine ships two GDPR CLI operations: Art. 17 (`deleteTenant()` — right to erasure) and Art. 20 (`exportTenant()` — right to data portability).

**Gemini**  
Google's LLM family. Supported as an out-of-the-box provider. Configured under the `gemini` key in `model-router.json`, authenticated via `GEMINI_API_KEY`.

**GitHubWebhookTrigger**  
A built-in HTTP server class that listens for GitHub webhook events (`push`, `pull_request`, `workflow_dispatch`) and fires configured DAG runs in response. Verifies signatures with HMAC-SHA256.

**GDPR CLI** → see *GDPR*

---

## H

**Hallucination**  
When an LLM produces confident-sounding output that is factually incorrect, fabricated, or inconsistent with the provided context. The Supervisor Agent is specifically tasked with rejecting work that exhibits hallucinations or stub implementations.

**HANDOFF**  
A verdict or transition indicating that one agent has completed its scope and is explicitly passing context to the next agent in the sequence. Structured so the receiving agent knows exactly what was produced.

**Hard Barrier** → see *Barrier*

**Haiku**  
The fast, low-cost tier of the Claude model family. Suited for validation, file-existence checks, and other high-volume, low-reasoning tasks. Approximate cost: ~$0.80 per million input tokens.

**HIPAA** (Health Insurance Portability and Accountability Act)  
US healthcare data regulation. The audit logging system can generate HIPAA-aligned compliance documentation.

**HMAC** (Hash-based Message Authentication Code)  
A cryptographic signature scheme using a shared secret. Used by `GitHubWebhookTrigger` to verify that incoming webhook payloads genuinely originate from GitHub (HMAC-SHA256).

---

## I

**IDE** (Integrated Development Environment)  
A code editor with tooling integration (VS Code, Cursor, IntelliJ). The JSON Schema files (`schemas/dag.schema.json`, `schemas/agent.schema.json`) enable IDE autocompletion and inline validation without extensions.

**ICheckHandler**  
The TypeScript interface every check handler must implement. Defines the `type` discriminant and the `execute(ctx: CheckContext): Promise<RawCheckResult>` method.

---

## J

**JSDoc**  
Inline documentation syntax for JavaScript/TypeScript. The Supervisor Agent rejects public functions that lack JSDoc comments.

**JSON Schema**  
A vocabulary for describing the structure of JSON documents. The project ships `schemas/dag.schema.json` and `schemas/agent.schema.json`. Adding a `"$schema"` field to a DAG or agent file enables IDE autocompletion and real-time validation.

**JWT** (JSON Web Token)  
A compact, URL-safe token format for representing claims between parties. Used in the OIDC authentication flow. The PII scrubber has a built-in pattern that redacts JWTs found in prompts.

---

## L

**Lane**  
A parallel execution context inside a DAG. Each lane is assigned an agent file, runs its checks in order, and reports to the barrier. Multiple lanes run simultaneously, which is what makes the engine faster than sequential execution.

**LLM** (Large Language Model)  
A neural network trained on massive text corpora capable of generating, reviewing, and reasoning about text. In this project, LLMs are invoked via check types `llm-generate`, `llm-review`, and `llm-tool`. The engine abstracts behind an `LLMProvider` interface, supporting Anthropic, OpenAI, Ollama, Gemini, and Bedrock.

**LLMProvider**  
The TypeScript interface abstracting all LLM backends. Methods: `complete()`, `stream()`, `embed()`. The Mock Provider implements this interface with deterministic, zero-cost responses.

---

## M

**MCP** (Model Context Protocol)  
An open protocol that allows AI assistants (Claude Desktop, VS Code Copilot, Cursor) to discover and invoke external tools or data sources. `@ai-agencee/mcp` exposes the engine's DAG runner, check validator, and standards library as MCP tools.

**Mock Provider**  
An `LLMProvider` implementation that returns deterministic, pre-scripted responses without making any HTTP calls. Used for demo mode, CI testing, and cost-free exploration. Activated with `--provider mock`.

**Model Router**  
The subsystem that maps a check's `taskType` to the optimal LLM tier and provider. Configuration lives in `agents/model-router.json`. Supports per-lane provider overrides and budget-aware fallback.

**model-router.json**  
The single configuration file for all provider and tier settings. Defines `defaultProvider`, `tiers` (haiku/sonnet/opus mappings), per-provider credentials, and PII scrubbing flags.

**Multi-Tenant Isolation**  
Physical separation of run artefacts by tenant identifier. All data written under `.agents/tenants/<tenantId>/`. One tenant cannot read or overwrite another's data. Driven by `TenantRunRegistry`.

---

## N

**NDJSON** (Newline-Delimited JSON)  
A format where each line is a self-contained, valid JSON object. Used for the append-only event log (`events.ndjson`). Every new event is appended as a new line — enabling streaming reads and tamper detection.

**needs-human-review**  
A named checkpoint condition that pauses DAG execution and surfaces a structured alert to a human operator. Used for operations that should not proceed autonomously (e.g., destructive database migrations, production deployments).

**Namespace**  
An isolation scope for `VectorMemory`. Each namespace maintains its own independent vector store. Common scoping strategies: per-lane, per-agent, or per-run.

---

## O

**OIDC** (OpenID Connect)  
An identity layer built on OAuth 2.0 that provides standardised identity tokens (JWTs). Used as the primary `authProvider` for the `Principal` model in the RBAC system.

**Ollama**  
An open-source runtime for running LLMs locally (Llama, Mistral, Gemma, etc.). Configured under the `ollama` key in `model-router.json` with a `baseUrl` pointing to the local server (default: `http://localhost:11434`). Zero external cost.

**OpenAI**  
AI company and LLM provider (GPT-4o, GPT-4 Turbo, etc.). Supported as an out-of-the-box provider. Configured under the `openai` key in `model-router.json`, authenticated via `OPENAI_API_KEY`.

**OpenTelemetry (OTel)**  
An open-source observability framework for generating, collecting, and exporting traces, metrics, and logs. The engine emits a structured trace hierarchy (`dag.run → dag.lane → llm.call → tool.call`) when OTel packages are present. Silently no-ops when absent.

**Opus**  
The powerful, high-cost tier of the Claude model family. Suited for architecture decisions, complex multi-step reasoning, and security reviews. Approximate cost: ~$15.00 per million input tokens.

**OTLP** (OpenTelemetry Protocol)  
The standard wire protocol for sending telemetry data to an OTel collector. Configured via `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable.

---

## P

**PII** (Personally Identifiable Information)  
Any data that can directly or indirectly identify an individual (names, email addresses, SSNs, etc.). Broadly extended in this project to include credentials: API keys, JWTs, tokens, SSH keys, and credit card numbers.

**PiiScrubber**  
The middleware class that scans text for sensitive patterns before it leaves the process. Ships nine built-in regex patterns. Applied transparently via `createPiiSafeProvider()`. Returns `{ text, scrubCount, patternsMatched }`.

**Plan System**  
The `ai-kit plan` workflow path. A 5-phase discovery process that turns a vague requirement (a sentence) into a structured sprint plan: Phase 1 BA discovery → Phase 2 architecture decisions → Phase 3 decomposition → Phase 4 wiring → Phase 5 DAG hand-off.

**Plugin**  
A standard Node.js package that exports a `register` function and a `manifest` object, adding one or more custom check types to the engine. Discovered automatically from `node_modules/ai-kit-plugin-*` packages.

**Principal**  
The identity record for a user, service account, or team in the RBAC system. Carries `id`, `type`, `authProvider`, `role`, and optional `tenantId` and `laneRestrictions`.

**Prototype Pattern**  
The mandatory OOP convention in this project: constructors are written as `export const Name = function(...) { ... }`, methods are attached to `Name.prototype`, and non-public properties use `Object.defineProperty` with `enumerable: false`. Class syntax is forbidden.

---

## R

**Rate Limiting**  
A control that caps the number of LLM API calls per unit of time to avoid exceeding provider quotas or running up unexpected bills. Part of the E1–E13 enterprise feature set.

**RBAC** (Role-Based Access Control)  
An authorisation model where permissions are attached to roles, and roles are assigned to principals. The engine supports lane-level restrictions: `canRead`, `canExecute`, `canApprove`.

**Retry Budget**  
The maximum number of times a supervisor may return a RETRY verdict for a given phase before escalating. Configured per-DAG. Prevents infinite retry loops.

**RETRY**  
A supervisor verdict indicating that a phase did not meet quality gates but is worth attempting again. The orchestrator re-runs the failing lanes up to the retry budget. See also: *APPROVE*, *ESCALATE*.

**runId**  
A unique identifier (typically a UUID) assigned to each DAG execution. Scopes all events, costs, artefacts, and audit records for that run.

---

## S

**SecretsProvider**  
The abstraction interface for injecting API keys and credentials. Three built-in implementations: `EnvSecretsProvider`, `DotenvSecretsProvider`, and `CustomSecretsProvider`. Composable via `CompositeSecretsProvider`.

**Self-Healing Workflow**  
A DAG execution posture where transient failures (network blips, rate limits, provider outages) are automatically handled by retry policies and circuit breakers — without human intervention — unless the retry budget is exhausted.

**SOC 2** (Service Organization Control 2)  
An auditing standard assessing security, availability, processing integrity, confidentiality, and privacy controls. The audit logging and RBAC features are designed to accelerate SOC 2 Type II preparation.

**Soft-Align**  
A barrier variant that synchronises lanes without requiring all of them to complete. A quorum (configured threshold) of lanes reaching the barrier is sufficient to advance. Used when some lanes are optional.

**SQLite**  
An embedded, serverless relational database stored in a single file. Used by `SqliteVectorMemory` for durable, persistent vector storage without requiring a vector database server.

**SqliteVectorMemory**  
The production-grade variant of `VectorMemory` that persists entries to an SQLite file. Includes full-text fallback search for zero-vector queries.

**SSE** (Server-Sent Events)  
An HTTP/1.1 protocol where a server pushes a stream of events to a client over a persistent connection. Planned endpoint: `GET /api/runs/:runId/events`. Simpler than WebSocket for one-directional server-to-client streaming.

**Supervisor**  
A special agent role that acts as a quality gate at DAG phase boundaries. Evaluates lane outputs against configured acceptance criteria and returns one of three verdicts: APPROVE, RETRY, or ESCALATE. Configured in `*.supervisor.json` files.

**Supervisor Checkpoint**  
A point in the DAG where lane execution pauses and the Supervisor Agent evaluates accumulated results. No phase advances without a supervisor verdict.

---

## T

**OWNER**  
The project owner/user identity. Referenced in the `copilot-instructions.md` manifest as `U=OWNER`. The Supervisor Agent acts as "OWNER's Virtual Representative", applying ULTRA_HIGH standards with BRUTAL communication: no verbosity, no stubs, no `any` types, no hallucinations.

**Task Type**  
The semantic classification of a check's intent. Used by the Model Router to select the appropriate LLM tier. Values: `validation`, `code-analysis`, `code-generation`, `code-review`, `security-review`, `architecture-decision`, `complex-reasoning`.

**TenantRunRegistry**  
The storage class that scopes all run artefacts under `.agents/tenants/<tenantId>/runs/`. Reads tenant ID from `AIKIT_TENANT_ID` env var or defaults to `"default"`. Implements GDPR erasure and portability.

**Token**  
The unit of text that LLMs process. Roughly 3–4 characters in English. LLM costs are priced per million input and output tokens. The engine tracks token consumption per check, per lane, and per run for cost analytics.

**Token Delta**  
A single streamed token emitted during a streaming LLM response. Broadcast as a `token:delta` event on the Event Bus.

**Transient Failure**  
A temporary error that is likely to resolve on its own (e.g., a 429 rate-limit response, a 503 during a brief provider outage). Distinguished from permanent failures (e.g., 401 invalid credentials). Retry policies only act on transient failures.

---

## U

**ULTRA_HIGH**  
The quality standard level configured in `copilot-instructions.md` (`STD=ULTRA_HIGH`). Enforced by the Supervisor Agent: 95%+ test coverage, zero `any`, zero stubs, complete error handling, zero hallucinations, full JSDoc on public APIs.

---

## V

**Verdict**  
The output of a supervisor evaluation. One of: `APPROVE`, `RETRY`, `ESCALATE`, `HANDOFF`, or `needs-human-review`. Determines whether the DAG advances, retries, halts, or pauses for human input.

**Vector**  
A mathematical array of numbers representing a point in high-dimensional space. Text embeddings are vectors where semantic similarity corresponds to geometric proximity.

**VectorMemory**  
The in-process semantic memory store backed by `Float32Array` arithmetic. Stores `(id, embedding, metadata, text)` tuples and answers `topK` nearest-neighbour queries by cosine similarity. No vector database required.

**VS Code Sampling**  
An LLM provider that routes completions through the VS Code Language Model API (the same model that powers GitHub Copilot). Useful for running the engine inside VS Code tasks or extensions without additional API keys.

---

## W

**WebSocket (WS)**  
A full-duplex TCP-based protocol over a single HTTP connection. Planned endpoint: `WS /runs/:runId/events`. Bidirectional — allows humans to send review approvals back to a running DAG from a browser.

---

## Z

**Zero-API-Key Demo Mode** → see *Demo Mode*

---

*Last updated: March 2026. To amend or extend this lexicon, edit `docs/lexicon.md` and open a PR.*
