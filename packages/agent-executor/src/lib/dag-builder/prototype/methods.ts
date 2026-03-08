import type { CheckDefinition } from '../../agent-types.js';
import {
    BuiltDagDefinition,
    BuiltGlobalBarrier,
    BuiltLaneDefinition,
    IDagBuilder,
    ILaneBuilder,
    LaneBuilder
} from '../dag-builder.js';

// ─── LaneBuilder methods ────────────────────────────────────────────────────

export function laneCheck(this: ILaneBuilder, definition: CheckDefinition): ILaneBuilder {
  (this._lane.checks ??= []).push(definition);
  return this;
}

export function laneCapability(this: ILaneBuilder, cap: string): ILaneBuilder {
  this._lane.capabilities.push(cap);
  return this;
}

export function laneAgentFile(this: ILaneBuilder, p: string): ILaneBuilder {
  this._lane.agentFile = p;
  return this;
}

export function laneSupervisorFile(this: ILaneBuilder, p: string): ILaneBuilder {
  this._lane.supervisorFile = p;
  return this;
}

export function laneProvider(this: ILaneBuilder, name: string): ILaneBuilder {
  this._lane.providerOverride = name;
  return this;
}

export function laneDependsOn(this: ILaneBuilder, ...laneIds: string[]): ILaneBuilder {
  this._lane.dependsOn.push(...laneIds);
  return this;
}

export function laneBuild(this: ILaneBuilder): BuiltLaneDefinition {
  return { ...this._lane };
}

export function laneLane(
  this: ILaneBuilder,
  id: string,
  opts: Partial<Omit<BuiltLaneDefinition, 'id'>> & { provider?: string } = {},
): ILaneBuilder {
  return this._parent.lane(id, opts);
}

export function laneBarrier(
  this: ILaneBuilder,
  name: string,
  mode: 'hard' | 'soft',
  opts: { participants?: string[]; timeoutMs?: number } = {},
): IDagBuilder {
  return this._parent.barrier(name, mode, opts);
}

export function laneBuildDag(this: ILaneBuilder): BuiltDagDefinition {
  return this._parent.build();
}

// ─── DagBuilder methods ──────────────────────────────────────────────────────

export function dagDescription(this: IDagBuilder, text: string): IDagBuilder {
  this._description = text;
  return this;
}

export function dagBudget(this: IDagBuilder, usd: number): IDagBuilder {
  this._budgetUSD = usd;
  return this;
}

export function dagModelRouter(this: IDagBuilder, filePath: string): IDagBuilder {
  this._modelRouterFile = filePath;
  return this;
}

export function dagLane(
  this: IDagBuilder,
  id: string,
  opts: Partial<Omit<BuiltLaneDefinition, 'id'>> & { provider?: string } = {},
): ILaneBuilder {
  if (this._currentLane) {
    this._lanes.push(this._currentLane);
  }
  const lb = new LaneBuilder(
    id,
    { ...opts, providerOverride: opts.provider ?? opts.providerOverride },
    this,
  );
  this._currentLane = lb;
  return lb;
}

export function dagBarrier(
  this: IDagBuilder,
  name: string,
  mode: 'hard' | 'soft' = 'hard',
  opts: { participants?: string[]; timeoutMs?: number } = {},
): IDagBuilder {
  if (this._currentLane) {
    this._lanes.push(this._currentLane);
    this._currentLane = undefined;
  }
  const participants = opts.participants ?? this._lanes.map((l) => l._build().id);
  const barrier: BuiltGlobalBarrier = { name, mode, participants, timeoutMs: opts.timeoutMs };
  this._barriers.push(barrier);
  return this;
}

export function dagBuild(this: IDagBuilder): BuiltDagDefinition {
  if (this._currentLane) {
    this._lanes.push(this._currentLane);
    this._currentLane = undefined;
  }

  const capabilityRegistry: Record<string, string[]> = {};
  for (const lb of this._lanes) {
    const l = lb._build();
    for (const cap of l.capabilities) {
      (capabilityRegistry[cap] ??= []).push(l.id);
    }
  }

  return {
    name:               this._name,
    description:        this._description,
    budgetUSD:          this._budgetUSD,
    modelRouterFile:    this._modelRouterFile ?? 'model-router.json',
    lanes:              this._lanes.map((lb) => lb._build()),
    globalBarriers:     [...this._barriers],
    capabilityRegistry,
  };
}

export function dagToJSON(this: IDagBuilder, indent = 2): string {
  return JSON.stringify(this.build(), null, indent);
}

// Attach static on LaneBuilder to allow self-referential method name mapping
(LaneBuilder as unknown as Record<string, unknown>)._attachMethods = function () { /* no-op */ };
