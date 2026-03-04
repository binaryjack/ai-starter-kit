/**
 * LLM Provider abstraction — same interface across Anthropic, OpenAI, VS Code Sampling, Mock.
 * The ModelRouter selects which provider and model based on task type.
 *
 * Task → Model family mapping:
 *   file-analysis, contract-extraction, validation  → Haiku   (fast, cheap)
 *   code-generation, refactoring, api-design        → Sonnet  (balanced)
 *   architecture-decision, security-review, barrier → Opus    (deep reasoning)
 *
 * Provider class implementations live in ./providers/ and are re-exported here
 * for backward compatibility — all existing imports of this module continue to work.
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

// ─── Provider implementations (re-exported for backward compatibility) ────────

export { AnthropicProvider }       from './providers/anthropic.provider.js';
export { OpenAIProvider }          from './providers/openai.provider.js';
export { VSCodeSamplingProvider }  from './providers/vscode-sampling.provider.js';
export type { SamplingCallback }   from './providers/vscode-sampling.provider.js';
export { MockProvider }            from './providers/mock.provider.js';
