# Demo Mode & Getting Started

**Status**: ✅ Implemented | **Priority**: P0 | **Roadmap**: G-21/04  
**Related**: DAG Orchestration, CLI Commands, Agent Types & Roles

## Overview

Demo mode lets you run complete DAG pipelines **without any API keys**. The built-in `MockProvider` simulates realistic LLM responses using word-level streaming simulation, so you can explore the engine's orchestration, event system, cost tracking, and fault-tolerance features before committing to a provider.

---

## Zero-API-Key Demo

```bash
# Clone and install
git clone https://github.com/binaryjack/ai-agencee
cd ai-agencee
pnpm install
pnpm build

# Run the demo (no API key needed)
pnpm demo
```

This runs `agents/demo.dag.json` — a 3-lane pipeline (code-review + security-scan → summary) using the mock provider.

### What you'll see

```
╔══════════════════════════════════════════════════════════╗
║          AI Agencee  ·  Demo Run (mock provider)         ║
╚══════════════════════════════════════════════════════════╝

  DAG file : agents/demo.dag.json
  Provider : mock (no API key required)

🗂️  DAG Supervised Agent Executor
────────────────────────────────────────────────────────────
  DAG file   : agents/demo.dag.json
  Project    : /Users/me/ai-agencee

✅ code-review   → 3 checks passed
✅ security-scan → 2 checks passed
✅ summary       → Generated 245-token summary

Run complete | 3 lanes | $0.0000 (mock) | 1.2s
```

---

## Available Demo DAGs

| DAG file | Description |
|----------|-------------|
| `agents/demo.dag.json` | 3-lane code-review + security scan + summary |
| `agents/demo-code-review.agent.json` | Single-agent code review |
| `agents/demo-security.agent.json` | Single-agent security scan |
| `agents/demo-summary.agent.json` | Summary generator |
| `agents/demos/01-app-boilerplate/` | Boilerplate generation scenario |
| `agents/demos/02-enterprise-skeleton/` | Enterprise project scaffold |
| `agents/demos/03-website-build/` | Website build pipeline |
| `agents/demos/04-feature-in-context/` | Feature addition to existing codebase |
| `agents/demos/05-mvp-sprint/` | MVP sprint planning and execution |
| `agents/demos/06-resilience-showcase/` | Fault-tolerance and retry demonstration |

---

## Running a Specific Demo

```bash
# Run any demo DAG with mock provider
node scripts/demo.js agents/demos/06-resilience-showcase/dag.json

# Run with verbose output
node scripts/demo.js agents/demo.dag.json --verbose

# Run with your own provider
ANTHROPIC_API_KEY=sk-ant-... ai-kit run agents/demo.dag.json
```

---

## Using plan-demo.js

`plan-demo.js` generates a DAG from a natural-language spec using a seed file, then runs it:

```bash
node scripts/plan-demo.js agents/demos/plan-seeds/ecommerce.md
```

This chains:
1. `ai-kit plan` — generates `dag.json` from the spec
2. `ai-kit run` — executes the generated DAG

---

## Scenario Runner

`run-scenarios.js` executes all demo scenarios in sequence and reports pass/fail:

```bash
node scripts/run-scenarios.js
```

Useful for integration testing or showcasing multiple pipelines in a presentation.

---

## Creating Your Own Demo

```bash
# Scaffold config into any project
cd ~/my-project
ai-kit init

# Validate the generated DAG without running it
ai-kit run agents/dag.json --dry-run

# Run with mock provider first
ai-kit run agents/dag.json --provider mock --verbose

# Then run with real provider
ANTHROPIC_API_KEY=sk-ant-... ai-kit run agents/dag.json
```

---

## MockProvider Behaviour

When `--provider mock` is used (or `ANTHROPIC_API_KEY` is absent):

- All LLM calls return realistic-looking placeholder responses
- Streaming simulation fires one word per 50ms
- Token counts are estimated (input: based on prompt length; output: 200 tokens)
- Cost is always `$0.0000`
- Failures are simulated probabilistically to demonstrate retry behaviour

---

## First Steps with a Real Provider

1. Get an Anthropic API key from [console.anthropic.com](https://console.anthropic.com)
2. Set it: `export ANTHROPIC_API_KEY=sk-ant-...`
3. Run: `ai-kit run agents/dag.json --verbose`
4. View the cost report in `.agents/results/`

---

## Related Features

- [CLI Commands](./15-cli-commands.md) — `ai-kit init`, `ai-kit run` flags
- [DAG Orchestration](./01-dag-orchestration.md) — DAG file format
- [Provider Configuration](./23-provider-config.md) — Real provider setup
- [JSON Schema & IDE Support](./26-json-schema.md) — Autocompletion when editing DAG files

---

**Last Updated**: March 7, 2026  
**Roadmap**: G-21/04 — Demo Mode & Getting Started  
**Implementation**: `scripts/demo.js`, `scripts/plan-demo.js`, `agents/demo*.json`
