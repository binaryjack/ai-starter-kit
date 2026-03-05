# Tool-Use Integration & Agent Tooling

**Status**: ⏳ In Progress | **Priority**: P0 | **Roadmap**: G-02  
**Related**: DAG Orchestration, Check Handlers, Agent Types

## Overview

Tool-use enables agents to **call functions and interact with the environment within an LLM turn**, rather than returning instructions to be executed by an external orchestrator. This creates **agentic loops** where the LLM uses tools, receives results, and adapts.

### Key Capabilities

- **Real-time function calls** — Agents call tools during generation
- **Built-in tool library** — File I/O, shell execution, searches, APIs
- **Tool result looping** — LLM responds to tool results, calls more tools
- **Gated execution** — Supervisor approval for destructive operations
- **Tool result formatting** — Structured, parseable results back to LLM
- **Custom tools** — Register domain-specific tools

---

## Core Concepts

### Non-Tool-Use (Current)

```
Agent → Generate response → Returns "Here's what you should do:"
                (manual implementation required)
```

### Tool-Use (Goal)

```
Agent → Decide to call tool
        ↓
Calls read_file("src/api.ts")
        ↓
Receives file content
        ↓
Calls grep_project("interface User")
        ↓
Receives grep results
        ↓
Calls write_file("FINDINGS.md", ...)
        ↓
Supervisor approves write
        ↓
Proceeds to next tool or returns response
```

---

## Quick Start

### 1. Enable Tool-Use in Check

```json
{
  "id": "smart-analysis",
  "type": "llm-review",
  "taskType": "code-analysis",
  "prompt": "Analyze the API layer for design issues. Use tools to examine files.",
  "toolsEnabled": true,
  "tools": [
    "read_file",
    "list_dir",
    "grep_project",
    "run_shell"
  ],
  "model": "opus",
  "outputKey": "analysis"
}
```

### 2. LLM Calls Tool

When enabled, the LLM receives available tools in the prompt:

```
You have access to these tools:
1. read_file(path) - Read file content up to 8 KB
2. list_dir(path) - List directory contents
3. grep_project(pattern) - Search codebase
4. run_shell(command) - Run shell command (30s timeout)

Use these tools to investigate the codebase and provide your findings.
```

### 3. Tool Results Flow Back

```typescript
// LLM response includes tool calls
{
  "role": "assistant",
  "toolCalls": [
    {
      "name": "read_file",
      "parameters": { "path": "src/api/server.ts" },
      "id": "call_1"
    }
  ]
}

// Orchestrator executes tool
→ Result: "export class Server { ... }"

// Tool result sent back to LLM
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "call_1",
      "content": "export class Server { ... }"
    }
  ]
}

// LLM can now call more tools or provide final response
```

---

## Available Tools

### File Operations

#### `read_file`
Read any project file up to 8 KB chunks.

```typescript
export interface ReadFileParams {
  path: string;           // Relative path from project root
  maxSize?: number;       // Default 8192 bytes
  encoding?: 'utf-8' | 'base64';
}

export interface ReadFileResult {
  content: string;
  size: number;
  truncated: boolean;
  hash?: string;  // For binary verification
}
```

**Example**:
```json
{
  "name": "read_file",
  "parameters": { "path": "src/api/server.ts" }
}

// Result
{
  "content": "export class Server { ... }",
  "size": 3421,
  "truncated": false
}
```

#### `list_dir`
List directory contents with file metadata.

```typescript
export interface ListDirParams {
  path: string;
  maxDepth?: number;    // Default 1
  includeHidden?: boolean;
}

export interface DirectoryEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  isSymlink?: boolean;
}
```

**Example**:
```json
{
  "name": "list_dir",
  "parameters": { "path": "src", "maxDepth": 1 }
}

// Result
[
  { "name": "api", "type": "directory" },
  { "name": "components", "type": "directory" },
  { "name": "utils.ts", "type": "file", "size": 2048 }
]
```

#### `write_file`
Write or append to files (requires supervisor approval).

```typescript
export interface WriteFileParams {
  path: string;
  content: string;
  mode: 'write' | 'append';
  createIfMissing?: boolean;
}
```

**Important**: Writes are **gated by supervisor** — requires `APPROVE` verdict.

```json
{
  "name": "write_file",
  "parameters": {
    "path": "FINDINGS.md",
    "content": "# Analysis Results\n...",
    "mode": "write"
  }
}

// Supervisor sees this and decides:
// - APPROVE: File is written
// - REJECT: Tool call rejected, agent gets error
// - MODIFY: Return modified content to agent
```

### Search & Analysis

#### `grep_project`
Search codebase for patterns (case-insensitive).

```typescript
export interface GrepParams {
  pattern: string;        // Regex or plain string
  exclude?: string[];    // Glob patterns to skip
  maxResults?: number;   // Default 50
}

export interface GrepResult {
  matches: Array<{
    file: string;
    line: number;
    content: string;
  }>;
  truncated: boolean;
  matchCount: number;
}
```

**Example**:
```json
{
  "name": "grep_project",
  "parameters": {
    "pattern": "interface User",
    "exclude": ["node_modules/**", "*.test.ts"]
  }
}

// Result
{
  "matches": [
    {
      "file": "src/types/user.ts",
      "line": 5,
      "content": "export interface User {"
    },
    {
      "file": "src/api/server.ts",
      "line": 42,
      "content": "  user: User;"
    }
  ],
  "truncated": false,
  "matchCount": 2
}
```

#### `count_lines`
Count lines in files matching pattern.

```json
{
  "name": "count_lines",
  "parameters": {
    "pattern": "src/**/*.ts",
    "excludeDocs": true
  }
}

// Result
{
  "pattern": "src/**/*.ts",
  "fileCount": 47,
  "totalLines": 12847,
  "blankLines": 2341
}
```

### Execution

#### `run_shell`
Execute shell command with timeout (30s default).

```typescript
export interface RunShellParams {
  command: string;
  workingDirectory?: string;
  timeout?: number;       // milliseconds, default 30000
  env?: Record<string, string>;
}

export interface RunShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}
```

**Example**:
```json
{
  "name": "run_shell",
  "parameters": {
    "command": "npm test -- src/api.test.ts",
    "timeout": 60000
  }
}

// Result
{
  "exitCode": 0,
  "stdout": "✓ 23 tests passed",
  "stderr": "",
  "timedOut": false,
  "durationMs": 8234
}
```

### Knowledge

#### `contract_registry_query`
Query cross-lane contracts and past decisions.

```typescript
export interface QueryContractParams {
  contractId?: string;
  laneId?: string;
  since?: string;  // ISO timestamp
}
```

**Example**:
```json
{
  "name": "contract_registry_query",
  "parameters": { "laneId": "backend" }
}

// Result
{
  "contracts": [
    {
      "id": "backend-api-spec-v1.0",
      "laneId": "backend",
      "version": "1.0",
      "createdAt": "2026-03-05T10:00:00Z",
      "content": { "endpoints": [...] }
    }
  ]
}
```

---

## Tool-Use Loop

### Execution Flow

```
1. Orchestrator sends prompt + available tools to LLM
2. LLM decides to use tools
3. LLM generates tool_call JSON
4. Orchestrator extracts tool calls
5. For each tool call:
   a. Validate tool call (safe parameters)
   b. If write/executable: Wait for supervisor approval
   c. Execute tool
   d. Format result JSON
6. Add tool results to conversation
7. Send back to LLM with tools available again
8. Repeat until LLM stops using tools
```

### Example: Multi-Turn Tool Use

```
Turn 1:
────
LLM: "Let me examine the codebase structure"
Tool: read_file("src/api/server.ts")
Result: (file content)

Turn 2:
────
LLM: "I see the issue. Let me search for related code"
Tool: grep_project("class Server")
Result: (2 matches)

Turn 3:
────
LLM: "Based on my analysis, here are the findings..."
(Provides analysis, no more tool calls)

Done!
```

---

## Configuration Reference

### Enable Tool-Use

```typescript
interface ToolUseConfig {
  enabled: boolean;
  
  // Which tools to expose
  tools: ToolName[];
  
  // Tool behavior
  options?: {
    autoApproveReads?: boolean;      // Don't wait for approval on read tools
    autoApproveWrites?: boolean;     // Auto-approve writes (caution!)
    maxToolCalls?: number;            // Stop after N tool calls
    maxToolResultSize?: number;       // Truncate results over N bytes
  };
  
  // Supervision
  supervision?: {
    approveWrites: boolean;          // Require approval for write_file
    approveShell: boolean;           // Require approval for run_shell
    logAllCalls: boolean;            // Audit log every tool call
  };
}

type ToolName = 
  | 'read_file'
  | 'list_dir'
  | 'write_file'
  | 'grep_project'
  | 'count_lines'
  | 'run_shell'
  | 'contract_registry_query'
  | string;  // Custom tools
```

### Per-Check Configuration

```json
{
  "id": "smart-review",
  "type": "llm-review",
  "toolsEnabled": true,
  "tools": [
    "read_file",
    "grep_project",
    "list_dir"
  ],
  "toolOptions": {
    "autoApproveReads": true,
    "maxToolCalls": 10,
    "maxToolResultSize": 16384
  },
  "toolSupervision": {
    "approveWrites": true,
    "approveShell": true
  }
}
```

---

## Examples

### Example 1: Code Review with Tools

```json
{
  "id": "intelligent-review",
  "type": "llm-review",
  "toolsEnabled": true,
  "tools": ["read_file", "grep_project", "list_dir"],
  "prompt": "Review the API design. Use tools to examine the codebase.",
  "model": "opus"
}
```

**Action**:
1. LLM reads API file
2. LLM searches for interface definitions
3. LLM checks imports and usage
4. LLM provides comprehensive review

### Example 2: Generated Tests with Verification

```json
{
  "id": "generate-tests",
  "type": "llm-generate",
  "toolsEnabled": true,
  "tools": [
    "read_file",
    "write_file",
    "run_shell"
  ],
  "prompt": "Generate tests for src/api.ts, then verify they pass.",
  "model": "sonnet",
  "toolOptions": {
    "autoApproveWrites": false  // Wait for approval before writing tests
  },
  "toolSupervision": {
    "approveShell": false,      // Auto-approve test runs
    "approveWrites": true
  }
}
```

**Action**:
1. LLM reads API source
2. LLM generates test code
3. LLM calls write_file (supervisor approves)
4. LLM runs tests via run_shell
5. LLM reports results

### Example 3: Cross-Codebase Analysis

```json
{
  "id": "api-audit",
  "type": "llm-review",
  "toolsEnabled": true,
  "tools": [
    "read_file",
    "list_dir",
    "grep_project",
    "run_shell",
    "count_lines"
  ],
  "prompt": "Audit the API security and generate a report.",
  "model": "opus",
  "toolOptions": {
    "maxToolCalls": 20
  }
}
```

**Tools Used**:
- list_dir: Find all API endpoints
- read_file: Examine endpoint implementations
- grep_project: Find authentication checks
- count_lines: Calculate code size
- run_shell: Run security linters

---

## Custom Tools

Register domain-specific tools:

```typescript
import { TOOL_REGISTRY } from '@ai-agencee/ai-kit-agent-executor';

TOOL_REGISTRY.register({
  name: 'query_database',
  description: 'Execute read-only SQL queries against the dev database',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'SELECT query only'
      }
    },
    required: ['query']
  },
  handler: async (params: { query: string }) => {
    // Validate it's a SELECT
    if (!params.query.trim().toUpperCase().startsWith('SELECT')) {
      throw new Error('Only SELECT queries allowed');
    }
    
    const results = await executeQuery(params.query);
    return { results };
  },
  requiresApproval: false
});
```

Use in DAG:

```json
{
  "tools": [
    "read_file",
    "query_database"
  ]
}
```

---

## Supervisor Integration

### Approval Gate

When tool-use would modify the codebase:

```
Tool Call: write_file("src/new-feature.ts", ...1000 lines...)
  ↓
Supervisor sees write_file request
  ↓
Options:
  • APPROVE: Write file as-is
  • MODIFY: Suggest changes, LLM adapts
  • REJECT: Don't write, tell LLM why
  • ESCALATE: Wait for human approval
```

### Example Approval Logic

```typescript
const supervisor = new SupervisorAgent();

supervisor.on('tool:write_file', async (event) => {
  const check = event.check;
  
  if (event.fileSize > 5000) {
    // Large file: requires approval
    return 'ESCALATE';
  }
  
  if (event.filePath.includes('test.')) {
    // Tests are auto-approved
    return 'APPROVE';
  }
  
  // For normal source files: review first
  if (check.supervisor?.humanReviewRequired) {
    return 'ESCALATE';
  }
  
  return 'APPROVE';
});
```

---

## Monitoring Tool Use

### Tool Call Events

```typescript
orchestrator.on('tool:call', (event) => {
  console.log(`Tool: ${event.toolName}`);
  console.log(`Parameters: ${JSON.stringify(event.parameters)}`);
});

orchestrator.on('tool:result', (event) => {
  console.log(`Tool result: ${event.toolName}`);
  console.log(`Size: ${event.resultSize} bytes`);
  console.log(`Duration: ${event.durationMs}ms`);
});

orchestrator.on('tool:error', (event) => {
  console.error(`Tool failed: ${event.toolName}`);
  console.error(`Error: ${event.error}`);
});
```

### Tool Statistics

```typescript
const stats = await orchestrator.getToolStats(runId);

console.log(`Total tool calls: ${stats.totalCalls}`);
console.log(`Tool breakdown:`);
Object.entries(stats.byTool).forEach(([name, count]) => {
  console.log(`  ${name}: ${count} calls`);
});
console.log(`Avg result size: ${stats.avgResultSize} bytes`);
```

---

## Troubleshooting

### "LLM not calling tools"
- **Check**: `toolsEnabled: true` in check config
- **Verify**: Pass tools in prompt with descriptions
- **Try**: Use Opus (more likely to use tools than Sonnet)

### "Tool calls rejected by supervisor"
- **Review**: `toolSupervision` settings
- **Check**: File paths are within project
- **Verify**: Tool parameters are correct

### "Tool results seem truncated"
- **Increase**: `maxToolResultSize` in tool options
- **Split**: Large reads into multiple smaller reads
- **Check**: Tool logs for truncation messages

### "Tool execution too slow"
- **Reduce**: `maxToolCalls` limit
- **Optimize**: grep_project patterns to be more specific
- **Cache**: Results across tool calls

---

## Related Features

- [DAG Orchestration](./01-dag-orchestration.md) — Tools used within checks
- [Check Handlers](./04-check-handlers.md) — Available check types
- [Streaming Output](./05-streaming-output.md) — Works alongside tool-use
- [Agent Types](./02-agent-types-roles.md) — Agents that use tools

---

**Last Updated**: March 5, 2026 | **Version**: 1.0.0
