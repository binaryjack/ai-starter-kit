# Extending the Agent System

## Overview

The agent orchestration system is designed to be extensible. This guide shows how to add custom agents and integrate them into the workflow.

## Architecture Review

The core agent system consists of:

1. **Type System** - Defines agent capabilities and workflow structure
2. **Context Manager** - Handles state persistence
3. **Workflow Orchestrator** - Manages agent sequencing and coordination
4. **CLI/MCP Integration** - User-facing interfaces

## Adding a Custom Agent

### Step 1: Define the Agent Type

First, add your agent to the `AgentType` enum in [src/lib/types.ts](packages/agent-executor/src/lib/types.ts):

```typescript
export type AgentType = 
  | 'business-analyst' 
  | 'architecture' 
  | 'backend' 
  | 'frontend' 
  | 'testing' 
  | 'e2e' 
  | 'supervisor'
  | 'security'  // ← NEW AGENT
  | 'performance';  // ← NEW AGENT
```

### Step 2: Add Agent Configuration

Update the `AGENT_CONFIGS` constant:

```typescript
export const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  'business-analyst': {
    name: 'business-analyst',
    displayName: 'Business Analyst',
    description: 'Breaks down specifications into requirements',
  },
  // ... existing configs ...
  'security': {
    name: 'security',
    displayName: 'Security Agent',
    description: 'Reviews code for security vulnerabilities',
  },
  'performance': {
    name: 'performance',
    displayName: 'Performance Agent',
    description: 'Optimizes code for performance',
  },
};
```

### Step 3: Update Workflow Sequence

Modify the workflow sequence in [workflow-orchestrator.ts](packages/agent-executor/src/lib/workflow-orchestrator.ts):

```typescript
async getNextAgent(workflow: WorkflowState): Promise<AgentType | null> {
  const sequence: AgentType[] = [
    'business-analyst',
    'architecture',
    'backend',
    'frontend',
    'testing',
    'e2e',
    'security',        // ← NEW: Add after e2e
    'performance',     // ← NEW: Add after security
    // supervisor automatically validates at the end
  ];
  
  // Rest of implementation remains the same
  for (const agentType of sequence) {
    if (!workflow.agents[agentType]) {
      return agentType;
    }
    // ...
  }
}
```

### Step 4: Add CLI Command (Optional)

Create a handler for the new agent in [packages/cli/src/commands/agents.ts](packages/cli/src/commands/agents.ts):

```typescript
export const runSecurity = async (codeFile: string): Promise<void> => {
  try {
    const codeContent = await fs.readFile(codeFile, 'utf-8');

    console.log('\n🔒 Security Agent - Vulnerability Assessment\n');
    console.log('Analyzing code for security issues...');
    console.log(`File: ${codeFile}`);
    console.log(`Size: ${codeContent.length} bytes\n`);

    const workflow = await workflowOrchestrator.createWorkflow(
      path.basename(codeFile),
      codeContent
    );

    console.log(`✅ Security analysis started: ${workflow.sessionId}`);
    console.log('\n🔍 Checking for:');
    console.log('  - Vulnerable dependencies');
    console.log('  - Injection vulnerabilities');
    console.log('  - Authentication/authorization issues');
    console.log('  - Data exposure risks');
    console.log('  - Insecure cryptography\n');
  } catch (error) {
    console.error('❌ Failed to analyze code:', error);
    process.exit(1);
  }
};
```

### Step 5: Register CLI Command

Add to [packages/cli/bin/ai-kit.ts](packages/cli/bin/ai-kit.ts):

```typescript
import { runSecurity } from '../src/commands/agents.js';

program
  .command('agent:security <code-file>')
  .description('Analyze code for security vulnerabilities using Security agent')
  .action(runSecurity);
```

### Step 6: Add MCP Tool (Optional)

Update [packages/mcp/src/index.ts](packages/mcp/src/index.ts):

```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ... existing tools ...
    {
      name: 'agent-security',
      description: 'Use Security agent to analyze code for vulnerabilities',
      inputSchema: {
        type: 'object' as const,
        properties: {
          code: {
            type: 'string',
            description: 'Code to analyze for security issues',
          },
          scanType: {
            type: 'string',
            enum: ['all', 'dependencies', 'injection', 'auth', 'cryptography'],
            description: 'Type of security scan to perform',
          },
        },
        required: ['code'],
      },
    },
  ],
}));
```

## Implementing Agent Logic

While the orchestration system is built, you'll need to implement the actual agent logic. Here's how:

### Option 1: Subprocess-Based Agents

```typescript
import { spawn } from 'child_process';

async function runSecurityAgent(input: AgentInput): Promise<AgentOutput> {
  return new Promise((resolve, reject) => {
    const agent = spawn('python', ['agents/security.py']);
    
    agent.stdin.write(JSON.stringify(input));
    agent.stdin.end();
    
    let output = '';
    agent.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    agent.on('close', (code) => {
      if (code === 0) {
        resolve(JSON.parse(output));
      } else {
        reject(new Error(`Security agent failed with code ${code}`));
      }
    });
  });
}
```

### Option 2: API-Based Agents

```typescript
async function runSecurityAgent(input: AgentInput): Promise<AgentOutput> {
  const response = await fetch('http://localhost:3001/security', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  
  if (!response.ok) {
    throw new Error(`Security API error: ${response.statusText}`);
  }
  
  return response.json();
}
```

### Option 3: In-Process Agents

```typescript
import { analyzeSecurityAsync } from 'security-analyzer';

async function runSecurityAgent(input: AgentInput): Promise<AgentOutput> {
  const analysis = await analyzeSecurityAsync(input.code);
  
  return {
    agentType: 'security',
    sessionId: input.sessionId,
    output: JSON.stringify(analysis, null, 2),
    status: analysis.vulnerabilities.length === 0 ? 'completed' : 'completed',
    errors: analysis.criticalIssues.map(i => i.description),
  };
}
```

## Integration Pattern

Here's a complete integration example for a custom agent:

```typescript
// agents/custom-agent.ts
import { workflowOrchestrator, agentContext, WorkflowState } from '@ai-agencee/engine';

export async function executeCustomAgent(sessionId: string): Promise<void> {
  // 1. Load current workflow state
  const workflow = await agentContext.loadWorkflowState(sessionId);
  if (!workflow) {
    throw new Error(`Workflow ${sessionId} not found`);
  }

  // 2. Get previous agent's output
  const prevAgentOutput = await agentContext.loadOutput(sessionId, 'previous-agent');
  
  // 3. Process with your custom logic
  const result = await processCustomLogic(prevAgentOutput?.output || '');
  
  // 4. Create agent output
  const output = {
    agentType: 'custom-agent' as const,
    sessionId,
    output: result,
    status: 'completed' as const,
    errors: [],
  };
  
  // 5. Update workflow
  await workflowOrchestrator.updateAgentOutput(sessionId, output);
  
  // 6. Get next agent
  const nextAgent = await workflowOrchestrator.getNextAgent(workflow);
  if (nextAgent) {
    console.log(`✓ Custom agent complete. Next: ${nextAgent}`);
  }
}

async function processCustomLogic(input: string): Promise<string> {
  // Your custom agent logic here
  return `Processed: ${input}`;
}
```

## Testing Custom Agents

```typescript
// tests/custom-agent.test.ts
import { workflowOrchestrator, agentContext } from '@ai-agencee/ai-kit-agent-executor';

describe('Custom Agent', () => {
  it('should process agent workflow', async () => {
    // Create test workflow
    const workflow = await workflowOrchestrator.createWorkflow(
      'test-feature',
      'test specification'
    );
    
    // Execute your agent
    const output = {
      agentType: 'custom' as any,
      sessionId: workflow.sessionId,
      output: 'test result',
      status: 'completed' as const,
      errors: [],
    };
    
    // Update workflow
    const updated = await workflowOrchestrator.updateAgentOutput(
      workflow.sessionId,
      output
    );
    
    // Verify
    expect(updated.agents.custom).toBeDefined();
    expect(updated.agents.custom.output).toBe('test result');
    
    // Cleanup
    await agentContext.cleanupSession(workflow.sessionId);
  });
});
```

## Common Patterns

### Pattern 1: Sequential Refinement

```typescript
async function sequentialRefinement(sessionId: string): Promise<void> {
  let attempt = 1;
  while (attempt <= maxAttempts) {
    const result = await runAgent();
    if (result.quality >= minQuality) break;
    attempt++;
  }
}
```

### Pattern 2: Parallel Validation

```typescript
async function parallelValidation(sessionId: string): Promise<void> {
  const outputs = await Promise.all([
    validateSyntax(code),
    validateSemantics(code),
    validatePerformance(code),
  ]);
  
  const errors = outputs.flatMap(o => o.errors);
  return { errors, status: errors.length === 0 ? 'completed' : 'failed' };
}
```

### Pattern 3: Conditional Branching

```typescript
async function conditionalExecution(workflow: WorkflowState): Promise<void> {
  const prevOutput = await agentContext.loadOutput(
    workflow.sessionId,
    previousAgent
  );
  
  if (prevOutput?.output.includes('critical')) {
    // Take critical path
    await executeCriticalPath();
  } else {
    // Normal path
    await executeNormalPath();
  }
}
```

## Best Practices

1. **Always save state**: Use `agentContext.saveOutput()` to persist results
2. **Handle errors gracefully**: Include errors in the output object
3. **Log progress**: Use console for user visibility
4. **Clean up resources**: Call `agentContext.cleanupSession()` when done
5. **Document assumptions**: Explain what your agent expects from previous agents
6. **Validate input**: Check that required data is available
7. **Set realistic timeouts**: Some agents may take time
8. **Test edge cases**: Empty input, malformed data, etc.

## Troubleshooting

### "Cannot find workflow session"
```typescript
// Make sure to create the workflow first
const workflow = await workflowOrchestrator.createWorkflow(
  'feature-name',
  'specification'
);
console.log('Session ID:', workflow.sessionId);
```

### "Previous agent output not found"
```typescript
// Check the previous agent's output exists
const prevOutput = await agentContext.loadOutput(
  sessionId,
  'previous-agent'
);
if (!prevOutput) {
  console.warn('Previous agent has not run yet');
}
```

### "Workflow state corrupted"
```typescript
// Clean up and start fresh
await agentContext.cleanupSession(sessionId);
const newWorkflow = await workflowOrchestrator.createWorkflow(
  featureName,
  spec
);
```

## Examples

See the [packages/agent-executor/src/lib/](packages/agent-executor/src/lib/) directory for example implementations.

## Performance Tips

- Cache agent configurations in memory
- Batch file I/O operations where possible
- Use async/await for non-blocking operations
- Consider agent-specific optimizations
- Profile hot paths with Node's built-in tools

## Security Considerations

- Validate all input from previous agents
- Sanitize output before passing to next agent
- Implement timeouts for long-running agents
- Log sensitive operations for auditing
- Restrict file system access as needed

---

Ready to build your custom agents? Start with [Step 1: Define the Agent Type](#step-1-define-the-agent-type) above!

