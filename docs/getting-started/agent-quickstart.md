# Agent Integration - Quick Start

## 5-Minute Setup

Your AI Starter Kit now includes full multi-agent orchestration. Here's how to get started:

### Installation

```bash
# Install dependencies (already done if building)
pnpm install

# Build all packages
pnpm build
```

### Try Your First Agent Command

```bash
# Create a test specification
cat > test-spec.md << 'EOF'
# Build a Real-time Chat Application

## Requirements
- WebSocket-based real-time messaging
- User authentication with JWT
- Message persistence
- Typing indicators
- Read receipts
EOF

# Run the Business Analyst agent
pnpm -C packages/cli -- ai-kit agent:breakdown test-spec.md
```

### Run Full Workflow

```bash
# Start a complete development workflow
pnpm -C packages/cli -- ai-kit agent:workflow test-spec.md

# This will:
# 1. Break down your specification
# 2. Design the architecture
# 3. Generate backend code
# 4. Create frontend components
# 5. Write test suites
# 6. Set up E2E tests
# 7. Validate everything
```

### Check Workflow Status

```bash
# After running a workflow, you'll get a session ID
# Use it to check progress anytime

pnpm -C packages/cli -- ai-kit agent:status <session-id>
```

### Validate Your Implementation

```bash
# After agents produce code, validate it
pnpm -C packages/cli -- ai-kit agent:validate path/to/implementation.ts
```

## What Gets Created

After running workflows, your `.agents/` directory contains:

```
.agents/
├── state/
│   └── workflow-[id].json       # Full workflow state
├── results/
│   ├── [id]-business-analyst.json
│   ├── [id]-architecture.json
│   ├── [id]-backend.json
│   ├── [id]-frontend.json
│   ├── [id]-testing.json
│   └── [id]-e2e.json
└── context/
    └── context-[id].json         # Workflow context
```

## Using with Claude

The agent system integrates with Claude via MCP:

```bash
# Start the MCP server
pnpm -C packages/mcp -- node dist/index.js
```

Then ask Claude to use the agent tools:

> "Use the @agent-workflow tool to build a real-time notification system. Break down requirements, design the architecture, and implement all components."

## Next Steps

1. **Read Full Guide**: See `AGENT_INTEGRATION.md` for complete documentation
2. **Explore Outputs**: Check `.agents/results/` to see what agents generate
3. **Integrate with Your Workflow**: Use sessions to track development
4. **Add Custom Agents**: Extend the system with your own specialized agents

## Troubleshooting

**"Cannot find module '@ai-agencee/engine'"**
```bash
pnpm install
pnpm build
```

**"Workflow session not found"**
```bash
# Check available sessions
ls .agents/state/

# Use correct session ID format (UUID)
```

**Tests failing with "No tests found"**
```bash
# This is expected - add tests to packages/agent-executor/tests/
# Or run with passWithNoTests flag
pnpm test -- --passWithNoTests
```

## Features

✅ Multi-agent orchestration  
✅ Persistent workflow state  
✅ Supervisor checkpoints  
✅ CLI integration  
✅ MCP server integration  
✅ Session-based tracking  
✅ Error handling and blockers  
✅ ULTRA_HIGH quality validation  

## Key Commands Reference

```bash
# Break down a spec
ai-kit agent:breakdown <spec-file>

# Run full workflow
ai-kit agent:workflow <spec-file>

# Validate output
ai-kit agent:validate <output-file>

# Check status
ai-kit agent:status <session-id>
```

Enjoy your automated multi-agent development workflow! 🚀

