/**
 * LLM Provider abstraction — same interface across Anthropic, OpenAI, VS Code Sampling, Mock.
 * The ModelRouter selects which provider and model based on task type.
 *
 * Task → Model family mapping:
 *   file-analysis, contract-extraction, validation  → Haiku   (fast, cheap)
 *   code-generation, refactoring, api-design        → Sonnet  (balanced)
 *   architecture-decision, security-review, barrier → Opus    (deep reasoning)
 */

// ─── Task Types ───────────────────────────────────────────────────────────────

export type TaskType =
  | 'file-analysis'           // Haiku: reading files, counting, extracting data
  | 'contract-extraction'     // Haiku: pulling schema/interface data from code
  | 'validation'              // Haiku: applying deterministic rules
  | 'code-generation'         // Sonnet: writing TypeScript/JS/CSS code
  | 'refactoring'             // Sonnet: restructuring existing code
  | 'api-design'              // Sonnet: designing interfaces and contracts
  | 'prompt-synthesis'        // Sonnet: compressing context for next agent
  | 'architecture-decision'   // Opus: long-range consequence reasoning
  | 'hard-barrier-resolution' // Opus: arbitrating cross-lane conflicts
  | 'security-review';        // Opus: adversarial thinking

export type ModelFamily = 'haiku' | 'sonnet' | 'opus';

// ─── Core Interfaces ─────────────────────────────────────────────────────────

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMPrompt {
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMResponse {
  content: string;
  usage: LLMUsage;
  model: string;
  provider: string;
}

export interface LLMProvider {
  readonly name: string;
  complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse>;
  isAvailable(): Promise<boolean>;
}

// ─── Anthropic Provider ───────────────────────────────────────────────────────

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '';
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

    const systemMsg = prompt.messages.find((m) => m.role === 'system');
    const userMsgs = prompt.messages.filter((m) => m.role !== 'system');

    const body = {
      model: modelId,
      max_tokens: prompt.maxTokens ?? 4096,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      messages: userMsgs.map((m) => ({ role: m.role, content: m.content })),
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as {
      content?: Array<{ text: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };

    return {
      content: data.content?.[0]?.text ?? '',
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      },
      model: modelId,
      provider: this.name,
    };
  }
}

// ─── OpenAI Provider ─────────────────────────────────────────────────────────

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey ?? process.env['OPENAI_API_KEY'] ?? '';
    this.baseUrl = baseUrl ?? 'https://api.openai.com/v1';
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY is not set');

    const body = {
      model: modelId,
      max_tokens: prompt.maxTokens ?? 4096,
      messages: prompt.messages.map((m) => ({ role: m.role, content: m.content })),
    };

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      content: data.choices?.[0]?.message?.content ?? '',
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      model: modelId,
      provider: this.name,
    };
  }
}

// ─── VS Code Sampling Provider ────────────────────────────────────────────────
//
// Used when running inside an MCP server that has a client with sampling capability.
// The MCP client (VS Code Copilot) makes the actual LLM call on our behalf —
// no API key required; uses the user's existing VS Code model configuration.
//
// The `SamplingCallback` is injected by the MCP bridge (packages/mcp/src/vscode-lm-bridge.ts)
// which calls `server.createMessage()` from the MCP SDK.

export type SamplingCallback = (
  messages: LLMMessage[],
  modelHint: string,
  maxTokens: number,
) => Promise<{ content: string; model: string }>;

export class VSCodeSamplingProvider implements LLMProvider {
  readonly name = 'vscode';
  private readonly callback: SamplingCallback;

  constructor(callback: SamplingCallback) {
    this.callback = callback;
  }

  async isAvailable(): Promise<boolean> {
    return true; // callback injected at construction — always available
  }

  async complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse> {
    const result = await this.callback(prompt.messages, modelId, prompt.maxTokens ?? 4096);

    // VS Code sampling doesn't return exact token counts — estimate from chars (~4 chars/token)
    const inputChars = prompt.messages.reduce((s, m) => s + m.content.length, 0);
    const outputChars = result.content.length;

    return {
      content: result.content,
      usage: {
        inputTokens: Math.ceil(inputChars / 4),
        outputTokens: Math.ceil(outputChars / 4),
      },
      model: result.model,
      provider: this.name,
    };
  }
}

// ─── Mock Provider (testing) ──────────────────────────────────────────────────

export class MockProvider implements LLMProvider {
  readonly name = 'mock';
  private readonly responses: Map<string, string>;

  constructor(responses: Record<string, string> = {}) {
    this.responses = new Map(Object.entries(responses));
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse> {
    // Match on the first 50 chars of the last user message, or fall back to 'default'
    const lastUser = [...prompt.messages].reverse().find((m) => m.role === 'user');
    const key = lastUser?.content.slice(0, 50) ?? 'default';
    const content =
      this.responses.get(key) ??
      this.responses.get('default') ??
      '{"status":"ok","findings":[],"recommendations":[],"details":{}}';

    return {
      content,
      usage: { inputTokens: 100, outputTokens: 50 },
      model: modelId,
      provider: this.name,
    };
  }
}
