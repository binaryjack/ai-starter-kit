# @ai-agencee/cli

[![npm](https://img.shields.io/npm/v/@ai-agencee/cli)](https://www.npmjs.com/package/@ai-agencee/cli)
[![license](https://img.shields.io/npm/l/@ai-agencee/cli)](https://github.com/binaryjack/ai-agencee/blob/main/LICENSE)

CLI tool for the **AI Agencee** toolkit. Scaffold AI rule files, validate projects, run multi-lane DAG agent workflows, launch the MCP server, plan features interactively, and benchmark LLM providers — all from a single `ai-kit` command.

---

## Installation

```bash
npm install -g @ai-agencee/cli
# or run without installing:
npx @ai-agencee/cli <command>
```

> **Node ≥ 20** required. CommonJS module.

---

## Commands

### `ai-kit init`

Scaffold AI rule files into the current project from the bundled template.

```bash
ai-kit init
ai-kit init --strict   # Enable ULTRA_HIGH strict standards (TADEO rules)
```

Creates the following structure (prompts before overwriting existing files):

```
.github/
├── copilot-instructions.md
└── ai/
    ├── manifest.xml
    ├── pipeline.xml
    ├── architecture-rules.xml
    └── quality-gates.xml
src/.ai/
├── bootstrap.md
├── rules.md
└── patterns.md
```

---

### `ai-kit sync`

Sync AI rule files with the latest template version. Overwrites files that have diverged from the template; leaves customised files that are already up to date.

```bash
ai-kit sync
```

Output:
```
ok:       .github/copilot-instructions.md
synced:   .github/ai/quality-gates.xml
diverged: src/.ai/rules.md
```

| Status | Meaning |
|--------|---------|
| `ok` | Matches template — no change |
| `synced` | Was missing — created |
| `diverged` | Differed from template — updated |

---

### `ai-kit check`

Validate project structure against ULTRA_HIGH rules. Exits with code `1` if any rule fails.

```bash
ai-kit check
```

Checks performed:
- Every file in `REQUIRED_FILES` exists
- All source file names are `kebab-case`
- No forbidden patterns (`class `, ` any `, `useImperativeHandle`) in `.ts`/`.js` files

```
pass: required-file:.github/copilot-instructions.md
pass: naming:kebab-case
fail: forbidden-pattern: class  — found in src/components/MyComponent.tsx
```

---

### `ai-kit agent:dag [dag-file]`

Run a multi-lane supervised DAG execution. Defaults to `agents/dag.json` in the current directory.

```bash
ai-kit agent:dag
ai-kit agent:dag agents/my-workflow.json
ai-kit agent:dag --dry-run                     # Validate config, print execution plan
ai-kit agent:dag --verbose                     # Per-checkpoint output
ai-kit agent:dag --interactive                 # Pause at human-review checkpoints
ai-kit agent:dag --budget 0.50                 # Abort if spend exceeds $0.50
ai-kit agent:dag --provider openai             # Force a specific LLM provider
ai-kit agent:dag -p /path/to/project           # Specify project root
```

#### Options

| Flag | Description |
|------|-------------|
| `[dag-file]` | Path to `dag.json` (default: `agents/dag.json`) |
| `-p, --project <path>` | Project root directory (default: cwd) |
| `-v, --verbose` | Detailed per-checkpoint output |
| `--dry-run` | Validate DAG and print execution plan — no LLM calls |
| `-i, --interactive` | Pause at `needs-human-review` checkpoints |
| `--budget <usd>` | USD spend cap — aborts when exceeded |
| `--provider <name>` | Force provider: `anthropic \| openai \| vscode \| mock` |

#### Provider setup

| Provider | Requirement |
|----------|-------------|
| `anthropic` | `ANTHROPIC_API_KEY` env var |
| `openai` | `OPENAI_API_KEY` env var |
| `vscode` | Running inside VS Code with Copilot (no key needed) |
| `mock` | No LLM calls — useful for CI and testing |

---

### `ai-kit agent:plan`

Run the interactive 5-phase planning system. Guides a BA agent through discovery, synthesis, decomposition, dependency wiring, and execution.

```bash
ai-kit agent:plan
ai-kit agent:plan --start-from decompose       # Resume from a specific phase
ai-kit agent:plan --provider vscode            # Use VS Code Copilot — no API key
ai-kit agent:plan --skip-approval              # Non-interactive / CI mode
ai-kit agent:plan --verbose
ai-kit agent:plan --model-router-config agents/model-router.json
```

#### Phases

| Phase | What happens |
|-------|-------------|
| `discover` | BA ↔ User structured interview |
| `synthesize` | BA produces plan skeleton; user approves |
| `decompose` | Each specialist agent fills in tasks (parallel) |
| `wire` | Dependency graph and alignment gates resolved |
| `execute` | PlanOrchestrator runs the wired plan via DAG engine |

#### Options

| Flag | Description |
|------|-------------|
| `-p, --project <path>` | Project root (default: cwd) |
| `-a, --agents-dir <path>` | Directory containing agent/supervisor JSON (default: `<project>/agents`) |
| `--start-from <phase>` | Resume: `discover \| synthesize \| decompose \| wire \| execute` |
| `--skip-approval` | Skip user approval gates |
| `-v, --verbose` | Verbose DAG output during execution phase |
| `--provider <name>` | LLM provider: `anthropic \| openai \| vscode` (auto-detects from env) |
| `--model-router-config <path>` | Path to custom `model-router.json` |

---

### `ai-kit agent:benchmark`

Benchmark registered LLM providers — measures latency, throughput, and cost per request.

```bash
ai-kit agent:benchmark
ai-kit agent:benchmark --providers anthropic,openai
ai-kit agent:benchmark --suite code-review --runs 3
ai-kit agent:benchmark --output results.json
```

#### Options

| Flag | Description |
|------|-------------|
| `--providers <names>` | Comma-separated providers to test (default: all registered) |
| `--suite <name>` | Prompt suite: `minimal \| code-review` (default: `minimal`) |
| `--runs <n>` | Repetitions per prompt (default: `1`) |
| `--router-file <path>` | Path to `model-router.json` (default: `agents/model-router.json`) |
| `-p, --project <path>` | Project root |
| `--output <file>` | Write JSON report to this file |

---

### `ai-kit visualize`

Generate a visual summary of the DAG definition — lanes, dependencies, barriers, and supervisor assignments.

```bash
ai-kit visualize
ai-kit visualize agents/my-workflow.json
ai-kit visualize --format mermaid    # Output as Mermaid diagram
ai-kit visualize --output graph.md
```

---

### `ai-kit mcp`

Start the MCP server (delegates to [`@ai-agencee/mcp`](https://www.npmjs.com/package/@ai-agencee/mcp)) and print VS Code / Claude Desktop configuration snippets.

```bash
ai-kit mcp
```

---

### `ai-kit data`

Manage persistent run data and tenant registry.

```bash
ai-kit data tenants                 # List all registered tenants
ai-kit data export --tenant <id>    # Export run data for a tenant
ai-kit data delete --tenant <id>    # Delete all run data for a tenant
```

---

## Example: full workflow from scratch

```bash
# 1. Scaffold AI rules into your project
cd my-project
ai-kit init --strict

# 2. Validate everything is in order
ai-kit check

# 3. Dry-run to inspect the DAG before spending tokens
ai-kit agent:dag --dry-run

# 4. Run with VS Code Copilot — no API keys
ai-kit agent:dag --provider vscode --verbose

# 5. Interactive planning session
ai-kit agent:plan --provider vscode
```

---

## Related Packages

| Package | Description |
|---------|-------------|
| [`@ai-agencee/core`](https://www.npmjs.com/package/@ai-agencee/core) | File system utilities and project validation |
| [`@ai-agencee/engine`](https://www.npmjs.com/package/@ai-agencee/engine) | Multi-lane supervised DAG execution engine |
| [`@ai-agencee/mcp`](https://www.npmjs.com/package/@ai-agencee/mcp) | MCP server for AI assistant integration |

---

## License

MIT — see [LICENSE](https://github.com/binaryjack/ai-agencee/blob/main/LICENSE)
