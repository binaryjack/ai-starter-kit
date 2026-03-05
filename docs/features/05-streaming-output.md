# Streaming Output & Real-Time Feedback

**Status**: ⏳ In Progress | **Priority**: P0 | **Roadmap**: G-01  
**Related**: DAG Orchestration, Event Bus, Model Routing

## Overview

Streaming output delivers **real-time token-by-token feedback** from LLM providers instead of waiting for the entire response. This dramatically improves perceived performance and enables **interactive user experiences**.

### Key Capabilities

- **Token streaming** — See LLM output character-by-character in real-time
- **Live progress feedback** — "Thinking..." indicators while processing
- **Event-driven architecture** — Subscribe to token events
- **Multiple output targets** — stdout, WebSocket, file, memory
- **Multi-language support** — Works with Anthropic, OpenAI, Ollama
- **Error recovery** — Handle mid-stream disconnections gracefully

---

## Core Concepts

### Non-Streaming (Current)

```
Request → Wait 30s → Full response → Display
(User sits idle)
```

### Streaming (Goal)

```
Request → Token 1 → Token 2 → Token 3 → ... → Complete
         (immediate feedback)
```

Example: Generating 1000-token response
- **Non-streaming**: Wait 30s total, then see full output
- **Streaming**: See first token in 100ms, live feedback throughout

---

## Quick Start

### 1. Enable Streaming in DAG

```json
{
  "name": "streaming-demo",
  "budgetUSD": 1.00,
  "executionOptions": {
    "streaming": true,
    "streamingTarget": "stdout"
  },
  "lanes": [
    {
      "id": "code-gen",
      "checks": [
        {
          "id": "generate-api",
          "type": "llm-generate",
          "taskType": "code-generation",
          "prompt": "Generate a TypeScript function to calculate fibonacci number.",
          "model": "sonnet",
          "outputKey": "api_code",
          "streaming": true
        }
      ]
    }
  ]
}
```

### 2. Execute with Streaming

```bash
# CLI auto-displays streaming output
ai-kit agent:dag agents/streaming-workflow.dag.json

# Output shows real-time:
# ▶ Lane: code-gen
#   Check: generate-api
#   📍 Generating...
#   export function fibonacci(n: number): number {
#     if (n <= 1) return n;
#     return fibonacci(n - 1) + fibonacci(n - 2);
#   }
#   ✅ Complete (1,247 tokens)
```

### 3. Programmatic Streaming

```typescript
import { DagOrchestrator } from '@ai-agencee/ai-kit-agent-executor';

const orchestrator = new DagOrchestrator(projectRoot);

// Subscribe to streaming events
orchestrator.on('token:stream', (event) => {
  process.stdout.write(event.token);  // Display character-by-character
});

orchestrator.on('stream:start', (event) => {
  console.log(`\n📍 ${event.checkId} generating...\n`);
});

orchestrator.on('stream:end', (event) => {
  console.log(`\n✅ Complete (${event.tokenCount} tokens)\n`);
});

const result = await orchestrator.execute(dagDefinition, {
  streaming: true
});
```

---

## Configuration Reference

### Streaming Options

```typescript
interface StreamingOptions {
  // Enable streaming
  enabled: boolean;
  
  // Where to stream output
  target: 'stdout' | 'websocket' | 'event' | 'file' | 'memory';
  
  // Streaming behavior
  buffer?: {
    size: number;              // Buffer this many tokens before emit
    flushIntervalMs?: number;  // Max wait time before emit
  };
  
  // Limits
  maxTokensPerStream?: number; // Stop after this many tokens
  timeoutMs?: number;          // Stop if no tokens received
  
  // Logging
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
  captureFullResponse?: boolean;  // Keep buffer of full output
}
```

### Per-Check Streaming

```json
{
  "id": "large-generation",
  "type": "llm-generate",
  "prompt": "...",
  "streaming": {
    "enabled": true,
    "target": "stdout",
    "buffer": { "size": 5, "flushIntervalMs": 100 }
  }
}
```

---

## Examples

### Example 1: CLI Streaming with Progress

```typescript
// In CLI
import { DagOrchestrator } from '@ai-agencee/ai-kit-agent-executor';

const orchestrator = new DagOrchestrator(projectRoot);
let tokenCount = 0;

// Setup streaming
orchestrator.on('token:stream', (event) => {
  process.stdout.write(event.token);
  tokenCount++;
  
  // Show token count every 50 tokens
  if (tokenCount % 50 === 0) {
    process.stdout.write(` [${tokenCount}] `);
  }
});

orchestrator.on('stream:start', (event) => {
  console.log(`\n\n🔄 ${event.checkId}`);
  console.log('─'.repeat(50));
  tokenCount = 0;
});

orchestrator.on('stream:end', (event) => {
  console.log(`\n─'.repeat(50));
  console.log(`✅ Complete: ${event.tokenCount} tokens, $${event.costUSD.toFixed(4)}\n`);
});

const result = await orchestrator.execute(dagDefinition, {
  streaming: true
});
```

**Output**:
```
🔄 generate-interface
──────────────────────────────────────────────────
export interface UserService { [50]
  getUser(id: string): Promise<User>; [100]
  createUser(data: CreateUserDto): Promise<User>; [150]
  updateUser(id: string, data: UpdateUserDto): Promise<User>; [200]
  deleteUser(id: string): Promise<void>; [250]
} [300]
──────────────────────────────────────────────────
✅ Complete: 287 tokens, $0.0086
```

### Example 2: WebSocket Streaming for Web UI

```typescript
// Backend server with WebSocket support
import WebSocket from 'ws';
import { DagOrchestrator } from '@ai-agencee/ai-kit-agent-executor';

const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
  const orchestrator = new DagOrchestrator(projectRoot);
  
  // Forward streaming tokens to client
  orchestrator.on('token:stream', (event) => {
    ws.send(JSON.stringify({
      type: 'token',
      data: event.token
    }));
  });
  
  orchestrator.on('stream:end', (event) => {
    ws.send(JSON.stringify({
      type: 'complete',
      data: {
        tokens: event.tokenCount,
        cost: event.costUSD
      }
    }));
  });
  
  // Receive DAG request
  ws.on('message', async (message) => {
    const dagDefinition = JSON.parse(message);
    await orchestrator.execute(dagDefinition, { streaming: true });
  });
});
```

**Frontend**:
```typescript
// React component
function DagRunner() {
  const [output, setOutput] = useState('');
  
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080');
    
    ws.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data);
      
      if (type === 'token') {
        setOutput(prev => prev + data);
      } else if (type === 'complete') {
        console.log(`Done: ${data.tokens} tokens, $${data.cost}`);
      }
    };
    
    return () => ws.close();
  }, []);
  
  return <pre className="streaming-output">{output}</pre>;
}
```

### Example 3: Buffered Streaming

Stream grouped content (e.g., complete methods, paragraphs):

```typescript
const orchestrator = new DagOrchestrator(projectRoot);

const buffer = {
  content: '',
  flushAt(size) {
    if (this.content.length >= size) {
      console.log(this.content);
      this.content = '';
    }
  }
};

orchestrator.on('token:stream', (event) => {
  buffer.content += event.token;
  buffer.flushAt(500);  // Emit every 500 characters
});

orchest.on('stream:end', () => {
  if (buffer.content) console.log(buffer.content);  // Flush remainder
});

await orchestrator.execute(dagDefinition, { streaming: true });
```

---

## Provider Support Matrix

| Provider | Method | Status |
|----------|--------|--------|
| **Anthropic** | SSE + token events | ✅ Supported |
| **OpenAI** | SSE + chunks | ✅ Supported |
| **Ollama** | SSE stream | ✅ Supported |
| **VS Code Sampling** | Event emitter | ✅ Supported |
| **Google Gemini** | Chunked response | ⏳ In Progress |
| **AWS Bedrock** | EventStream | ⏳ In Progress |

---

## Performance Characteristics

### Latency Impact

- **Time to first token**: 100-500ms (provider dependent)
- **Token throughput**: 5-20 tokens/sec (network bound)
- **Memory overhead**: Minimal (streaming optimized)

### Network Efficiency

**Non-streaming** — Single request/response:
```
Network roundtrips: 1
Bandwidth: Full response at once
Latency: Full wait time
```

**Streaming** — Progressive delivery:
```
Network roundtrips: Many (but smaller chunks)
Bandwidth: Same total, distributed
Latency: First token fast, rest overlapped with display
```

### Example Performance

Generating 2000-token response:

**Non-Streaming**:
- Time to result: 35 seconds
- User experience: Frozen for 35s, then full output

**Streaming**:
- Time to first token: 0.2 seconds ✅
- Time to complete: 25 seconds (15% faster overall)
- User experience: Live feedback throughout

---

## Error Handling

### Mid-Stream Failures

If connection fails during streaming:

```typescript
orchestrator.on('stream:error', (event) => {
  console.error(`Stream interrupted: ${event.error}`);
  console.log(`Tokens received: ${event.partialTokenCount}`);
  
  // Fallback behavior
  if (event.canRetry) {
    console.log('Retrying non-streaming...');
    await retry({ streaming: false });
  }
});
```

### Graceful Degradation

If streaming unavailable, fallback to non-streaming:

```typescript
try {
  await orchestrator.execute(dagDefinition, { streaming: true });
} catch (error) {
  if (error.code === 'STREAMING_UNSUPPORTED') {
    console.log('Streaming unavailable, using non-streaming mode');
    await orchestrator.execute(dagDefinition, { streaming: false });
  }
}
```

---

## Monitoring Streaming

### Stream Metrics

```typescript
orchestrator.on('stream:complete', (event) => {
  console.log({
    checkId: event.checkId,
    totalTokens: event.tokenCount,
    durationMs: event.durationMs,
    tokensPerSecond: event.tokenCount / (event.durationMs / 1000),
    costUSD: event.costUSD
  });
});

// Output
{
  checkId: "generate-api",
  totalTokens: 1247,
  durationMs: 18000,
  tokensPerSecond: 69.3,
  costUSD: 0.0374
}
```

### Buffer Efficiency

```typescript
orchestrator.on('stream:stats', (event) => {
  console.log(`Buffer flush count: ${event.flushCount}`);
  console.log(`Avg buffer size: ${event.avgBufferSize}`);
});
```

---

## Troubleshooting

### "No streaming output appearing"
- **Check**: `streaming: true` in DAG definition
- **Verify**: Event listeners registered before execution
- **Check**: Provider supports streaming (not Mock provider)

### "Streaming too fast to read"
- **Enable** buffering: `buffer: { size: 100 }`
- **Add** delay: Use `flushIntervalMs: 200` for slower output
- **Compare**: Try `logLevel: 'debug'` to see events

### "Memory usage high during streaming"
- **Reduce** `buffer.size` (flush more frequently)
- **Disable** `captureFullResponse` if not needed
- **Stream to file** instead of memory

### "Streaming stops unexpectedly"
- **Check** `timeoutMs` setting (increase if needed)
- **Verify** network connectivity
- **Try** non-streaming to confirm it's not a provider issue

---

## Related Features

- [DAG Orchestration](./01-dag-orchestration.md) — Streaming integrated into DAG execution
- [Event Bus](./08-event-bus.md) — Token events published here
- [Model Routing](./03-model-routing-cost.md) — Works with any routed model
- [Real-time Dashboard](./18-dashboard.md) — Display streaming output in UI

---

**Last Updated**: March 5, 2026 | **Version**: 1.0.0
