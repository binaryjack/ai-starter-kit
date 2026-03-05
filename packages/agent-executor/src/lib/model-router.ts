import * as fs from 'fs/promises';
import { CircuitBreaker } from './circuit-breaker.js';
import {
    AnthropicProvider,
    LLMPrompt,
    LLMProvider,
    LLMResponse,
    LLMStreamChunk,
    MockProvider,
    ModelFamily,
    OpenAIProvider,
    TaskType,
    ToolExecutorFn,
} from './llm-provider.js';
import { RetryPolicy } from './retry-policy.js';

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
  private readonly breakers  = new Map<string, CircuitBreaker>();
  private readonly retry     = RetryPolicy.forLLM();

  constructor(config: ModelRouterConfig) {
    this.config = config;
  }

  private _breakerFor(providerName: string): CircuitBreaker {
    let b = this.breakers.get(providerName);
    if (!b) {
      b = new CircuitBreaker({ name: providerName });
      this.breakers.set(providerName, b);
    }
    return b;
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

    const response = await this.retry.execute(
      () => this._breakerFor(providerName).execute(() => provider.complete(mergedPrompt, modelId)),
      `${providerName}:${taskType}`,
    );
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

  /**
   * Route a task with tool-use enabled.
   *
   * Uses `provider.completeWithTools()` when available (Anthropic, OpenAI).
   * Falls back to `route()` for providers without native tool support (VS Code, Mock).
   *
   * @param taskType         Determines which model family is selected
   * @param prompt           Must include `prompt.tools` for tools to be registered
   * @param executor         Built-in or custom `ToolExecutorFn` to handle tool calls
   * @param overrideProvider Force a specific provider
   */
  async routeWithTools(
    taskType: TaskType,
    prompt: LLMPrompt,
    executor: ToolExecutorFn,
    overrideProvider?: string,
  ): Promise<RoutedResponse> {
    const providerName = overrideProvider ?? this.config.defaultProvider;
    const provider     = this.providers.get(providerName);

    if (!provider) {
      const available = [...this.providers.keys()];
      throw new Error(
        `Provider "${providerName}" not registered for tool-use. Available: ${available.join(', ') || 'none'}.`,
      );
    }

    const profile = this.profileFor(taskType);
    const modelId = this.modelIdFor(taskType, providerName);
    const merged: LLMPrompt = {
      ...prompt,
      maxTokens:   prompt.maxTokens   ?? profile.maxTokens,
      temperature: prompt.temperature ?? profile.temperature,
    };

    const response = await this.retry.execute(
      () => this._breakerFor(providerName).execute(() =>
        provider.completeWithTools
          ? provider.completeWithTools(merged, modelId, executor)
          : provider.complete(merged, modelId),
      ),
      `${providerName}:tools:${taskType}`,
    );

    const cost = this.estimateCost(
      response.usage.inputTokens,
      response.usage.outputTokens,
      providerName,
      profile.family,
    );
    return { ...response, taskType, estimatedCostUSD: cost };
  }

  /**
   * Stream a task to the right model, yielding incremental token strings.
   *
   * Falls back to `complete()` when the selected provider does not implement
   * `stream()` — callers treat it as a one-chunk stream in that case.
   *
   * The final item contains `usage` for cost tracking; callers should watch for
   * the `LLMStreamChunk.done === true` sentinel to record cost.
   *
   * @param taskType  Determines which model family is selected
   * @param prompt    The messages + optional token override
   * @param overrideProvider  Force a specific provider
   * @param onDone    Callback fired with the final RoutedResponse (for cost tracking)
   */
  async *streamRoute(
    taskType: TaskType,
    prompt: LLMPrompt,
    overrideProvider?: string,
    onDone?: (response: RoutedResponse) => void,
  ): AsyncIterable<string> {
    const providerName = overrideProvider ?? this.config.defaultProvider;
    const provider     = this.providers.get(providerName);

    if (!provider) {
      const available = [...this.providers.keys()];
      throw new Error(
        `Provider "${providerName}" is not registered for streaming. Available: ${available.join(', ') || 'none'}.`,
      );
    }

    const profile  = this.profileFor(taskType);
    const modelId  = this.modelIdFor(taskType, providerName);
    const merged: LLMPrompt = {
      ...prompt,
      maxTokens:   prompt.maxTokens   ?? profile.maxTokens,
      temperature: prompt.temperature ?? profile.temperature,
    };

    let inputTokens  = 0;
    let outputTokens = 0;
    let fullContent  = '';

    const breaker = this._breakerFor(providerName);

    if (provider.stream) {
      // Collect the full stream under retry + circuit-breaker protection,
      // then yield the cached tokens so caller code is non-blocking.
      const chunks = await this.retry.execute(
        () => breaker.execute(async () => {
          const collected: LLMStreamChunk[] = [];
          for await (const c of provider.stream!(merged, modelId) as AsyncIterable<LLMStreamChunk>) {
            collected.push(c);
          }
          return collected;
        }),
        `${providerName}:stream:${taskType}`,
      );
      for (const chunk of chunks) {
        if (!chunk.done && chunk.token) {
          fullContent += chunk.token;
          yield chunk.token;
        }
        if (chunk.done && chunk.usage) {
          inputTokens  = chunk.usage.inputTokens;
          outputTokens = chunk.usage.outputTokens;
        }
      }
    } else {
      // Fallback: non-streaming provider — complete() and yield full response
      const response = await this.retry.execute(
        () => breaker.execute(() => provider.complete(merged, modelId)),
        `${providerName}:complete:${taskType}`,
      );
      fullContent    = response.content;
      inputTokens    = response.usage.inputTokens;
      outputTokens   = response.usage.outputTokens;
      yield fullContent;
    }

    if (onDone) {
      const cost = this.estimateCost(inputTokens, outputTokens, providerName, profile.family);
      onDone({
        content: fullContent,
        usage:   { inputTokens, outputTokens },
        model:   modelId,
        provider: providerName,
        taskType,
        estimatedCostUSD: cost,
      });
    }
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

  // ─── Per-lane Provider Scope ──────────────────────────────────────────────

  /**
   * Return a scoped ModelRouter that forces every route() / routeWithTools() /
   * streamRoute() call to use `providerId` as the default provider.
   *
   * All registered providers and the original config are shared — only the
   * `defaultProvider` field is overridden. No network I/O; O(n) to copy
   * the registered provider map.
   *
   * Used by LaneExecutor to honour `LaneDefinition.providerOverride`.
   *
   * @param providerId  Must match a key in `this.config.providers`.
   *                    Throws at construction time if the provider is unknown.
   */
  withProviderOverride(providerId: string): ModelRouter {
    if (!this.config.providers[providerId]) {
      throw new Error(
        `Cannot override provider to "${providerId}": not found in config. ` +
        `Known providers: ${Object.keys(this.config.providers).join(', ')}`,
      );
    }
    const scoped = new ModelRouter({ ...this.config, defaultProvider: providerId });
    // Copy all registered LLMProvider instances so scoped router is fully functional
    for (const [name, p] of this.providers) {
      scoped.registerProvider(p);
      // Also copy circuit-breaker state so we don't reset failure counts
      const existing = this.breakers.get(name);
      if (existing) scoped.breakers.set(name, existing);
    }
    return scoped;
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
