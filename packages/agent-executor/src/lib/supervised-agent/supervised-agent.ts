import * as fs from 'fs/promises'
import type { AgentDefinition } from '../agent-types.js'
import type { AgentResult, CheckpointMode, CheckpointPayload, ContractSnapshot, SupervisorVerdict } from '../dag-types.js'
import type { RoutedResponse } from '../model-router/index.js'
import './prototype/index.js'

export interface ISupervisedAgent {
  _definition: AgentDefinition;
  name(): string;
  icon(): string;
  run(
    projectRoot: string,
    defaultMode?: CheckpointMode,
    publishContract?: () => ContractSnapshot,
    modelRouter?: ModelRouter,
    onLlmResponse?: (response: RoutedResponse) => void,
    onLlmStream?: (token: string) => void,
  ): AsyncGenerator<CheckpointPayload, AgentResult | null, SupervisorVerdict>;
}

export const SupervisedAgent = function(
  this: ISupervisedAgent,
  definition: AgentDefinition,
) {
  this._definition = definition;
} as unknown as {
  new(definition: AgentDefinition): ISupervisedAgent;
  fromFile(agentFile: string): Promise<ISupervisedAgent>;
};

(SupervisedAgent as Record<string, unknown>).fromFile = async function(agentFile: string): Promise<ISupervisedAgent> {
  const raw = await fs.readFile(agentFile, 'utf-8');
  const definition: AgentDefinition = JSON.parse(raw);
  return new SupervisedAgent(definition);
};

// ─── Error Types ──────────────────────────────────────────────────────────────

export class EscalationError extends Error {
  constructor(
    message: string,
    public readonly verdict: SupervisorVerdict,
  ) {
    super(message);
    this.name = 'EscalationError';
  }
}
