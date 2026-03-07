# @ai-agencee/mcp

[![npm](https://img.shields.io/npm/v/@ai-agencee/mcp)](https://www.npmjs.com/package/@ai-agencee/mcp)
[![license](https://img.shields.io/npm/l/@ai-agencee/mcp)](https://github.com/binaryjack/ai-agencee/blob/main/LICENSE)

MCP (Model Context Protocol) server for the **AI Agencee** toolkit. Exposes DAG agent orchestration, project standard enforcement, and live event streaming directly to AI assistants — no API keys required when running through VS Code Copilot.

---

## Installation

```bash
npm install @ai-agencee/mcp
# or
pnpm add @ai-agencee/mcp
```

> **Node ≥ 20** required. ES module. Runtime dependencies: `@ai-agencee/core`, `@ai-agencee/engine`, `@modelcontextprotocol/sdk`.

---

## Quick Start

### VS Code / Copilot (no API keys needed)

Add to your VS Code MCP settings or `.vscode/mcp.json`:

```json
{
  "servers": {
    "ai-kit": {
      "command": "npx",
      "args": ["@ai-agencee/mcp"]
    }
  }
}
```

The server bridges LLM calls back to VS Code Copilot via the MCP sampling protocol — no `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` required.

### Claude Desktop

Edit `~/.config/Claude/claude_desktop_config.json` (`%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "ai-kit": {
      "command": "npx",
      "args": ["@ai-agencee/mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

### Standalone server

```bash
npx @ai-agencee/mcp
# or, after installing globally:
ai-kit-mcp
```

---

## MCP Tools

### `init`

Initialize an AI session with ULTRA_HIGH standards. Loads all project rule files and prints the active configuration.

```
Parameters:
  strict  boolean  Enable STRICT_MODE (default: true)
```

### `check`

Validate current project structure against required files, kebab-case naming rules, and forbidden code patterns.

### `rules`

Return coding standards and conventions from `src/.ai/rules.md`.

```
Parameters:
  format  'markdown' | 'text'  (default: 'markdown')
```

### `patterns`

Return design patterns and architecture guidelines from `src/.ai/patterns.md`.

```
Parameters:
  format  'markdown' | 'text'  (default: 'markdown')
```

### `bootstrap`

Return session bootstrap guide from `src/.ai/bootstrap.md`.

```
Parameters:
  format  'markdown' | 'text' | 'config'  (default: 'markdown')
```

### `agent-dag`

Run a full multi-lane supervised DAG execution. LLM calls are delegated back to the AI assistant via MCP sampling — no API keys needed.

```
Parameters:
  dagFile      string   Path to dag.json (default: 'agents/dag.json')
  projectRoot  string   Absolute path to project root (default: cwd)
  verbose      boolean  Emit per-checkpoint log lines (default: false)
  budgetCapUSD number   Abort when estimated spend exceeds this USD amount
```

### `agent-breakdown`

Use the Business Analyst agent to break down a specification into structured tasks.

```
Parameters:
  specification  string  (required)  Feature description to analyse
```

### `agent-workflow`

Run the full 6-agent pipeline: BA → Architecture → Backend → Frontend → Testing → E2E.

```
Parameters:
  specification  string  (required)  Complete feature specification
  featureName    string  (required)  Feature identifier
```

### `agent-validate`

Use the Supervisor agent to validate implementation output against ULTRA_HIGH standards.

```
Parameters:
  output       string    (required)  Code or output to validate
  checkpoints  string[]  Which standards to check (all, code-quality, architecture, testing)
```

### `agent-status`

Check workflow progress and active run state.

---

## MCP Resources

The server exposes project documentation as MCP resources, readable by any compatible client:

| URI | Contents |
|-----|----------|
| `bootstrap://init` | AI session initialization guide |
| `bootstrap://rules` | Coding rules (`src/.ai/rules.md`) |
| `bootstrap://patterns` | Design patterns (`src/.ai/patterns.md`) |
| `bootstrap://manifest` | Project manifest and capabilities |

---

## Live Event Stream (SSE)

Set the `AIKIT_SSE_PORT` environment variable to also start an HTTP Server-Sent Events server alongside the MCP stdio server:

```bash
AIKIT_SSE_PORT=3747 npx @ai-agencee/mcp
```

Subscribe from any HTTP client:

```js
const evtSource = new EventSource('http://localhost:3747/events');
evtSource.addEventListener('lane:end', (e) => console.log(JSON.parse(e.data)));

// Subscribe to a specific run only:
const evtSource = new EventSource('http://localhost:3747/events?runId=abc123');
```

Emitted event types: `dag:start`, `dag:end`, `lane:start`, `lane:end`, `llm:call`, `budget:exceeded`, `rbac:denied`, `checkpoint:complete`.

---

## OIDC Authentication

For enterprise deployments, set `AIKIT_OIDC_ISSUER` to enable OIDC JWT validation on the SSE endpoint:

```bash
AIKIT_SSE_PORT=3747 \
AIKIT_OIDC_ISSUER=https://login.microsoftonline.com/<tenant>/v2.0 \
npx @ai-agencee/mcp
```

---

## ULTRA_HIGH Standards Enforced

| Rule | Value |
|------|-------|
| File naming | kebab-case only |
| Files | One export per file |
| Types | No `any` allowed |
| Functions | `export const Name = function(...) { ... }` |
| Classes | FORBIDDEN |
| Test coverage | ≥ 95% |
| Performance | ≤ 10% solid-js overhead |

---

## Architecture

- **Transport**: stdio (MCP protocol) + optional HTTP SSE
- **Engine**: delegates DAG execution to [`@ai-agencee/engine`](https://www.npmjs.com/package/@ai-agencee/engine)
- **VS Code bridge**: `createVSCodeSamplingBridge()` routes LLM calls back to Copilot
- **GitHub reporter**: posts DAG run summaries as PR comments
- **OIDC middleware**: JWT validation for the SSE endpoint

---

## Related Packages

| Package | Description |
|---------|-------------|
| [`@ai-agencee/core`](https://www.npmjs.com/package/@ai-agencee/core) | File system utilities and project validation |
| [`@ai-agencee/engine`](https://www.npmjs.com/package/@ai-agencee/engine) | Multi-lane supervised DAG execution engine |
| [`@ai-agencee/cli`](https://www.npmjs.com/package/@ai-agencee/cli) | CLI tool — `ai-kit agent:dag` / `agent:plan` |

---

## License

MIT — see [LICENSE](https://github.com/binaryjack/ai-agencee/blob/main/LICENSE)

### With Claude

```
👤 User: @init

🤖 Assistant: 
# AI SESSION INITIALIZED

## Configuration
U=TADEO
STD=ULTRA_HIGH
...

Ready to start development with strict standards applied!

---

👤 User: @rules

How should I name my variables?

🤖 Assistant:
All variables must use kebab-case naming:
✓ user-input
✓ api-response  
✗ userData
✗ apiResponse
```

### With Other AI Assistants

Any MCP-compatible client can use this server:
- Anthropic Claude
- OpenAI Assistants (with MCP wrapper)
- Cline/cursor
- VS Code Copilot (with MCP integration)

## Troubleshooting

### Server not starting

Ensure you have Node.js 18+ installed:

```bash
node --version  # Should be v18.0.0 or higher
```

### Cannot find project files

The server reads files from the current working directory. Make sure you're running it from your project root:

```bash
cd /path/to/project
npx @ai-agencee/mcp
```

### File not found errors

The server looks for these paths relative to project root:
- `.github/copilot-instructions.md`
- `src/.ai/rules.md`
- `src/.ai/patterns.md`
- `.github/ai/manifest.xml`

Create these files using [@ai-agencee/cli](https://www.npmjs.com/package/@ai-agencee/cli):

```bash
npx @ai-agencee/cli init --strict
```

## License

MIT - See [LICENSE](../../LICENSE) for details

## Related Packages

- [@ai-agencee/cli](https://www.npmjs.com/package/@ai-agencee/cli) - Command-line scaffolding tool
- [@ai-agencee/core](https://www.npmjs.com/package/@ai-agencee/core) - Shared utilities and templates
