import type { LLMResponse, ModelFamily, TaskType } from '../llm-provider.js'
import type { PiiScrubberOptions } from '../pii-scrubber/pii-scrubber.types.js'

export interface ModelProfile {
  family:       ModelFamily;
  maxTokens:    number;
  temperature?: number;
}

export interface ProviderModelMap {
  haiku:  string;
  sonnet: string;
  opus:   string;
}

export interface TokenCosts {
  inputPerMillion:  number;
  outputPerMillion: number;
}

export interface ProviderConfig {
  models: ProviderModelMap;
  costs?: TokenCosts;
}

export interface BudgetCap {
  perRun:   number;
  perLane:  number;
  currency: string;
}

export interface ModelRouterConfig {
  defaultProvider: string;
  taskProfiles:    Record<string, ModelProfile>;
  providers:       Record<string, ProviderConfig>;
  budgetCap?:      BudgetCap;
  piiScrubbing?:   PiiScrubberOptions;
}

export interface RoutedResponse extends LLMResponse {
  taskType:         TaskType;
  estimatedCostUSD: number;
}
