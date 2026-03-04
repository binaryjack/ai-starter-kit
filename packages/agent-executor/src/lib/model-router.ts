import * as fs from 'fs/promises';
import {
  TaskType,
  ModelFamily,
  LLMProvider,
  LLMPrompt,
  LLMResponse,
  AnthropicProvider,
  OpenAIProvider,
  MockProvider,
} from './llm-provider.js';

// ─── Config Types ─────────────────────────────────────────────────────────────

export interface ModelProfile {
  /** Which model tier to use for this task */
  family: ModelFamily;
  /** Default max tokens for this task type */
  maxTokens: number;
  /** Optional temperature override (default: provider default) */
  temperature?: number;
}

export interface ProviderModelMap {
  haiku: string;
  sonnet: string;
  opus: string;
}

export interface TokenCosts {
  /** Cost in USD per 1 million input tokens */
  inputPerMillion: number;
  /** Cost in USD per 1 million output tokens */
  outputPerMillion: number;
}

export interface ProviderConfig {
  models: ProviderModelMap;
  costs?: TokenCosts;
}

export interface BudgetCap {
  /** Max USD spend per full DAG run */
  perRun: number;
  /** Max USD spend per single lane */
  perLane: number;
  currency: string;
}

export interface ModelRouterConfig {
  /** Which provider to use when none is specified */
  defaultProvider: string;
  /** Maps each task type to a model family + token budget */
  taskProfiles: Record<string, ModelProfile>;
  /** Provider-specific model IDs and token costs */
  providers: Record<string, ProviderConfig>;
  /** Optional spend caps that trigger budget exceeded events */
  budgetCap?: BudgetCap;
}

// ─── Routed Response ─────────────────────────────────────────────────────────

export interface RoutedResponse extends LLMResponse {
  taskType: TaskType;
  estimatedCostUSD: number;
}

// ─── ModelRouter ──────────────────────────────────────────────────────────────

/**
 * Routes LLM calls to the correct model based on task type.
 *
 * Decision hierarchy:
 *   1. task type  →  model family (haiku / sonnet / opus)
 *   2. provider   →  actual model ID (e.g. "claude-haiku-4-5")
 *   3. provider   →  LLMProvider instance (Anthropic / OpenAI / VSCode / Mock)
 *
 * Usage:
 *   const router = await ModelRouter.fromFile('agents/model-router.json');
 *   await router.autoRegister();
 *   const response = await router.route('code-generation', { messages });
 */
export class ModelRouter {
  private readonly config: ModelRouterConfig;
  private readonly providers = new Map<string, LLMProvider>();

  constructor(config: ModelRouterConfig) {
    this.config = config;
  }

  // ─── Provider Registration ─────────────────────────────────────────────────

  /** Manually register a provider (e.g. VSCodeSamplingProvider from MCP bridge) */
  registerProvider(provider: LLMProvider): this {
    this.providers.set(provider.name, provider);
    return this;
  }

  /**
   * Auto-register all providers whose credentials are available in the environment.
   * Safe to call in any environment — silently skips unavailable providers.
   */
  async autoRegister(): Promise<this> {
    const candidates: LLMProvider[] = [new AnthropicProvider(), new OpenAIProvider()];
    for (const p of candidates) {
      if (await p.isAvailable()) {
        this.registerProvider(p);
      }
    }
    return this;
  }

  /** Register a mock provider for testing */
  useMock(responses: Record<string, string> = {}): this {
    return this.registerProvider(new MockProvider(responses));
  }

  // ─── Profile Resolution ────────────────────────────────────────────────────

  /** Get the model profile (family + maxTokens) for a task type */
  profileFor(taskType: TaskType): ModelProfile {
    return (
      this.config.taskProfiles[taskType] ?? {
        family: 'sonnet',
        maxTokens: 4096,
      }
    );
  }

  /**
   * Get the concrete model ID string for a given task + provider.
   * e.g. ('code-generation', 'anthropic') → 'claude-sonnet-4-5'
   */
  modelIdFor(taskType: TaskType, providerName?: string): string {
    const profile = this.profileFor(taskType);
    const pName = providerName ?? this.config.defaultProvider;
    const providerConfig = this.config.providers[pName];
    if (!providerConfig) {
      throw new Error(
        `Unknown provider "${pName}". Known: ${Object.keys(this.config.providers).join(', ')}`,
      );
    }
    return providerConfig.models[profile.family];
  }

  // ─── Cost Estimation ───────────────────────────────────────────────────────

  /** Estimate cost in USD for a given token usage */
  estimateCost(
    inputTokens: number,
    outputTokens: number,
    providerName: string,
    family: ModelFamily,
  ): number {
    const costs = this.config.providers[providerName]?.costs;
    if (!costs) return 0;
    return (
      (inputTokens / 1_000_000) * costs.inputPerMillion +
      (outputTokens / 1_000_000) * costs.outputPerMillion
    );
  }

  // ─── Route ─────────────────────────────────────────────────────────────────

  /**
   * Route a task to the right model and execute the LLM call.
   *
   * @param taskType  Determines which model family is selected
   * @param prompt    The messages + optional token override
   * @param overrideProvider  Force a specific provider (e.g. 'vscode' in MCP context)
   */
  async route(
    taskType: TaskType,
    prompt: LLMPrompt,
    overrideProvider?: string,
  ): Promise<RoutedResponse> {
    const providerName = overrideProvider ?? this.config.defaultProvider;
    const provider = this.providers.get(providerName);

    if (!provider) {
      const available = [...this.providers.keys()];
      throw new Error(
        `Provider "${providerName}" is not registered. Available: ${available.join(', ') || 'none'}. ` +
          `Call autoRegister() or registerProvider() first.`,
      );
    }

    const profile = this.profileFor(taskType);
    const modelId = this.modelIdFor(taskType, providerName);

    const mergedPrompt: LLMPrompt = {
      ...prompt,
      maxTokens: prompt.maxTokens ?? profile.maxTokens,
      temperature: prompt.temperature ?? profile.temperature,
    };

    const response = await provider.complete(mergedPrompt, modelId);
    const cost = this.estimateCost(
      response.usage.inputTokens,
      response.usage.outputTokens,
      providerName,
      profile.family,
    );

    return {
      ...response,
      taskType,
      estimatedCostUSD: cost,
    };
  }

  // ─── Budget ────────────────────────────────────────────────────────────────

  get budgetCap(): BudgetCap | undefined {
    return this.config.budgetCap;
  }

  get defaultProvider(): string {
    return this.config.defaultProvider;
  }

  get registeredProviders(): string[] {
    return [...this.providers.keys()];
  }

  // ─── Factory ───────────────────────────────────────────────────────────────

  /** Load configuration from a model-router.json file */
  static async fromFile(configPath: string): Promise<ModelRouter> {
    const raw = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(raw) as ModelRouterConfig;
    return new ModelRouter(config);
  }

  /** Create with an in-memory config (useful for testing) */
  static fromConfig(config: ModelRouterConfig): ModelRouter {
    return new ModelRouter(config);
  }
}
