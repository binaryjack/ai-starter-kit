import type { ICircuitBreaker }  from '../../circuit-breaker/circuit-breaker.js';
import { CircuitBreaker }        from '../../circuit-breaker/circuit-breaker.js';
import type { ModelFamily, TaskType } from '../../llm-provider.js';
import type {
  ModelProfile,
  BudgetCap,
  RoutedResponse,
}                                from '../model-router.types.js';
import type { IModelRouter }     from '../model-router.js';
import { ModelRouter }           from '../model-router.js';

export function _breakerFor(
  this:         IModelRouter,
  providerName: string,
): ICircuitBreaker {
  let b = this._breakers.get(providerName);
  if (!b) {
    b = new CircuitBreaker({ name: providerName });
    this._breakers.set(providerName, b);
  }
  return b;
}

export function profileFor(
  this:     IModelRouter,
  taskType: TaskType,
): ModelProfile {
  return this._config.taskProfiles[taskType] ?? { family: 'sonnet', maxTokens: 4096 };
}

export function modelIdFor(
  this:         IModelRouter,
  taskType:     TaskType,
  providerName?: string,
): string {
  const profile = this.profileFor(taskType);
  const pName   = providerName ?? this._config.defaultProvider;
  const providerConfig = this._config.providers[pName];
  if (!providerConfig) {
    throw new Error(
      `Unknown provider "${pName}". Known: ${Object.keys(this._config.providers).join(', ')}`,
    );
  }
  return providerConfig.models[profile.family];
}

export function estimateCost(
  this:         IModelRouter,
  inputTokens:  number,
  outputTokens: number,
  providerName: string,
  family:       ModelFamily,
): number {
  const costs = this._config.providers[providerName]?.costs;
  if (!costs) return 0;
  return (
    (inputTokens  / 1_000_000) * costs.inputPerMillion +
    (outputTokens / 1_000_000) * costs.outputPerMillion
  );
}

export function budgetCap(this: IModelRouter): BudgetCap | undefined {
  return this._config.budgetCap;
}

export function defaultProvider(this: IModelRouter): string {
  return this._config.defaultProvider;
}

export function registeredProviders(this: IModelRouter): string[] {
  return [...this._providers.keys()];
}

export function wrapAllProviders(
  this:  IModelRouter,
  mapFn: (provider: import('../../llm-provider.js').LLMProvider) => import('../../llm-provider.js').LLMProvider,
): IModelRouter {
  for (const [name, p] of this._providers) {
    this._providers.set(name, mapFn(p));
  }
  return this;
}

export function withProviderOverride(
  this:       IModelRouter,
  providerId: string,
): IModelRouter {
  if (!this._config.providers[providerId]) {
    throw new Error(
      `Cannot override provider to "${providerId}": not found in config. ` +
      `Known providers: ${Object.keys(this._config.providers).join(', ')}`,
    );
  }
  const scoped = new ModelRouter({ ...this._config, defaultProvider: providerId });
  for (const [name, p] of this._providers) {
    scoped.registerProvider(p);
    const existing = this._breakers.get(name);
    if (existing) scoped._breakers.set(name, existing);
  }
  return scoped;
}
