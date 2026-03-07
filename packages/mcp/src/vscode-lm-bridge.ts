/**
 * VS Code LM Bridge — MCP Sampling Adapter
 *
 * When the MCP server is connected to VS Code Copilot Chat, the MCP protocol
 * supports a "sampling" capability: the server asks the CLIENT (VS Code) to
 * make LLM calls on its behalf. This means:
 *   - No API keys needed in the tool
 *   - Uses whatever model the user has configured in VS Code
 *   - Billing goes through the user's existing Copilot subscription
 *
 * How it works:
 *   1. MCP server declares { capabilities: { sampling: {} } }
 *   2. At runtime, server calls client.createMessage({ ... }) via the MCP SDK
 *   3. VS Code makes the actual LLM call and streams the result back
 *   4. This module wraps that flow into a SamplingCallback compatible with
 *      VSCodeSamplingProvider in llm-provider.ts
 *
 * Usage (in packages/mcp/src/index.ts when setting up a DAG run):
 *
 *   import { createVSCodeSamplingBridge } from './vscode-lm-bridge.js';
 *   import { VSCodeSamplingProvider } from '@ai-agencee/engine';
 *
 *   const bridge = createVSCodeSamplingBridge(server);
 *   const provider = new VSCodeSamplingProvider(bridge);
 *   router.registerProvider(provider);
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { LLMMessage, SamplingCallback } from '@ai-agencee/engine';

// MCP sampling request/response types (from MCP spec)
interface MCPSamplingMessage {
  role: 'user' | 'assistant';
  content: {
    type: 'text';
    text: string;
  };
}

interface MCPCreateMessageParams {
  messages: MCPSamplingMessage[];
  systemPrompt?: string;
  maxTokens: number;
  modelPreferences?: {
    hints?: Array<{ name?: string }>;
    intelligencePriority?: number;
    speedPriority?: number;
    costPriority?: number;
  };
}

interface MCPCreateMessageResult {
  role: 'assistant';
  content: {
    type: 'text';
    text: string;
  };
  model: string;
  stopReason?: string;
}

/**
 * Create a SamplingCallback that routes LLM calls through VS Code via MCP sampling.
 *
 * The modelHint string is used in modelPreferences.hints so VS Code picks the
 * closest available model. The hint format matches VS Code Copilot model IDs:
 *   'copilot/claude-haiku'   → fast, cheap
 *   'copilot/claude-sonnet'  → balanced
 *   'copilot/claude-opus'    → deep reasoning
 *   'copilot/gpt-4o'         → alternative
 */
export function createVSCodeSamplingBridge(server: Server): SamplingCallback {
  return async (
    messages: LLMMessage[],
    modelHint: string,
    maxTokens: number,
  ): Promise<{ content: string; model: string }> => {
    // Separate system message from conversation messages
    const systemMsg = messages.find((m) => m.role === 'system');
    const conversationMsgs = messages.filter((m) => m.role !== 'system');

    // Convert to MCP sampling message format (only user/assistant roles)
    const samplingMessages: MCPSamplingMessage[] = conversationMsgs.map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: { type: 'text' as const, text: m.content },
    }));

    // Ensure at least one user message (MCP requirement)
    if (samplingMessages.length === 0 || samplingMessages[samplingMessages.length - 1].role !== 'user') {
      samplingMessages.push({
        role: 'user',
        content: { type: 'text', text: 'Please proceed.' },
      });
    }

    const params: MCPCreateMessageParams = {
      messages: samplingMessages,
      ...(systemMsg ? { systemPrompt: systemMsg.content } : {}),
      maxTokens,
      modelPreferences: {
        hints: [{ name: modelHint }],
        // Vary priorities based on model family hint
        intelligencePriority: modelHint.includes('opus') ? 1.0 : modelHint.includes('sonnet') ? 0.7 : 0.3,
        speedPriority: modelHint.includes('haiku') ? 1.0 : modelHint.includes('sonnet') ? 0.5 : 0.2,
        costPriority: modelHint.includes('haiku') ? 1.0 : modelHint.includes('sonnet') ? 0.6 : 0.2,
      },
    };

    // Call VS Code via MCP sampling — the SDK handles the protocol details
    const result = await (server as unknown as {
      createMessage(params: MCPCreateMessageParams): Promise<MCPCreateMessageResult>;
    }).createMessage(params);

    return {
      content: result.content.text,
      model: result.model,
    };
  };
}

/**
 * Check whether the connected MCP client supports sampling.
 * If not, callers should fall back to a direct API provider.
 */
export function isSamplingSupported(server: Server): boolean {
  // The MCP SDK exposes client capabilities after connection is established
  const s = server as unknown as {
    _clientCapabilities?: { sampling?: unknown };
  };
  return !!s._clientCapabilities?.sampling;
}
