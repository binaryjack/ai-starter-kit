import type { CheckDefinition } from '../agent-types.js';

export interface BuiltLaneDefinition {
  id:               string;
  agentFile?:       string;
  supervisorFile?:  string;
  dependsOn:        string[];
  capabilities:     string[];
  providerOverride?: string;
  checks?:          CheckDefinition[];
  modelOverrides?:  Record<string, string>;
}

export interface BuiltGlobalBarrier {
  name:         string;
  participants: string[];
  mode:         'hard' | 'soft';
  timeoutMs?:   number;
}

export interface BuiltDagDefinition {
  name:               string;
  description?:       string;
  budgetUSD?:         number;
  modelRouterFile?:   string;
  lanes:              BuiltLaneDefinition[];
  globalBarriers:     BuiltGlobalBarrier[];
  capabilityRegistry: Record<string, string[]>;
}

export interface ILaneBuilder {
  _lane:   BuiltLaneDefinition;
  _parent: IDagBuilder;
  check(definition: CheckDefinition): ILaneBuilder;
  capability(cap: string): ILaneBuilder;
  agentFile(p: string): ILaneBuilder;
  supervisorFile(p: string): ILaneBuilder;
  provider(name: string): ILaneBuilder;
  dependsOn(...laneIds: string[]): ILaneBuilder;
  _build(): BuiltLaneDefinition;
  lane(id: string, opts?: Partial<Omit<BuiltLaneDefinition, 'id'>> & { provider?: string }): ILaneBuilder;
  barrier(name: string, mode: 'hard' | 'soft', opts?: { participants?: string[]; timeoutMs?: number }): IDagBuilder;
  build(): BuiltDagDefinition;
}

export interface IDagBuilder {
  _name:         string;
  _description?: string;
  _budgetUSD?:   number;
  _modelRouterFile?: string;
  _lanes:        ILaneBuilder[];
  _barriers:     BuiltGlobalBarrier[];
  _currentLane?: ILaneBuilder;
  description(text: string): IDagBuilder;
  budget(usd: number): IDagBuilder;
  modelRouter(filePath: string): IDagBuilder;
  lane(id: string, opts?: Partial<Omit<BuiltLaneDefinition, 'id'>> & { provider?: string }): ILaneBuilder;
  barrier(name: string, mode?: 'hard' | 'soft', opts?: { participants?: string[]; timeoutMs?: number }): IDagBuilder;
  build(): BuiltDagDefinition;
  toJSON(indent?: number): string;
}

export const LaneBuilder = function (
  this: ILaneBuilder,
  id: string,
  opts: Partial<BuiltLaneDefinition>,
  parent: IDagBuilder,
) {
  this._lane = {
    id,
    dependsOn:       opts.dependsOn       ?? [],
    capabilities:    opts.capabilities    ?? [],
    providerOverride: opts.providerOverride,
    agentFile:       opts.agentFile,
    supervisorFile:  opts.supervisorFile,
    checks:          opts.checks          ?? [],
    modelOverrides:  opts.modelOverrides,
  };
  this._parent = parent;
} as unknown as new (
  id: string,
  opts: Partial<BuiltLaneDefinition>,
  parent: IDagBuilder,
) => ILaneBuilder;

export const DagBuilder = function (
  this: IDagBuilder,
  name: string,
) {
  this._name    = name;
  this._lanes   = [];
  this._barriers = [];
} as unknown as new (name: string) => IDagBuilder;
