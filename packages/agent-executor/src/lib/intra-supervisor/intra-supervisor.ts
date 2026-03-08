import * as fs from 'fs/promises';
import type { AgentResult } from '../agent-types.js';
import type {
    BarrierResolution,
    SupervisorCheckpointRule,
    SupervisorConfig,
    SupervisorVerdict,
} from '../dag-types.js';
import './prototype/index.js';

export interface IIntraSupervisor {
  _config: SupervisorConfig;
  _retryCounters: Map<string, number>;
  evaluate(
    checkpointId: string,
    partialResult: Partial<AgentResult>,
    barrier: BarrierResolution,
  ): SupervisorVerdict;
  isExhausted(checkpointId: string): boolean;
  incrementRetry(checkpointId: string): number;
  retryCount(checkpointId: string): number;
  laneId(): string;
  retryBudget(): number;
  getRuleFor(checkpointId: string): SupervisorCheckpointRule | undefined;
}

export const IntraSupervisor = function(
  this: IIntraSupervisor,
  config: SupervisorConfig,
) {
  this._config = config;
  this._retryCounters = new Map<string, number>();
} as unknown as {
  new(config: SupervisorConfig): IIntraSupervisor;
  fromFile(filePath: string): Promise<IIntraSupervisor>;
  noOp(laneId: string): IIntraSupervisor;
};

(IntraSupervisor as unknown as Record<string, unknown>).fromFile = async function(filePath: string): Promise<IIntraSupervisor> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const config = JSON.parse(raw) as SupervisorConfig;
  return new IntraSupervisor(config);
};

(IntraSupervisor as unknown as Record<string, unknown>).noOp = function(laneId: string): IIntraSupervisor {
  return new IntraSupervisor({ laneId, retryBudget: 0, checkpoints: [] });
};
