/**
 * Arbiter — Phase 3 conflict resolution + escalation chain
 *
 * Escalation chain:
 *   1. BA tries to resolve (prefers simpler, more standard option)
 *   2. If architectural: delegate to Architecture agent
 *   3. If still unresolved OR is a product decision: escalate to User (PO)
 *
 * After a decision is made, the Arbiter broadcasts the outcome to all
 * affected agents and triggers any micro-alignments needed.
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type {
  PendingDecision,
  DecisionOption,
  ActorId,
  PlanDefinition,
  BacklogItem,
} from './plan-types.js';
import { ACTORS } from './plan-types.js';
import { ChatRenderer, promptUser, promptChoice } from './chat-renderer.js';
import type { BacklogBoard } from './backlog.js';

// ─── Decision registry ────────────────────────────────────────────────────────

export interface ArbiterDecision {
  id: string;
  question: string;
  raisedBy: ActorId;
  chosenOption: DecisionOption;
  resolvedBy: ActorId;  // 'ba' | 'architecture' | 'user'
  rationale: string;
  affectedActors: ActorId[];
  unlockedItems: string[];
  resolvedAt: string;
}

// ─── Pre-defined common conflicts ─────────────────────────────────────────────

const COMMON_DECISIONS: Record<string, Omit<PendingDecision, 'id' | 'raisedAt' | 'blockedItemIds'>> = {
  'api-style': {
    question: 'API communication style',
    context: 'The API style affects Frontend integration, Backend structure, and documentation strategy.',
    options: [
      { label: 'REST',     description: 'Standard HTTP verbs, OpenAPI spec', implications: 'Familiar, well-tooled, slightly verbose' },
      { label: 'GraphQL',  description: 'Schema-first, flexible queries',    implications: 'More powerful but higher complexity' },
      { label: 'tRPC',     description: 'Type-safe end-to-end TypeScript',   implications: 'Best for full-stack TypeScript, no client codegen' },
    ],
    raisedBy: 'architecture',
    affectedActors: ['backend', 'frontend', 'testing'],
  },
  'auth-strategy': {
    question: 'Authentication strategy',
    context: 'Auth affects every layer — API security, session handling, and frontend routing.',
    options: [
      { label: 'JWT stateless',  description: 'JSON Web Tokens, no server state',      implications: 'Simple to scale, harder to revoke' },
      { label: 'Session-based',  description: 'Server-side sessions (Redis / DB)',      implications: 'Easy revocation, requires session store' },
      { label: 'Auth0 / Clerk',  description: 'Managed identity provider',             implications: 'Fast to implement, vendor dependency' },
      { label: 'NextAuth / Lucia', description: 'Open-source auth library',             implications: 'Full control, more setup' },
    ],
    raisedBy: 'architecture',
    affectedActors: ['backend', 'frontend', 'security'],
  },
  'database': {
    question: 'Database engine',
    context: 'Database choice affects schema design, query patterns, and hosting.',
    options: [
      { label: 'PostgreSQL',  description: 'Relational, ACID, row-level security', implications: 'Best for structured data + complex queries' },
      { label: 'MongoDB',     description: 'Document store, flexible schema',       implications: 'Good for nested/variable data' },
      { label: 'SQLite',      description: 'Embedded, zero-config',                 implications: 'POC/solo use only — not production-scalable' },
      { label: 'PlanetScale', description: 'Serverless MySQL (Vitess)',              implications: 'Great for edge deployments' },
    ],
    raisedBy: 'architecture',
    affectedActors: ['backend', 'testing'],
  },
  'css-approach': {
    question: 'CSS / styling approach',
    context: 'Affects Frontend development velocity, bundle size, and design consistency.',
    options: [
      { label: 'Tailwind CSS',  description: 'Utility-first, zero runtime',     implications: 'Fast iteration, verbose HTML' },
      { label: 'CSS Modules',   description: 'Scoped CSS, build-time only',      implications: 'Clean, standard, more files' },
      { label: 'MUI / shadcn',  description: 'Full component library',           implications: 'Fastest UI, opinionated styling' },
      { label: 'Styled Components', description: 'CSS-in-JS',                   implications: 'Dynamic styles, runtime overhead' },
    ],
    raisedBy: 'frontend',
    affectedActors: ['frontend', 'e2e'],
  },
};

// ─── Arbiter ──────────────────────────────────────────────────────────────────

export class Arbiter {
  private readonly renderer: ChatRenderer;
  private readonly stateDir: string;
  private decisions: ArbiterDecision[] = [];

  constructor(renderer: ChatRenderer, projectRoot: string) {
    this.renderer = renderer;
    this.stateDir = path.join(projectRoot, '.agents', 'plan-state');
  }

  // ─── Main entry: raise a decision ─────────────────────────────────────────

  async raise(params: {
    question: string;
    context: string;
    options: DecisionOption[];
    raisedBy: ActorId;
    affectedActors: ActorId[];
    blockedItemIds: string[];
    preferSimple?: boolean;
  }): Promise<ArbiterDecision> {
    const r = this.renderer;
    const pending: PendingDecision = {
      id: randomUUID(),
      question: params.question,
      context: params.context,
      options: params.options,
      raisedBy: params.raisedBy,
      affectedActors: params.affectedActors,
      blockedItemIds: params.blockedItemIds,
      raisedAt: new Date().toISOString(),
    };

    // Step 1: BA attempts to resolve
    const baResolution = this._baResolve(pending, params.preferSimple ?? true);
    if (baResolution) {
      r.say('ba', `I can resolve this: "${params.question}" → ${baResolution.label}`);
      r.system(`Rationale: ${baResolution.description} — ${baResolution.implications}`);
      r.newline();
      return this._record(pending, baResolution, 'ba', `BA resolved: ${baResolution.implications}`);
    }

    // Step 2: Architectural question — delegate to Architecture
    const isArchitectural = params.raisedBy === 'architecture' || params.affectedActors.includes('architecture');
    if (isArchitectural && params.options.length > 0) {
      r.say('architecture', `This is in my domain — let me assess: "${params.question}"`);
      const archPick = this._architectureResolve(pending);
      if (archPick) {
        r.say('architecture', `Architecture recommendation: ${archPick.label} — ${archPick.description}`);
        r.say('ba', `Architecture has resolved this. Proceeding with: ${archPick.label}`);
        r.newline();
        return this._record(pending, archPick, 'architecture', `Architecture decided: ${archPick.implications}`);
      }
    }

    // Step 3: Escalate to User
    r.say('ba', `This requires your decision as PO. ${params.affectedActors.length} agents are waiting.`);
    r.decision(pending);

    const choice = await promptChoice(r, params.options.length);

    let chosen: DecisionOption;
    const indexFromLetter = choice.toUpperCase().charCodeAt(0) - 65;

    if (indexFromLetter >= 0 && indexFromLetter < params.options.length) {
      chosen = params.options[indexFromLetter];
    } else {
      // Custom answer
      chosen = {
        label: choice,
        description: 'Custom user-specified option',
        implications: 'Will be evaluated by affected agents',
      };
    }

    r.say('user', `Selected: ${chosen.label}`);
    this._broadcastDecision(pending, chosen, params.affectedActors);

    return this._record(pending, chosen, 'user', `PO decided: ${chosen.label}`);
  }

  // ─── Run standard decision set for a plan ────────────────────────────────

  async runStandardDecisions(
    plan: PlanDefinition,
    board: BacklogBoard,
  ): Promise<void> {
    const r = this.renderer;
    r.say('ba', 'Running standard architecture decision points…');
    r.newline();

    const hasAgent = (id: ActorId) => plan.steps.some((s) => s.agent === id);

    // Api style
    await this.raise({
      ...COMMON_DECISIONS['api-style'],
      id: undefined as never,
      raisedAt: undefined as never,
      blockedItemIds: board.getAll()
        .filter((i) => i.question.toLowerCase().includes('api'))
        .map((i) => i.id),
    } as Parameters<typeof this.raise>[0]);

    // Auth
    await this.raise({
      ...COMMON_DECISIONS['auth-strategy'],
      id: undefined as never,
      raisedAt: undefined as never,
      blockedItemIds: board.getAll()
        .filter((i) => i.question.toLowerCase().includes('auth'))
        .map((i) => i.id),
    } as Parameters<typeof this.raise>[0]);

    // Database (only if backend is in the plan)
    if (hasAgent('backend')) {
      await this.raise({
        ...COMMON_DECISIONS['database'],
        id: undefined as never,
        raisedAt: undefined as never,
        blockedItemIds: board.getAll()
          .filter((i) => i.question.toLowerCase().includes('database') || i.question.toLowerCase().includes('orm'))
          .map((i) => i.id),
      } as Parameters<typeof this.raise>[0]);
    }

    // CSS (only if frontend is in the plan)
    if (hasAgent('frontend')) {
      await this.raise({
        ...COMMON_DECISIONS['css-approach'],
        id: undefined as never,
        raisedAt: undefined as never,
        blockedItemIds: board.getAll()
          .filter((i) => i.question.toLowerCase().includes('design system') || i.question.toLowerCase().includes('css'))
          .map((i) => i.id),
      } as Parameters<typeof this.raise>[0]);
    }

    this._save();
    r.say('ba', `Arbitration complete — ${this.decisions.length} decisions recorded.`);
    r.newline();
  }

  // ─── Micro-alignment ──────────────────────────────────────────────────────

  /**
   * Run a targeted alignment between 2 agents after a key decision.
   * Returns a brief reconciliation note.
   */
  async microAlign(
    actorA: ActorId,
    actorB: ActorId,
    topic: string,
    context: string,
  ): Promise<string> {
    const r = this.renderer;
    r.say('ba', `Micro-alignment: ${topic} — engaging ${actorA} ↔ ${actorB}`);
    r.say(actorA, `Acknowledged. My concern on "${topic}": aligning on shared contract.`);
    r.say(actorB, `Confirmed. I'll consume the output from ${actorA} at this boundary.`);
    r.system(`✓ ${actorA} ↔ ${actorB} aligned on: ${topic}`);
    r.newline();
    return `${actorA} ↔ ${actorB}: ${topic} — aligned`;
  }

  // ─── Accessors ────────────────────────────────────────────────────────────

  getDecisions(): ArbiterDecision[] { return [...this.decisions]; }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * BA tries to resolve by picking the simplest/most standard option.
   * BA can auto-resolve if there is a clear "default" low-complexity option.
   */
  private _baResolve(
    pending: PendingDecision,
    preferSimple: boolean,
  ): DecisionOption | null {
    // BA only auto-resolves when there's exactly one option that is clearly
    // standard and has no major trade-off implications.
    if (!preferSimple) return null;
    const opts = pending.options;
    if (opts.length === 0) return null;
    // BA picks first option as the "default" only if it's a single-option list
    if (opts.length === 1) return opts[0];
    // For multi-option lists BA defers (product/architecture decisions)
    return null;
  }

  /**
   * Architecture agent resolves by preferring scalable, tested options.
   * Uses heuristics: picks the option whose implications mention
   * "scale", "ACID", "type-safe", "standard" etc.
   */
  private _architectureResolve(pending: PendingDecision): DecisionOption | null {
    const signals = ['standard', 'acid', 'scale', 'type-safe', 'relational', 'familiar', 'production'];
    const scored = pending.options.map((opt) => {
      const text = `${opt.label} ${opt.description} ${opt.implications}`.toLowerCase();
      const score = signals.filter((s) => text.includes(s)).length;
      return { opt, score };
    });
    scored.sort((a, b) => b.score - a.score);
    // Only auto-resolve if the top option has at least one positive signal
    return scored[0].score > 0 ? scored[0].opt : null;
  }

  private _broadcastDecision(
    pending: PendingDecision,
    chosen: DecisionOption,
    affected: ActorId[],
  ): void {
    const r = this.renderer;
    r.say('ba', `Broadcasting decision to ${affected.length} agents: "${chosen.label}"`);
    for (const actorId of affected) {
      r.say(actorId, `Decision received — "${pending.question}" → ${chosen.label}. Updating my plan.`);
    }
    r.newline();
  }

  private _record(
    pending: PendingDecision,
    chosen: DecisionOption,
    resolvedBy: ActorId,
    rationale: string,
  ): ArbiterDecision {
    const d: ArbiterDecision = {
      id: pending.id,
      question: pending.question,
      raisedBy: pending.raisedBy,
      chosenOption: chosen,
      resolvedBy,
      rationale,
      affectedActors: pending.affectedActors,
      unlockedItems: pending.blockedItemIds,
      resolvedAt: new Date().toISOString(),
    };
    this.decisions.push(d);
    return d;
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  private _save(): void {
    fs.mkdirSync(this.stateDir, { recursive: true });
    fs.writeFileSync(
      path.join(this.stateDir, 'decisions.json'),
      JSON.stringify(this.decisions, null, 2),
    );
  }
}
