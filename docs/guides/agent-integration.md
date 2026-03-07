# AI Agent Integration Guide

## Overview

This document describes the multi-agent orchestration system integrated into the AI Starter Kit. The system enables seamless coordination of specialized AI agents across the development workflow.

## Architecture

### Agent Types

The system coordinates 7 specialized agents:

1. **Business Analyst** - Breaks down specifications into actionable requirements
2. **Architecture** - Designs system architecture and design patterns  
3. **Backend** - Implements backend services and APIs
4. **Frontend** - Builds frontend components and UI
5. **Testing** - Creates comprehensive test suites
6. **E2E** - End-to-end testing and integration validation
7. **Supervisor** - Quality validation against ULTRA_HIGH standards

### Workflow Orchestration

Agents execute in a structured sequence with supervisor checkpoints:

```
Specification Input
    ↓
Business Analyst (Break down spec)
    ↓ [Supervisor Checkpoint]
Architecture (Design system)
    ↓ [Supervisor Checkpoint]
Backend (Implement services)
    ↓ [Supervisor Checkpoint]
Frontend (Build UI)
    ↓ [Supervisor Checkpoint]
Testing (Create tests)
    ↓ [Supervisor Checkpoint]
E2E (Integration testing)
    ↓ [Supervisor Checkpoint]
Final Output
```

## CLI Commands

### 1. Break Down Specification

Break down a specification using the Business Analyst agent:

```bash
ai-kit agent:breakdown <spec-file>
```

**Example:**
```bash
ai-kit agent:breakdown feature-spec.md
```

**Output:**
- Feature breakdown and requirements
- Dependency mapping
- Estimated implementation effort
- Session ID for workflow tracking

### 2. Run Full Workflow

Execute the complete agent workflow from specification to completion:

```bash
ai-kit agent:workflow <spec-file>
```

**Example:**
```bash
ai-kit agent:workflow feature-spec.md
```

**Process:**
1. Creates workflow session
2. Business Analyst breaks down spec
3. Awaits supervisor approval
4. Architecture designs the system
5. Backend implements services
6. Frontend builds components
7. Testing creates test suites
8. E2E validates integration
9. Supervisor performs final validation

**Output:**
- Workflow session ID (saved to `.agents/state/workflow-[sessionId].json`)
- Agent outputs (saved to `.agents/results/`)
- Final validation report

### 3. Validate Output

Validate code or output against ULTRA_HIGH standards:

```bash
ai-kit agent:validate <output-file>
```

**Example:**
```bash
ai-kit agent:validate implementation.ts
```

**Checks:**
- No `any` types in TypeScript
- No stub implementations
- No TODO comments
- No cross-slice imports
- Full error handling
- Tests present and passing
- 95%+ coverage
- Type safety

### 4. Check Workflow Status

Check the current status of a running workflow:

```bash
ai-kit agent:status <session-id>
```

**Example:**
```bash
ai-kit agent:status 550e8400-e29b-41d4-a716-446655440000
```

**Output:**
- Current workflow status
- Progress of each agent
- Blockers and issues
- Supervisor approvals

## File Structure

The agent system creates the following directory structure:

```
.agents/
├── context/           # Workflow context and metadata
│   └── context-[sessionId].json
├── results/           # Agent outputs
│   ├── [sessionId]-business-analyst.json
│   ├── [sessionId]-architecture.json
│   ├── [sessionId]-backend.json
│   ├── [sessionId]-frontend.json
│   ├── [sessionId]-testing.json
│   └── [sessionId]-e2e.json
└── state/            # Workflow state
    └── workflow-[sessionId].json
```

## MCP Integration

The agent system integrates with the MCP server, providing Claude with access to:

- `@agent-breakdown` - Break down specifications
- `@agent-workflow` - Orchestrate full workflows
- `@agent-validate` - Validate implementations
- `@agent-status` - Check workflow status

## Workflow State

Each workflow maintains state with the following structure:

```typescript
{
  sessionId: string;              // Unique workflow identifier
  featureName: string;            // Feature/specification name
  status: 'pending' | 'running' | 'completed' | 'failed';
  agents: {
    [agentType]: AgentOutput;     // Output from each agent
  };
  approvals: {
    supervisor: boolean;           // Supervisor approval status
  };
  blockers: string[];             // Issues and blockers encountered
}
```

## API Reference

### Core Exports

The agent-executor package exports:

```typescript
// Types
export { AgentType, WorkflowState, AgentOutput, AgentConfig };

// Context Management
export { agentContext };

// Workflow Orchestration
export { workflowOrchestrator };
```

### Context Manager API

```typescript
agentContext.ensureDirectories()           // Create .agents directory structure
agentContext.saveContext(context)          // Save workflow context
agentContext.loadContext(sessionId)        // Load workflow context
agentContext.saveOutput(output, sessionId) // Save agent output
agentContext.loadOutput(sessionId, agentType)  // Load agent output
agentContext.saveWorkflowState(state)      // Persist workflow state
agentContext.loadWorkflowState(sessionId)  // Restore workflow state
agentContext.getAllOutputs(sessionId)      // Get all agent outputs
agentContext.cleanupSession(sessionId)     // Clean up session files
```

### Workflow Orchestrator API

```typescript
workflowOrchestrator.createWorkflow(featureName, spec)     // Create workflow
workflowOrchestrator.getWorkflow(sessionId)                // Retrieve workflow
workflowOrchestrator.getNextAgent(workflow)                // Get next agent to run
workflowOrchestrator.updateAgentOutput(sessionId, output)  // Record agent output
workflowOrchestrator.approveCheckpoint(sessionId, agentType)  // Approve agent
workflowOrchestrator.rejectCheckpoint(sessionId, agentType, reason)  // Reject
workflowOrchestrator.getWorkflowSummary(sessionId)         // Get status summary
```

## Usage Examples

### Example 1: Interactive Development

```bash
# Break down a feature specification
ai-kit agent:breakdown spec.md

# Review the breakdown manually
# Then run the full workflow
ai-kit agent:workflow spec.md

# Monitor progress
ai-kit agent:status 550e8400-e29b-41d4-a716-446655440000

# Validate the final implementation
ai-kit agent:validate dist/implementation.ts
```

### Example 2: Programmatic Usage

```typescript
import { workflowOrchestrator, agentContext } from '@ai-agencee/engine';

// Create a workflow
const workflow = await workflowOrchestrator.createWorkflow(
  'User Authentication',
  'Implement OAuth2 with JWT tokens'
);

// Get next agent to execute
const nextAgent = await workflowOrchestrator.getNextAgent(workflow);

// After agent produces output
const output = {
  agentType: 'business-analyst',
  sessionId: workflow.sessionId,
  output: 'Requirements breakdown...',
  status: 'completed',
  errors: []
};

// Update workflow with output
const updated = await workflowOrchestrator.updateAgentOutput(
  workflow.sessionId,
  output
);

// Get workflow summary
const summary = await workflowOrchestrator.getWorkflowSummary(
  workflow.sessionId
);
console.log(summary);
```

## Best Practices

1. **Always Save Context** - Ensure workflow context is persisted for auditing
2. **Supervisor Checkpoints** - Review each agent's output before proceeding
3. **Error Handling** - Check for blockers and errors before proceeding
4. **Clean Up Sessions** - Remove old sessions to maintain a clean state
5. **Use Session IDs** - Track all workflows by session ID for reproducibility

## Troubleshooting

### Workflow Session Not Found

```bash
# List available sessions
ls .agents/state/

# Use the correct session ID format
ai-kit agent:status <correct-session-id>
```

### Agent Output Not Saving

```bash
# Ensure .agents directory exists
mkdir -p .agents/{context,results,state}

# Run with explicit permissions
ai-kit agent:workflow spec.md
```

### Supervisor Rejection

If an agent's output is rejected:

1. Review the rejection reason in `.agents/state/workflow-[sessionId].json`
2. Check the agent's output in `.agents/results/[sessionId]-[agentType].json`
3. Rerun the agent with corrections
4. Re-approve the checkpoint

## Performance Considerations

- Workflows are persisted to disk for recovery
- Each agent's output is independently stored
- Session cleanup can be automated
- Large specifications (>1MB) may require increased timeout

## Future Enhancements

- [ ] Real-time progress streaming
- [ ] Parallel agent execution where possible
- [ ] Web UI for workflow monitoring
- [ ] Integration with version control
- [ ] Automated retry logic
- [ ] Custom agent registration
- [ ] Output caching and deduplication

## Support

For issues or questions about agent integration:

1. Check the workflow status and blockers
2. Review agent outputs in `.agents/results/`
3. Validate workflow state in `.agents/state/`
4. Check the main README for project-wide issues

