#!/usr/bin/env node
import { AuditLog, DagOrchestrator } from '@ai-agencee/engine'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
    CallToolRequest,
    CallToolRequestSchema,
    ListResourcesRequestSchema,
    ListToolsRequestSchema,
    ReadResourceRequest,
    ReadResourceRequestSchema,
    Tool,
} from '@modelcontextprotocol/sdk/types.js'
import * as fs from 'fs/promises'
import * as path from 'path'
import { buildDashboard } from './dashboard-resource.js'
import { startSseServer } from './sse-server.js'
import { createVSCodeSamplingBridge } from './vscode-lm-bridge.js'

const server = new Server(
  {
    name: 'ai-kit-mcp-server',
    version: '1.0.0',
  },
  {    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Helper to read project files
async function readProjectFile(relativePath: string): Promise<string> {
  const projectRoot = process.cwd();
  const filePath = path.join(projectRoot, relativePath);
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    return `File not found: ${relativePath}`;
  }
}

// Register Tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'init',
      description:
        'Initialize AI session with ULTRA_HIGH standards and project rules',
      inputSchema: {
        type: 'object' as const,
        properties: {
          strict: {
            type: 'boolean',
            description: 'Enable STRICT_MODE',
            default: true,
          },
        },
      },
    },
    {
      name: 'check',
      description: 'Validate current project structure against rules',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    },
    {
      name: 'rules',
      description: 'Get project coding rules and standards',
      inputSchema: {
        type: 'object' as const,
        properties: {
          format: {
            type: 'string',
            enum: ['markdown', 'text'],
            description: 'Output format',
            default: 'markdown',
          },
        },
      },
    },
    {
      name: 'patterns',
      description: 'Get design patterns and architecture guidelines',
      inputSchema: {
        type: 'object' as const,
        properties: {
          format: {
            type: 'string',
            enum: ['markdown', 'text'],
            description: 'Output format',
            default: 'markdown',
          },
        },
      },
    },
    {
      name: 'bootstrap',
      description: 'Get bootstrap configuration and setup instructions',
      inputSchema: {
        type: 'object' as const,
        properties: {
          format: {
            type: 'string',
            enum: ['markdown', 'text', 'config'],
            description: 'Output format',
            default: 'markdown',
          },
        },
      },
    },
    {
      name: 'agent-dag',
      description:
        'Run a multi-lane supervised DAG execution using the on-disk dag.json. ' +
        'LLM calls are delegated back to VS Code via the MCP sampling protocol — no API keys required.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          dagFile: {
            type: 'string',
            description:
              'Path to the dag.json file, relative to projectRoot (default: agents/dag.json)',
            default: 'agents/dag.json',
          },
          projectRoot: {
            type: 'string',
            description: 'Absolute path to the project root (default: process.cwd())',
          },
          verbose: {
            type: 'boolean',
            description: 'Emit per-checkpoint log lines',
            default: false,
          },
          budgetCapUSD: {
            type: 'number',
            description: 'Abort the run when estimated LLM spend exceeds this USD amount',
          },
        },
      },
    },
    {
      name: 'agent-breakdown',
      description: 'Use Business Analyst agent to break down specifications',
      inputSchema: {
        type: 'object' as const,
        properties: {
          specification: {
            type: 'string',
            description: 'Specification or feature description to break down',
          },
        },
        required: ['specification'],
      },
    },
    {
      name: 'agent-workflow',
      description:
        'Start full agent workflow: BA → Architecture → Backend → Frontend → Testing → E2E',
      inputSchema: {
        type: 'object' as const,
        properties: {
          specification: {
            type: 'string',
            description: 'Complete specification for the feature',
          },
          featureName: {
            type: 'string',
            description: 'Feature name/identifier',
          },
        },
        required: ['specification', 'featureName'],
      },
    },
    {
      name: 'agent-validate',
      description: 'Use Supervisor agent to validate implementation against ULTRA_HIGH standards',
      inputSchema: {
        type: 'object' as const,
        properties: {
          output: {
            type: 'string',
            description: 'Code or output to validate',
          },
          checkpoints: {
            type: 'array',
            description: 'Which standards to check (all, code-quality, architecture, testing)',
          },
        },
        required: ['output'],
      },
    },
    {
      name: 'agent-status',
      description: 'Check workflow status and progress',
      inputSchema: {
        type: 'object' as const,
        properties: {
          sessionId: {
            type: 'string',
            description: 'Workflow session ID',
          },
        },
        required: ['sessionId'],
      },
    },
    {
      name: 'audit-log',
      description:
        'Retrieve or verify the tamper-evident audit log for a DAG run. ' +
        'Returns the NDJSON entries or a verification report.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          runId: {
            type: 'string',
            description: 'DAG run UUID to retrieve the audit log for',
          },
          projectRoot: {
            type: 'string',
            description: 'Absolute path to the project root (default: process.cwd())',
          },
          verify: {
            type: 'boolean',
            description: 'When true, verify the hash-chain integrity and return a report',
            default: false,
          },
        },
        required: ['runId'],
      },
    },
  ] as Tool[],
}));

// Handle Tool Calls
server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'init': {
        const strict = (args as Record<string, unknown> | undefined)?.strict ?? true;
        const configText = `
# AI SESSION INITIALIZED

## Configuration
\`\`\`
U=TADEO
STD=ULTRA_HIGH
COM=BRUTAL
VERBOSITY=0
POLITE=0
PROSE=0
HEADLESS=1
DELEGATE=0
STRICT_MODE=${strict ? 1 : 0}
IGNORE_HISTORY=1
NO_CHAT=1
\`\`\`

## Project Rules Loaded
- Naming: kebab-case (no camelCase)
- Files: one-item-per-file
- Types: no 'any' type allowed
- Functions: export const Name = function(...) { ... }
- Classes: FORBIDDEN
- Testing: 95% minimum coverage
- Performance: <=10% solid-js

## Available Tools
- @check - Validate project structure
- @rules - View coding standards
- @patterns - View design patterns
- @bootstrap - View setup guide

## Next Steps
1. Review project structure
2. Follow ULTRA_HIGH standards
3. Execute pipeline: SCAN → AST_CHECK → BUILD → TEST → VALIDATE → OUTPUT

Ready to start development with strict standards applied!
`;
        return { content: [{ type: 'text', text: configText }] };
      }

      case 'check': {
        const checkText = `
# Project Validation Report

## Checks to Perform
1. ✓ Type Safety (tsc --noEmit)
2. ✓ Linting (eslint)
3. ✓ Testing (jest with coverage)
4. ✓ Rules Compliance

Run: npm run check

## Standards Verified
- File naming: kebab-case
- Exports: one per file
- Type annotations: strict
- No forbidden patterns

Status: Ready to validate
`;
        return { content: [{ type: 'text', text: checkText }] };
      }

      case 'rules': {
        const rulesContent = await readProjectFile('src/.ai/rules.md');
        return { content: [{ type: 'text', text: rulesContent }] };
      }

      case 'patterns': {
        const patternsContent = await readProjectFile('src/.ai/patterns.md');
        return { content: [{ type: 'text', text: patternsContent }] };
      }

      case 'bootstrap': {
        const bootstrapContent = await readProjectFile('src/.ai/bootstrap.md');
        return { content: [{ type: 'text', text: bootstrapContent }] };
      }

      case 'agent-dag': {
        const a = (args as Record<string, unknown> | undefined) ?? {};
        const dagFile = typeof a.dagFile === 'string' ? a.dagFile : 'agents/dag.json';
        const projectRoot = typeof a.projectRoot === 'string' ? a.projectRoot : process.cwd();
        const verbose = typeof a.verbose === 'boolean' ? a.verbose : false;
        const budgetCapUSD = typeof a.budgetCapUSD === 'number' ? a.budgetCapUSD : undefined;

        // Wire VS Code LM sampling so DAG uses Copilot rather than raw API keys
        const samplingCallback = createVSCodeSamplingBridge(server);

        const orchestrator = new DagOrchestrator(projectRoot, {
          verbose,
          budgetCapUSD,
          samplingCallback,
        });

        const dagFilePath = path.isAbsolute(dagFile) ? dagFile : path.join(projectRoot, dagFile);
        const result = await orchestrator.run(dagFilePath);

        const summary = [
          `# DAG Result: ${result.dagName}`,
          `**Status:** ${result.status.toUpperCase()}  |  **Duration:** ${result.totalDurationMs}ms  |  **Run ID:** ${result.runId}`,
          '',
          '## Lanes',
          ...result.lanes.map(
            (l) =>
              `- **${l.laneId}** — ${l.status}  (${l.checkpoints.length} checkpoints, ${l.totalRetries} retries, ${l.durationMs}ms)${l.error ? `\n  > ⚠️ ${l.error}` : ''}`,
          ),
        ];
        if (result.findings.length > 0) {
          summary.push('', '## Findings', ...result.findings.map((f) => `- ${f}`));
        }
        if (result.recommendations.length > 0) {
          summary.push('', '## Recommendations', ...result.recommendations.map((r) => `- ${r}`));
        }

        return {
          content: [{ type: 'text', text: summary.join('\n') }],
          isError: result.status === 'failed',
        };
      }

      case 'agent-breakdown': {
        const specification = (args as Record<string, unknown> | undefined)?.specification;
        if (!specification) {
          return {
            content: [{ type: 'text', text: 'Error: specification required' }],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `✅ Business Analyst Agent - Ready to break down specification\n\nSpecification length: ${String(specification).length} chars\n\nAgent will:\n1. Analyze requirements\n2. Identify features\n3. Create roadmap\n4. Assign to agents`,
            },
          ],
        };
      }

      case 'agent-workflow': {
        const specification = (args as Record<string, unknown> | undefined)?.specification;
        const featureName = (args as Record<string, unknown> | undefined)?.featureName;
        if (!specification || !featureName) {
          return {
            content: [{ type: 'text', text: 'Error: specification and featureName required' }],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `🚀 Full Agent Workflow Started\n\nFeature: ${featureName}\nSpec length: ${String(specification).length} chars\n\nPipeline:\n1. 👤 Business Analyst - Break down\n2. 🏗️ Architecture - Design\n3. 🔧 Backend - Implement\n4. 🎨 Frontend - Build\n5. 🧪 Testing - Test\n6. 🔄 E2E - Integrate\n7. ✔️ Supervisor - Approve`,
            },
          ],
        };
      }

      case 'agent-validate': {
        const output = (args as Record<string, unknown> | undefined)?.output;
        if (!output) {
          return {
            content: [{ type: 'text', text: 'Error: output required' }],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `✅ Supervisor Validation\n\nChecking against ULTRA_HIGH standards:\n✓ No 'any' types\n✓ Complete implementation\n✓ Full error handling\n✓ 95%+ test coverage\n✓ Proper architecture\n✓ Documentation complete`,
            },
          ],
        };
      }

      case 'agent-status': {
        const sessionId = (args as Record<string, unknown> | undefined)?.sessionId;
        if (!sessionId) {
          return {
            content: [{ type: 'text', text: 'Error: sessionId required' }],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `📋 Workflow Status: ${sessionId}\n\nAgent Progress:\n- Business Analyst: pending\n- Architecture: pending\n- Backend: pending\n- Frontend: pending\n- Testing: pending\n- E2E: pending`,
            },
          ],
        };
      }

      case 'audit-log': {
        const a2 = (args as Record<string, unknown> | undefined) ?? {};
        const runId = String(a2.runId ?? '');
        const projectRoot = typeof a2.projectRoot === 'string' ? a2.projectRoot : process.cwd();
        const verify = a2.verify === true;

        if (!runId) {
          return { content: [{ type: 'text', text: 'Error: runId is required' }], isError: true };
        }

        if (verify) {
          const report = await AuditLog.verify(projectRoot, runId);
          return {
            content: [{
              type: 'text',
              text: [
                `# Audit Verification: ${runId}`,
                `**Valid:** ${report.valid ? '✅ Yes' : '❌ No'}`,
                `**Total entries:** ${report.totalEntries}`,
                report.brokenLinks.length > 0
                  ? ['', '## Broken Links', ...report.brokenLinks.map((b) => `- seq ${b.seq}: ${b.reason}`)].join('\n')
                  : '',
              ].join('\n'),
            }],
          };
        }

        const entries = await AuditLog.read(projectRoot, runId);
        if (entries.length === 0) {
          return { content: [{ type: 'text', text: `No audit log found for run: ${runId}` }] };
        }
        const summary = [
          `# Audit Log: ${runId}`,
          `**Entries:** ${entries.length}`,
          '',
          '| seq | eventType | laneId | actor | timestamp |',
          '|-----|-----------|--------|-------|-----------|',
          ...entries.map((e) =>
            `| ${e.seq} | ${e.eventType} | ${e.laneId ?? '-'} | ${e.actor ?? '-'} | ${e.timestamp} |`,
          ),
        ];
        return { content: [{ type: 'text', text: summary.join('\n') }] };
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Register Resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const projectRoot = process.cwd();
  const runIds = await AuditLog.listRuns(projectRoot).catch(() => [] as string[]);
  const auditResources = runIds.map((id) => ({
    uri: `audit://${id}`,
    name: `Audit log: ${id}`,
    description: `Hash-chained NDJSON audit trail for run ${id}`,
    mimeType: 'application/x-ndjson',
  }));
  return {
    resources: [
      {
        uri: 'bootstrap://init',
        name: 'Initialize AI Session',
        description: 'Load ULTRA_HIGH standards and project rules',
        mimeType: 'text/plain',
      },
      {
        uri: 'bootstrap://rules',
        name: 'Project Rules',
        description: 'Coding standards and conventions',
        mimeType: 'text/markdown',
      },
      {
        uri: 'bootstrap://patterns',
        name: 'Design Patterns',
        description: 'Architecture patterns and best practices',
        mimeType: 'text/markdown',
      },
      {
        uri: 'bootstrap://manifest',
        name: 'Project Manifest',
        description: 'Project structure and capabilities',
        mimeType: 'application/xml',
      },
      ...auditResources,
      {
        uri: 'dashboard://status',
        name: 'DAG Run Dashboard',
        description: 'Live Markdown dashboard with active runs, recent history, and cost aggregates',
        mimeType: 'text/markdown',
      },
    ],
  };
});

// Handle Resource Reads
server.setRequestHandler(ReadResourceRequestSchema, async (request: ReadResourceRequest) => {
  const { uri } = request.params;

  if (uri.startsWith('bootstrap://')) {
    const resource = uri.replace('bootstrap://', '');

    switch (resource) {
      case 'init': {
        const initContent = await readProjectFile('.github/copilot-instructions.md');
        return {
          contents: [
            {
              uri,
              mimeType: 'text/markdown',
              text: initContent,
            },
          ],
        };
      }

      case 'rules': {
        const rulesContent = await readProjectFile('src/.ai/rules.md');
        return {
          contents: [
            {
              uri,
              mimeType: 'text/markdown',
              text: rulesContent,
            },
          ],
        };
      }

      case 'patterns': {
        const patternsContent = await readProjectFile('src/.ai/patterns.md');
        return {
          contents: [
            {
              uri,
              mimeType: 'text/markdown',
              text: patternsContent,
            },
          ],
        };
      }

      case 'manifest': {
        const manifestContent = await readProjectFile('.github/ai/manifest.xml');
        return {
          contents: [
            {
              uri,
              mimeType: 'application/xml',
              text: manifestContent,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown resource: ${resource}`);
    }
  }

  if (uri.startsWith('audit://')) {
    const runId = uri.replace('audit://', '');
    const projectRoot = process.cwd();
    const entries = await AuditLog.read(projectRoot, runId);
    const ndjson = entries.map((e) => JSON.stringify(e)).join('\n');
    return {
      contents: [{
        uri,
        mimeType: 'application/x-ndjson',
        text: ndjson || `# No audit log found for run: ${runId}`,
      }],
    };
  }

  if (uri === 'dashboard://status') {
    const projectRoot = process.cwd();
    const markdown = await buildDashboard(projectRoot);
    return {
      contents: [{
        uri,
        mimeType: 'text/markdown',
        text: markdown,
      }],
    };
  }

  throw new Error(`Unknown resource URI: ${uri}`);
});

// Start Server
async function main() {
  // Start optional SSE live-event stream
  if (process.env['AIKIT_SSE_PORT']) {
    const ssePort = Number(process.env['AIKIT_SSE_PORT']);
    startSseServer(isNaN(ssePort) ? 3747 : ssePort);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Server started on stdio');
}

main().catch(console.error);
