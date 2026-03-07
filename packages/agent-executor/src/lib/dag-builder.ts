/**
 * G-22: TypeScript DAG Builder API — fluent, type-safe alternative to hand-writing dag.json.
 *
 * Usage:
 *   import { DagBuilder } from '@ai-agencee/engine';
 *
 *   const dag = new DagBuilder('pr-review')
 *     .budget(0.05)
 *     .lane('backend', { provider: 'anthropic' })
 *       .check({ type: 'llm-review', taskType: 'code-review', path: 'src/backend' })
 *       .check({ type: 'llm-generate', taskType: 'code-generation', prompt: 'Write unit tests' })
 *     .lane('security', { dependsOn: ['backend'] })
 *       .check({ type: 'llm-review', taskType: 'security-review', path: 'src' })
 *     .barrier('post-analysis', 'hard')
 *     .build();
 */

import type { CheckDefinition } from './agent-types.js'

// ─── Inline types (mirrors dag-types.ts without creating a circular dep) ─────

export interface BuiltLaneDefinition {
  id: string;
  agentFile?: string;
  supervisorFile?: string;
  dependsOn: string[];
  capabilities: string[];
  providerOverride?: string;
  /** Inline checks — used when agentFile is not specified */
  checks?: CheckDefinition[];
  /** Override model router config for this lane */
  modelOverrides?: Record<string, string>;
}

export interface BuiltGlobalBarrier {
  name: string;
  participants: string[];
  mode: 'hard' | 'soft';
  timeoutMs?: number;
}

export interface BuiltDagDefinition {
  name: string;
  description?: string;
  budgetUSD?: number;
  modelRouterFile?: string;
  lanes: BuiltLaneDefinition[];
  globalBarriers: BuiltGlobalBarrier[];
  capabilityRegistry: Record<string, string[]>;
}

// ─── LaneBuilder ─────────────────────────────────────────────────────────────

export class LaneBuilder {
  private readonly _lane: BuiltLaneDefinition;
  private readonly _parent: DagBuilder;

  constructor(id: string, opts: Partial<BuiltLaneDefinition>, parent: DagBuilder) {
    this._lane = {
      id,
      dependsOn: opts.dependsOn ?? [],
      capabilities: opts.capabilities ?? [],
      providerOverride: opts.providerOverride,
      agentFile: opts.agentFile,
      supervisorFile: opts.supervisorFile,
      checks: opts.checks ?? [],
      modelOverrides: opts.modelOverrides,
    };
    this._parent = parent;
  }

  /** Add a typed check to this lane's inline checks list. */
  check(definition: CheckDefinition): this {
    (this._lane.checks ??= []).push(definition);
    return this;
  }

  /** Declare a capability this lane provides (used for capability-based routing). */
  capability(cap: string): this {
    this._lane.capabilities.push(cap);
    return this;
  }

  /** Reference an existing .agent.json file instead of inline checks. */
  agentFile(path: string): this {
    this._lane.agentFile = path;
    return this;
  }

  /** Reference an existing .supervisor.json file for verdict configuration. */
  supervisorFile(path: string): this {
    this._lane.supervisorFile = path;
    return this;
  }

  /** Force a specific provider for this lane only. */
  provider(name: string): this {
    this._lane.providerOverride = name;
    return this;
  }

  /** Declare a dependency on another lane by ID. */
  dependsOn(...laneIds: string[]): this {
    this._lane.dependsOn.push(...laneIds);
    return this;
  }

  /** Return the built lane definition (called by DagBuilder.build()). */
  _build(): BuiltLaneDefinition {
    return { ...this._lane };
  }

  // ── Delegate back to DagBuilder for chaining ──────────────────────────────

  /** Add another lane after this one. */
  lane(id: string, opts: Partial<Omit<BuiltLaneDefinition, 'id'>> & { provider?: string } = {}): LaneBuilder {
    return this._parent.lane(id, opts);
  }

  /** Add a global barrier across named lanes. */
  barrier(name: string, mode: 'hard' | 'soft', opts: { participants?: string[]; timeoutMs?: number } = {}): DagBuilder {
    return this._parent.barrier(name, mode, opts);
  }

  /** Finalise and return the complete DagDefinition. */
  build(): BuiltDagDefinition {
    return this._parent.build();
  }
}

// ─── DagBuilder ──────────────────────────────────────────────────────────────

/**
 * Fluent builder for DagDefinition objects.
 * Type-safe alternative to maintaining raw dag.json files.
 */
export class DagBuilder {
  private _name: string;
  private _description?: string;
  private _budgetUSD?: number;
  private _modelRouterFile?: string;
  private _lanes: LaneBuilder[] = [];
  private _barriers: BuiltGlobalBarrier[] = [];
  private _currentLane?: LaneBuilder;

  constructor(name: string) {
    this._name = name;
  }

  /** Human-readable description for the DAG. */
  description(text: string): this {
    this._description = text;
    return this;
  }

  /** Hard budget cap in USD — run aborts when exceeded. */
  budget(usd: number): this {
    this._budgetUSD = usd;
    return this;
  }

  /** Path to model-router.json, relative to agents/ dir. */
  modelRouter(filePath: string): this {
    this._modelRouterFile = filePath;
    return this;
  }

  /**
   * Begin defining a new lane.
   * Returns a LaneBuilder scoped to that lane; call .lane()/.barrier()/.build() on it
   * to continue building or finish.
   */
  lane(id: string, opts: Partial<Omit<BuiltLaneDefinition, 'id'>> & { provider?: string } = {}): LaneBuilder {
    // Flush previous lane if open
    if (this._currentLane) {
      this._lanes.push(this._currentLane);
    }
    const lb = new LaneBuilder(
      id,
      {
        ...opts,
        providerOverride: opts.provider ?? opts.providerOverride,
      },
      this,
    );
    this._currentLane = lb;
    return lb;
  }

  /**
   * Add a global barrier synchronisation point.
   * If participants is omitted, all lanes defined so far participate.
   */
  barrier(
    name: string,
    mode: 'hard' | 'soft' = 'hard',
    opts: { participants?: string[]; timeoutMs?: number } = {},
  ): this {
    // Flush current lane if open
    if (this._currentLane) {
      this._lanes.push(this._currentLane);
      this._currentLane = undefined;
    }
    const participants = opts.participants ?? this._lanes.map((l) => l._build().id);
    this._barriers.push({ name, mode, participants, timeoutMs: opts.timeoutMs });
    return this;
  }

  /**
   * Finalise the builder and return a plain DagDefinition object.
   * Compatible with DagOrchestrator.execute().
   */
  build(): BuiltDagDefinition {
    // Flush last open lane
    if (this._currentLane) {
      this._lanes.push(this._currentLane);
      this._currentLane = undefined;
    }

    // Auto-build capability registry from lane declarations
    const capabilityRegistry: Record<string, string[]> = {};
    for (const lb of this._lanes) {
      const l = lb._build();
      for (const cap of l.capabilities) {
        (capabilityRegistry[cap] ??= []).push(l.id);
      }
    }

    return {
      name: this._name,
      description: this._description,
      budgetUSD: this._budgetUSD,
      modelRouterFile: this._modelRouterFile ?? 'model-router.json',
      lanes: this._lanes.map((lb) => lb._build()),
      globalBarriers: [...this._barriers],
      capabilityRegistry,
    };
  }

  /**
   * Serialise to JSON (useful for saving programmatic DAGs as *.dag.json files).
   */
  toJSON(indent = 2): string {
    return JSON.stringify(this.build(), null, indent);
  }
}
