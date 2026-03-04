# Agent Workflow Examples

This document provides real-world examples of using the multi-agent orchestration system.

## Example 1: Build a Real-Time Chat Application

### Specification File (`chat-app-spec.md`)

```markdown
# Real-Time Chat Application

## Overview
Build a modern web-based chat application with real-time messaging capabilities.

## Core Features
- User authentication with JWT
- One-on-one and group messaging
- Message history with search
- Typing indicators
- Online/offline status
- Message notifications
- File sharing support

## Technical Requirements
- Backend: Node.js/Express or similar
- Frontend: React with WebSocket support
- Database: PostgreSQL with real-time subscriptions
- Protocol: WebSocket for real-time sync
- Security: End-to-end encryption for messages
- Scalability: Support 10k+ concurrent users

## Quality Standards
- ULTRA_HIGH quality code
- 95%+ test coverage
- Type-safe throughout
- Zero technical debt
```

### Running the Workflow

```bash
# Step 1: Break down the specification
$ ai-kit agent:breakdown chat-app-spec.md

Output:
┌─────────────────────────────────────────────────────────┐
│ 📋 Business Analyst Agent - Specification Breakdown     │
├─────────────────────────────────────────────────────────┤
│ ✅ Workflow created: 550e8400-e29b-41d4-a716-446655440000
│ 📁 Feature: chat-app-spec.md
│ ⚙️  Status: pending
│
│ 👤 @Agent:BusinessAnalyst - Ready to break down spec
│ 📝 Next: Review spec breakdown and assign features
└─────────────────────────────────────────────────────────┘

# Step 2: Run the full workflow
$ ai-kit agent:workflow chat-app-spec.md

Output:
┌─────────────────────────────────────────────────────────┐
│ 🚀 Full Workflow Orchestrator                           │
├─────────────────────────────────────────────────────────┤
│ Spec Breakdown → Architecture → Backend → Frontend      │
│            → Testing → E2E → Validation                 │
│
│ ✅ Workflow started: 550e8400-e29b-41d4-a716-446655440000
│
│ 📋 Workflow Sequence:
│ 1. 👤 @Agent:BusinessAnalyst - Break down specification
│ 2. 🏗️  @Agent:Architecture - Design system architecture
│ 3. 🔧 @Agent:Backend - Implement backend services
│ 4. 🎨 @Agent:Frontend - Build frontend components
│ 5. 🧪 @Agent:Testing - Create test suites
│ 6. 🔄 @Agent:E2E - End-to-end testing
│ 7. ✔️  @Agent:Supervisor - Approve and validate
│
│ # Workflow: chat-app-spec.md
│ Session: 550e8400-e29b-41d4-a716-446655440000
│ Status: pending
│
│ ## Agent Progress
│ - Business Analyst: pending
│ - Architecture: pending
│ - Backend: pending
│ - Frontend: pending
│ - Testing: pending
│ - E2E: pending
│
│ 💾 Session stored: .agents/state/workflow-550e8400....json
└─────────────────────────────────────────────────────────┘

# Step 3: Monitor progress
$ ai-kit agent:status 550e8400-e29b-41d4-a716-446655440000

Output (after some agents complete):
┌─────────────────────────────────────────────────────────┐
│ # Workflow: chat-app-spec.md
│ Session: 550e8400-e29b-41d4-a716-446655440000
│ Status: running
│
│ ## Agent Progress
│ - Business Analyst: completed ✓
│ - Architecture: completed ✓
│ - Backend: running ⧗
│ - Frontend: pending
│ - Testing: pending
│ - E2E: pending
│
│ ## Blockers
│ - Architecture: Database schema needs review
└─────────────────────────────────────────────────────────┘

# Step 4: Review outputs
$ ls .agents/results/550e8400-e29b-41d4-a716-*/
550e8400-e29b-41d4-a716-446655440000-business-analyst.json
550e8400-e29b-41d4-a716-446655440000-architecture.json
550e8400-e29b-41d4-a716-446655440000-backend.json

# Step 5: Validate final output
$ ai-kit agent:validate .agents/results/550e8400-e29b-41d4-a716-446655440000-backend.json

Output:
┌─────────────────────────────────────────────────────────┐
│ ✅ Supervisor Agent - Quality Validation               │
│
│ Validating output against ULTRA_HIGH standards...
│
│ 📄 Validating: backend.json
│ Content length: 45234 bytes
│
│ 🔍 Standard Checks:
│   ✓ No `any` types
│   ✓ No stub implementations
│   ✓ No TODO comments
│   ✓ No cross-slice imports
│   ✓ Full error handling
│   ✓ Tests present and passing
│   ✓ 95%+ coverage
│   ✓ Type-safe
│
│ ✅ Validation complete - Output meets ULTRA_HIGH standards
└─────────────────────────────────────────────────────────┘
```

### Resulting Artifacts

```
.agents/
├── state/
│   └── workflow-550e8400-e29b-41d4-a716-446655440000.json
│       {
│         "sessionId": "550e8400-e29b-41d4-a716-446655440000",
│         "featureName": "chat-app-spec.md",
│         "status": "completed",
│         "agents": {
│           "business-analyst": { "status": "completed", ... },
│           "architecture": { "status": "completed", ... },
│           "backend": { "status": "completed", ... },
│           "frontend": { "status": "completed", ... },
│           "testing": { "status": "completed", ... },
│           "e2e": { "status": "completed", ... }
│         },
│         "approvals": { "supervisor": true },
│         "blockers": []
│       }
├── results/
│   ├── 550e8400-e29b-41d4-a716-446655440000-business-analyst.json
│   │   Requirements breakdown, user stories, acceptance criteria
│   ├── 550e8400-e29b-41d4-a716-446655440000-architecture.json
│   │   System design, database schema, API design
│   ├── 550e8400-e29b-41d4-a716-446655440000-backend.json
│   │   Express routes, database models, WebSocket handlers
│   ├── 550e8400-e29b-41d4-a716-446655440000-frontend.json
│   │   React components, hooks, WebSocket client
│   ├── 550e8400-e29b-41d4-a716-446655440000-testing.json
│   │   Jest unit tests, integration tests, fixtures
│   └── 550e8400-e29b-41d4-a716-446655440000-e2e.json
│       Playwright tests, user flows, edge cases
└── context/
    └── context-550e8400-e29b-41d4-a716-446655440000.json
        Session metadata and configuration
```

---

## Example 2: Programmatic Usage with Node.js

```typescript
// workflow.ts
import { workflowOrchestrator, agentContext } from '@ai-agencee/ai-kit-agent-executor';
import * as fs from 'fs/promises';

async function main() {
  try {
    // 1. Load specification
    const spec = await fs.readFile('feature-spec.md', 'utf-8');
    
    // 2. Create workflow
    console.log('Creating workflow...');
    const workflow = await workflowOrchestrator.createWorkflow(
      'My Feature',
      spec
    );
    console.log(`✓ Workflow created: ${workflow.sessionId}`);
    
    // 3. Process agents sequentially
    let agentType = await workflowOrchestrator.getNextAgent(workflow);
    while (agentType) {
      console.log(`\nRunning: ${agentType}`);
      
      // Call your agent implementation
      const result = await executeAgent(agentType, workflow.sessionId);
      
      // Create output
      const output = {
        agentType,
        sessionId: workflow.sessionId,
        output: result.output,
        status: 'completed' as const,
        errors: result.errors,
      };
      
      // Update workflow
      const updated = await workflowOrchestrator.updateAgentOutput(
        workflow.sessionId,
        output
      );
      
      console.log(`✓ ${agentType} completed`);
      
      if (updated.blockers.length > 0) {
        console.log(`⚠️  Blockers: ${updated.blockers.join(', ')}`);
      }
      
      // Get next agent
      agentType = await workflowOrchestrator.getNextAgent(updated);
    }
    
    // 4. Final summary
    const summary = await workflowOrchestrator.getWorkflowSummary(
      workflow.sessionId
    );
    console.log('\n' + summary);
    
    // 5. Get all outputs
    const allOutputs = await agentContext.getAllOutputs(workflow.sessionId);
    console.log(`\nCollected outputs from ${Object.keys(allOutputs).length} agents`);
    
  } catch (error) {
    console.error('❌ Workflow failed:', error);
    process.exit(1);
  }
}

async function executeAgent(agentType: string, sessionId: string): Promise<any> {
  // Implement your agent logic here
  // This could call external APIs, spawn subprocesses, etc.
  return {
    output: `Executed ${agentType}`,
    errors: [],
  };
}

main();
```

---

## Example 3: Integration with Claude via MCP

```
# Ask Claude to manage workflows

User: "I need to build a new feature. Break it down using the agents."

Claude: I'll help you with that! Let me start by using the agent-breakdown tool to analyze your feature.

@agent-breakdown
specification: "Build a user dashboard with analytics"

Claude: Great! Now let me run the full workflow to generate all the components.

@agent-workflow
specification: "Build a user dashboard with analytics"
featureName: "User Dashboard v2"

Claude: The workflow is running! Let me check the status.

@agent-status  
sessionId: "550e8400-e29b-41d4-a716-446655440000"

Claude: Excellent! The workflow is progressing well. All agents have completed their tasks. Let me validate the final output.

@agent-validate
output: "[content from backend agent]"

Claude: Perfect! All outputs meet the ULTRA_HIGH quality standards. Here's what was generated:

1. **Business Analyst**: Requirements and user stories
2. **Architecture**: System design and database schema
3. **Backend**: API endpoints and business logic
4. **Frontend**: React components and hooks
5. **Testing**: Comprehensive test suites
6. **E2E**: Integration tests and user flows

The session ID 550e8400-e29b-41d4-a716-446655440000 contains all the artifacts in .agents/results/
```

---

## Example 4: Error Handling and Recovery

```bash
# Scenario: Backend agent fails

$ ai-kit agent:status 550e8400-e29b-41d4-a716-446655440000

Output:
┌─────────────────────────────────────────────────────────┐
│ # Workflow: chat-app-spec.md
│ Status: failed
│
│ ## Agent Progress
│ - Business Analyst: completed ✓
│ - Architecture: completed ✓
│ - Backend: failed ✗
│
│ ## Blockers
│ - Backend failed: TypeScript compilation errors in service layer
│ - Backend: Missing database migration script
└─────────────────────────────────────────────────────────┘

# Step 1: Check the backend output
$ cat .agents/results/550e8400-e29b-41d4-a716-446655440000-backend.json

# Step 2: Fix the issues based on errors

# Step 3: Re-run backend with corrections
# (Implementation-specific - depends on how you've integrated agents)

# Step 4: Continue workflow from backend
$ ai-kit agent:workflow chat-app-spec.md --resume 550e8400-e29b-41d4-a716-446655440000
```

---

## Example 5: Batch Processing Multiple Features

```typescript
// batch-workflow.ts
import { workflowOrchestrator } from '@ai-agencee/ai-kit-agent-executor';
import * as fs from 'fs/promises';

async function processBatch() {
  const features = [
    'user-auth-spec.md',
    'payment-spec.md',
    'analytics-spec.md',
    'notifications-spec.md',
  ];
  
  const sessions = [];
  
  // Start all workflows
  for (const feature of features) {
    const content = await fs.readFile(feature, 'utf-8');
    const workflow = await workflowOrchestrator.createWorkflow(feature, content);
    sessions.push({
      feature,
      sessionId: workflow.sessionId,
    });
    console.log(`✓ Started: ${feature} (${workflow.sessionId})`);
  }
  
  // Monitor all workflows
  let running = true;
  while (running) {
    running = false;
    
    for (const session of sessions) {
      const workflow = await workflowOrchestrator.getWorkflow(session.sessionId);
      if (workflow?.status === 'running' || workflow?.status === 'pending') {
        running = true;
      }
      console.log(`${session.feature}: ${workflow?.status}`);
    }
    
    if (running) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s
    }
  }
  
  console.log('✓ All workflows completed!');
}

processBatch();
```

---

## Example 6: Custom Validation

```typescript
// custom-validation.ts
import { agentContext } from '@ai-agencee/ai-kit-agent-executor';

async function validateWorkflow(sessionId: string): Promise<void> {
  // Get all outputs
  const outputs = await agentContext.getAllOutputs(sessionId);
  
  // Custom validation rules
  const rules = [
    {
      name: 'Backend uses TypeScript',
      check: (output: any) => output.output.includes('typescript'),
      agents: ['backend'],
    },
    {
      name: 'Frontend uses React',
      check: (output: any) => output.output.includes('react'),
      agents: ['frontend'],
    },
    {
      name: 'Tests exist',
      check: (output: any) => output.output.includes('test'),
      agents: ['testing'],
    },
  ];
  
  // Run validations
  for (const rule of rules) {
    for (const agent of rule.agents) {
      const output = outputs[agent as any];
      if (output && rule.check(output)) {
        console.log(`✓ ${rule.name} (${agent})`);
      } else {
        console.log(`✗ ${rule.name} (${agent})`);
      }
    }
  }
}
```

---

## Tips & Tricks

### 1. Session Management
```bash
# List all sessions
ls .agents/state/

# Get session size
du -sh .agents/state/workflow-*.json

# Archive old sessions
mkdir archive && mv .agents/state/workflow-old-*.json archive/
```

### 2. Output Analysis
```bash
# Count completed agents
grep -l '"status":"completed"' .agents/results/*.json | wc -l

# Find agent errors
grep -h '"errors"' .agents/results/*.json | grep -v '\[\]'

# Extract specific agent output
cat .agents/results/[sessionId]-backend.json | jq '.output'
```

### 3. Workflow Templates
```bash
# Save workflow as template
cp .agents/state/workflow-[sessionId].json templates/chat-app-template.json

# Reuse for similar features
ai-kit agent:workflow new-chat-feature.md --template templates/chat-app-template.json
```

---

## Common Patterns

### Pattern 1: Feature Development
Spec → Analysis → Design → Implementation → Testing → Validation

### Pattern 2: Code Review
Implementation → Architecture Check → Performance Review → Security Audit → Approval

### Pattern 3: Bug Fix
Bug Report → Root Cause Analysis → Fix Implementation → Test Suite → Deployment

### Pattern 4: Performance Optimization
Profiling → Bottleneck Analysis → Optimization → Benchmarking → Verification

---

That's it! You now have comprehensive examples of how to use the multi-agent orchestration system.

For more information, see:
- `AGENT_INTEGRATION.md` - Full API reference
- `AGENT_QUICKSTART.md` - Quick start guide
- `EXTENDING_AGENTS.md` - Building custom agents

