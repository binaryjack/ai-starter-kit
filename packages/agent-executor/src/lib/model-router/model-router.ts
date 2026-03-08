import * as fs from 'fs/promises';

import type { ICircuitBreaker } from '../circuit-breaker/circuit-breaker.js';
import type { LLMPrompt, LLMProvider, ModelFamily, TaskType, ToolExecutorFn } from '../llm-provider.js';
import type { IPiiScrubber } from '../pii-scrubber/pii-scrubber.js';
import { PiiScrubber } from '../pii-scrubber/pii-scrubber.js';
import type { IRetryPolicy } from '../retry-policy/retry-policy.js';
import { RetryPolicy } from '../retry-policy/retry-policy.js';

import type {
    BudgetCap,
    ModelProfile,
    ModelRouterConfig,
    RoutedResponse,
} from './model-router.types.js';

import './prototype/index.js';

export interface IModelRouter {
  new(config: ModelRouterConfig): IModelRouter;
  // static
  fromFile(configPath: string): Promise<IModelRouter>;
  fromConfig(config: ModelRouterConfig): IModelRouter;
  // state
  _config:      ModelRouterConfig;
  _providers:   Map<string, LLMProvider>;
  _breakers:    Map<string, ICircuitBreaker>;
  _retry:       IRetryPolicy;
  _piiScrubber: IPiiScrubber;
  // methods
  registerProvider(provider: LLMProvider): IModelRouter;
  autoRegister(): Promise<IModelRouter>;
  useMock(responses?: Record<string, string>): IModelRouter;
  profileFor(taskType: TaskType): ModelProfile;
  modelIdFor(taskType: TaskType, providerName?: string): string;
  estimateCost(
    inputTokens:  number,
    outputTokens: number,
    providerName: string,
    family:       ModelFamily,
  ): number;
  route(
    taskType:          TaskType,
    prompt:            LLMPrompt,
    overrideProvider?: string,
  ): Promise<RoutedResponse>;
  routeWithTools(
    taskType:          TaskType,
    prompt:            LLMPrompt,
    executor:          ToolExecutorFn,
    overrideProvider?: string,
  ): Promise<RoutedResponse>;
  streamRoute(
    taskType:          TaskType,
    prompt:            LLMPrompt,
    overrideProvider?: string,
    onDone?:           (response: RoutedResponse) => void,
  ): AsyncIterable<string>;
  budgetCap(): BudgetCap | undefined;
  defaultProvider(): string;
  registeredProviders(): string[];
  wrapAllProviders(mapFn: (p: LLMProvider) => LLMProvider): IModelRouter;
  withProviderOverride(providerId: string): IModelRouter;
  _breakerFor(providerName: string): ICircuitBreaker;
}

export const ModelRouter = function(
  this:   IModelRouter,
  config: ModelRouterConfig,
) {
  this._config      = config;
  this._providers   = new Map<string, LLMProvider>();
  this._breakers    = new Map<string, ICircuitBreaker>();
  this._retry       = (RetryPolicy as unknown as { forLLM(): IRetryPolicy }).forLLM();
  this._piiScrubber = new PiiScrubber(config.piiScrubbing ?? {});
} as unknown as IModelRouter;

(ModelRouter as unknown as Record<string, unknown>).fromFile = async function(
  configPath: string,
): Promise<IModelRouter> {
  const raw    = await fs.readFile(configPath, 'utf-8');
  const config = JSON.parse(raw) as ModelRouterConfig;
  return new ModelRouter(config);
};

(ModelRouter as unknown as Record<string, unknown>).fromConfig = function(
  config: ModelRouterConfig,
): IModelRouter {
  return new ModelRouter(config);
};
